import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type { FoodLogDto, FoodLogUpsert, FoodSearchResult, MealSlot, RecipeDto, UsualFood } from '@clubhouse/contracts';
import { slotForTime, zonedToUtc } from '@clubhouse/domain';
import { toast, useOnline } from '@clubhouse/ui';
import type { logFoodSearch } from '@/app/routes';
import { pointsSuffix } from '@/features/board';
import {
  cartFromLog,
  cartToItems,
  cartTotals,
  foodLogToUpsert,
  itemFromRecipe,
  itemFromSearch,
  itemFromUsual,
  optimisticFoodLog,
  takeSharedPhoto,
  uploadFoodPhoto,
  useFoodDetail,
  useParseMealText,
  useRecognisePhoto,
  type CartItem,
} from '@/features/food';
import { fmt, SLOT_LABEL } from '@/features/format';
import { qk } from '@/features/keys';
import { useSaveFoodLog } from '@/features/logs';
import type { Me } from '@/features/me';
import { cancelDraftReset, dishFromLine, dishFromRecipe, emptyDish, photoBlobs, readingState, readStateFrom, scheduleDraftReset, useMealDraft, type MealDraft, type MealPhoto } from '@/features/mealDraft';
import { useMoments } from '@/features/moments';
import { memberNow } from '@/features/summary';
import { compressImage } from '@/infrastructure/images';
import { outbox } from '@/infrastructure/outbox';
import { nowIso, uuid } from '@/lib/ids';
import type { MealFlow, MealView, ViewParams } from './mealFlow';

type Search = z.infer<typeof logFoodSearch>;

/** The meal's own search params: the view params and the one-shot legacy entries (mode, shared, q) are dropped. */
const baseOf = (s: Search): Search => ({ ...(s.slot ? { slot: s.slot } : {}), ...(s.date ? { date: s.date } : {}), ...(s.edit ? { edit: s.edit } : {}) });

const store = () => useMealDraft.getState();

function draftFromLog(log: FoodLogDto): Pick<MealDraft, 'key' | 'date' | 'slot'> & Partial<MealDraft> {
  // The meal screen shows the photo full width and full screen, so the main image, not the list thumbnail.
  const photo = !log.imageExpired ? (log.imageUrl ?? log.thumbUrl) : null;
  const aiCount = log.items.filter((i) => i.source === 'ai').length;
  return {
    key: log.id,
    date: log.date,
    slot: log.mealSlot,
    plate: cartFromLog(log),
    photo: photo ? { clientId: uuid(), previewUrl: photo, imageId: log.imageId, status: 'ready', ai: aiCount > 0, aiCount } : null,
    aiCallId: log.aiCallId,
    loaded: true,
  };
}

/** A reload loses in-flight work: the AI read and the photo bytes live only in this page. */
function afterReload(d: MealDraft): Partial<MealDraft> | null {
  const p: Partial<MealDraft> = {};
  if (d.read?.kind === 'reading') p.read = null;
  if (d.photo && (d.photo.status === 'local' || d.photo.status === 'uploading') && !photoBlobs.has(d.photo.clientId)) p.photo = { ...d.photo, status: 'failed' };
  return Object.keys(p).length ? p : null;
}

/** The photo fields of a save: keep, replace or remove the photo; an offline photo is found by its client id. */
function imageFields(d: MealDraft, editing: boolean): Pick<FoodLogUpsert, 'imageId' | 'imageClientId'> {
  const p = d.photo;
  if (p?.imageId) return { imageId: p.imageId };
  if (p && p.status !== 'failed') return { imageClientId: p.clientId };
  if (editing) return d.photoRemoved ? { imageId: null } : {};
  return { imageId: null };
}

const hasAiItems = (plate: CartItem[]) => plate.some((i) => i.source === 'ai' || i.components?.some((c) => c.source === 'ai'));

/**
 * The meal flow behind the Meal screen and its views: the draft's lifecycle, view navigation (each view is a history
 * entry), the photo pipeline (compress → AI read or upload → offline queue) and saving. Null until the draft is ready.
 */
export function useMealController(me: Me, search: Search, log: FoodLogDto | null): MealFlow | null {
  const router = useRouter();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const online = useOnline();
  const draft = useMealDraft((s) => s.draft);
  const pushed = useRouterState({ select: (s) => !!s.location.state.mealView });
  const saveFood = useSaveFoodLog();
  const recognise = useRecognisePhoto();
  const parse = useParseMealText();
  const foodDetail = useFoodDetail();
  const pushEffects = useMoments((s) => s.pushEffects);
  const [focusTick, setFocusTick] = useState(0);
  const [searchKey, setSearchKey] = useState(0);
  // Guards against a slow AI answer landing after a retake, a removed photo or leaving the read.
  const run = useRef(0);
  const key = log?.id ?? 'new';
  const tz = me.profile.timezone || me.team.timezone;
  const view = search.view ?? null;
  const ready = draft?.key === key;
  const slotLabel = (s: MealSlot) => me.team.mealSlots[s]?.label ?? SLOT_LABEL[s];
  const photoAi = me.ai.photoAvailable && online;

  // Latest values for async work: a photo takes a moment to compress, and the view may change meanwhile.
  const latest = useRef({ view, pushed, search });
  useLayoutEffect(() => {
    latest.current = { view, pushed, search };
  });

  // Start (or resume, after a reload) the draft for this meal; leaving the flow clears it.
  useLayoutEffect(() => {
    cancelDraftReset();
    const d = store().draft;
    if (d?.key !== key) {
      const now = memberNow(me);
      store().start(log ? draftFromLog(log) : { key: 'new', date: search.date ?? now.date, slot: search.slot ?? slotForTime(now.time, me.team.mealSlots) });
    } else {
      const fix = afterReload(d);
      if (fix) store().patch(fix);
    }
    return scheduleDraftReset;
    // Once per meal: later changes to me or the URL don't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // ── navigation ──
  const openView = (v: MealView, p: ViewParams = {}) => void navigate({ to: '/log/food', search: { ...baseOf(latest.current.search), view: v, ...p }, state: { mealView: true } });
  const replaceView = (v: MealView | null, p: ViewParams = {}) =>
    void navigate({ to: '/log/food', search: { ...baseOf(latest.current.search), ...(v ? { view: v, ...p } : {}) }, replace: true, state: { mealView: v ? latest.current.pushed : false } });
  const closeView = () => (latest.current.pushed ? router.history.back() : replaceView(null));
  const exitFlow = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: '/', search: {}, replace: true }));
  const closeCamera = () => {
    const d = store().draft;
    if (!latest.current.pushed && !log && !d?.plate.length && !d?.photo) exitFlow();
    else closeView();
  };
  const done = (date: string) => void navigate({ to: '/', search: date === memberNow(me).date ? {} : { date }, replace: true });
  const focusSearch = () => setFocusTick((t) => t + 1);

  // ── plate ──
  const addItems = (items: CartItem[], opts: { toast?: string | false } = {}) => {
    if (!items.length) return;
    store().addItems(items);
    if (opts.toast === false) return;
    const keys = new Set(items.map((i) => i.key));
    toast.show(opts.toast ?? (items.length === 1 ? `${items[0]!.name} added` : `${items.length} things added`), { action: { label: 'Undo', onClick: () => store().patch((d) => ({ plate: d.plate.filter((i) => !keys.has(i.key)) })) } });
  };
  const removeItem = (key: string) => {
    const r = store().removeItem(key);
    if (r) toast.show(`${r.item.name} removed`, { action: { label: 'Undo', onClick: () => store().restoreItem(r.item, r.index) } });
  };
  const fetchRecipe = (id: string) => qc.fetchQuery({ queryKey: qk.recipe(id), queryFn: () => api.recipes.get(id), staleTime: 60_000 });
  const addResult = async (r: FoodSearchResult) => {
    if (r.recipeId) {
      try {
        addItems([itemFromRecipe(await fetchRecipe(r.recipeId))]);
        return;
      } catch {
        // Offline and not cached: the recipe's own food logs as one serving.
      }
    }
    addItems([itemFromSearch(r)]);
  };
  const addUsual = (u: UsualFood) => {
    const item = itemFromUsual(u);
    addItems([item]);
    // Usuals carry only calories: fill in the rest without touching a portion changed meanwhile.
    foodDetail(u.id)
      .then((f) => store().patch((d) => ({ plate: d.plate.map((i) => (i.key === item.key ? { ...i, per100g: f.per100g, perUnit: null, servingOptions: f.servingOptions, aiEstimate: f.aiEstimate, tags: f.tags, recipeId: f.recipeId } : i)) })))
      .catch(() => undefined);
  };
  const openDish = async (from: { line?: CartItem; recipeId?: string; recipe?: RecipeDto } = {}) => {
    if (from.line) {
      store().patch({ dish: dishFromLine(from.line) });
      return openView('dish');
    }
    if (from.recipe || from.recipeId) {
      try {
        const r = from.recipe ?? (await fetchRecipe(from.recipeId!));
        store().patch({ dish: dishFromRecipe(r) });
        openView('dish', { recipe: r.id });
      } catch {
        toast.error('Couldn’t open that recipe. Check your connection and try again.');
      }
      return;
    }
    store().patch({ dish: emptyDish() });
    openView('dish');
  };

  // ── photo ──
  const setPhoto = (clientId: string, p: Partial<MealPhoto>) => store().patch((d) => (d.photo?.clientId === clientId ? { photo: { ...d.photo, ...p } } : {}));
  /** Upload the photo now, or queue it when offline (it uploads before the meal that uses it syncs). */
  const attach = async (clientId: string) => {
    const blob = photoBlobs.get(clientId);
    if (!blob) return setPhoto(clientId, { status: 'failed' });
    const queue = async () => {
      await outbox.enqueue({ kind: 'image', id: clientId, data: { blob, kind: 'food' } });
      setPhoto(clientId, { status: 'offline' });
    };
    if (!navigator.onLine) return queue();
    setPhoto(clientId, { status: 'uploading' });
    try {
      const r = await uploadFoodPhoto({ blob, clientId });
      setPhoto(clientId, { imageId: r.id, status: 'ready' });
    } catch (e) {
      if (e instanceof NetworkError) await queue();
      else setPhoto(clientId, { status: 'failed' });
    }
  };
  const analyse = async (clientId: string, blob: Blob) => {
    const mine = ++run.current;
    try {
      const r = await recognise.mutateAsync({ blob, clientId, slot: store().draft?.slot ?? 'lunch' });
      if (mine !== run.current) return;
      store().patch((d) => ({ aiCallId: r.callId ?? d.aiCallId, read: readStateFrom(r, 'photo') }));
      if (r.imageId) setPhoto(clientId, { imageId: r.imageId, status: 'ready' });
      else void attach(clientId);
    } catch (e) {
      if (mine !== run.current) return;
      void attach(clientId);
      if (e instanceof NetworkError) {
        store().patch({ read: null });
        toast.show('You’re offline — the photo is on your meal. Add the foods and it all syncs later.');
        if (latest.current.view === 'read') closeView();
        return;
      }
      store().patch({ read: { ...readingState('photo'), kind: 'low', message: e instanceof ApiError ? e.message : 'Couldn’t quite tell what’s on the plate. Search for it — the photo stays on your meal.' } });
    }
  };
  const takePhoto = async (raw: Blob) => {
    let c: Awaited<ReturnType<typeof compressImage>>;
    try {
      c = await compressImage(raw);
    } catch {
      toast.error('Couldn’t read that photo. Try another one.');
      return;
    }
    const old = store().draft?.photo;
    if (old) {
      if (old.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(old.previewUrl);
      photoBlobs.delete(old.clientId);
    }
    const clientId = uuid();
    photoBlobs.set(clientId, c.blob);
    run.current += 1;
    const ai = photoAi && navigator.onLine;
    store().patch({ photo: { clientId, previewUrl: c.previewUrl, imageId: null, status: 'local', ai: false, aiCount: 0 }, photoRemoved: false, read: ai ? readingState('photo') : null });
    const from = latest.current.view;
    if (ai) {
      if (from === 'snap') replaceView('read');
      else openView('read');
      void analyse(clientId, c.blob);
    } else {
      if (from === 'snap') closeView();
      focusSearch();
      void attach(clientId);
    }
  };
  const removePhoto = () => {
    const p = store().draft?.photo;
    if (!p) return;
    run.current += 1;
    if (p.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl);
    photoBlobs.delete(p.clientId);
    if (p.status === 'offline') void outbox.discard(`image:${p.clientId}`);
    store().patch({ photo: null, photoRemoved: true, read: null });
  };

  // Leaving the read while it's still reading (back, the edge swipe): stop waiting, keep the photo.
  const prevView = useRef(view);
  useEffect(() => {
    const was = prevView.current;
    prevView.current = view;
    const d = store().draft;
    if (was !== 'read' || view === 'read' || d?.read?.kind !== 'reading') return;
    run.current += 1;
    store().patch({ read: null });
    if (d.photo && !d.photo.imageId && d.photo.status === 'local') void attach(d.photo.clientId);
    // attach is recreated each render; this only reacts to the view changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const openDishInPlace = async (id: string) => {
    try {
      store().patch({ dish: dishFromRecipe(await fetchRecipe(id)) });
    } catch {
      toast.error('Couldn’t open that recipe.');
      replaceView(null);
    }
  };

  // A view whose state is gone (after a reload, or a stale link) falls back to the meal — or rebuilds a recipe dish.
  useEffect(() => {
    if (!ready || !draft) return;
    if (view === 'read' && !draft.read) replaceView(null);
    if (view === 'dish' && !draft.dish) {
      if (search.recipe) void openDishInPlace(search.recipe);
      else store().patch({ dish: emptyDish() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view, !!draft?.read, !!draft?.dish]);

  // Legacy entry points: mode=camera opens the camera view; a photo shared into the app is taken once.
  const takePhotoRef = useRef(takePhoto);
  useLayoutEffect(() => {
    takePhotoRef.current = takePhoto;
  });
  const entryDone = useRef(false);
  useEffect(() => {
    if (!ready || entryDone.current) return;
    entryDone.current = true;
    if (search.shared) {
      replaceView(null);
      void takeSharedPhoto().then((b) => {
        if (b) void takePhotoRef.current(b);
        else toast.show('That share didn’t include a photo.');
      });
    } else if (search.mode === 'camera' && !search.view) replaceView('snap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ── text ──
  const parseText = async (text: string) => {
    const mine = ++run.current;
    store().patch({ read: readingState('text', text) });
    openView('read');
    try {
      const r = await parse.mutateAsync({ text, slot: store().draft?.slot ?? 'lunch' });
      if (mine !== run.current) return;
      store().patch((d) => ({ aiCallId: r.callId ?? d.aiCallId, read: readStateFrom(r, 'text', text) }));
    } catch (e) {
      if (mine !== run.current) return;
      store().patch({ read: null });
      toast.error(e instanceof ApiError ? e.message : 'Reading it needs a connection. Search works offline for your usuals.');
      if (latest.current.view === 'read') closeView();
    }
  };

  // ── save ──
  const loggedAt = (d: MealDraft, stamp: string) => (d.time ? zonedToUtc(d.date, d.time, tz).toISOString() : (log?.loggedAt ?? stamp));
  /** An offline photo queued earlier uploads first when we're back online, so the save can find it. */
  const flushPhoto = async (d: MealDraft) => {
    if (d.photo?.status === 'offline' && navigator.onLine) await outbox.flush().catch(() => undefined);
  };
  // One save at a time, including the moment an offline photo is being flushed first (a double tap must not log twice).
  const saving = useRef(false);
  const save = async () => {
    const d = store().draft;
    if (!d?.plate.length || saving.current || saveFood.isPending) return;
    if (d.photo?.status === 'local' || d.photo?.status === 'uploading') return;
    saving.current = true;
    await flushPhoto(d);
    const id = log?.id ?? uuid();
    const stamp = nowIso();
    const data: FoodLogUpsert = {
      date: d.date,
      mealSlot: d.slot,
      loggedAt: loggedAt(d, stamp),
      items: cartToItems(d.plate),
      ...imageFields(d, !!log),
      aiCallId: hasAiItems(d.plate) ? d.aiCallId : null,
      note: log?.note ?? null,
      clientUpdatedAt: stamp,
    };
    const kcal = cartTotals(d.plate).kcal;
    const thumbUrl = d.photo?.previewUrl ?? (log && !d.photoRemoved ? log.thumbUrl : null);
    saveFood.mutate(
      { id, data, optimistic: optimisticFoodLog(id, data, { thumbUrl, imageId: d.photo?.imageId ?? null }) },
      {
        onSuccess: (r) => {
          if (!r.queued) toast.success(log ? 'Changes saved' : `${fmt(kcal)} kcal added to ${slotLabel(d.slot).toLowerCase()}${pointsSuffix(r.effects)}`);
          pushEffects(r.effects);
          done(d.date);
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  };
  const finishLater = async () => {
    const d = store().draft;
    if (!d?.photo || saving.current || saveFood.isPending) return;
    if (d.photo.status === 'failed') {
      toast.error('The photo didn’t attach. Add the foods, or retake it.');
      return;
    }
    if (d.photo.status === 'local' || d.photo.status === 'uploading') return;
    saving.current = true;
    await flushPhoto(d);
    const id = log?.id ?? uuid();
    const stamp = nowIso();
    const data: FoodLogUpsert = { date: d.date, mealSlot: d.slot, loggedAt: loggedAt(d, stamp), items: [], pendingDetails: true, ...imageFields(d, !!log), aiCallId: null, note: log?.note ?? null, clientUpdatedAt: stamp };
    saveFood.mutate(
      { id, data, optimistic: optimisticFoodLog(id, data, { thumbUrl: d.photo.previewUrl, imageId: d.photo.imageId }) },
      {
        onSuccess: (r) => {
          if (!r.queued) toast.success(`${slotLabel(d.slot)} saved · add what’s in it when you’re ready${pointsSuffix(r.effects)}`);
          pushEffects(r.effects);
          done(d.date);
        },
        onSettled: () => {
          saving.current = false;
        },
      },
    );
  };
  const deleteLog = () => {
    if (!log) return;
    saveFood.mutate({ id: log.id, data: foodLogToUpsert(log, { deleted: true }), optimistic: { ...log, deleted: true } }, { onSuccess: () => toast.show(`${slotLabel(log.mealSlot)} deleted`) });
    done(log.date);
  };

  if (!ready || !draft) return null;
  return {
    me,
    draft,
    editing: log,
    slotLabel,
    photoAi,
    textAi: me.ai.teamOn && !!me.ai.features['food.text'] && online,
    view,
    params: { food: search.food, recipe: search.recipe, row: search.row, into: search.into, name: search.name },
    openView,
    replaceView,
    closeView,
    exitFlow,
    closeCamera,
    addItems,
    replaceItem: (key, item) => store().replaceItem(key, item),
    removeItem,
    addResult: (r) => void addResult(r),
    addUsual,
    openDish: (from) => void openDish(from),
    takePhoto,
    removePhoto,
    parseText: (text) => void parseText(text),
    parsing: parse.isPending,
    save: () => void save(),
    finishLater: () => void finishLater(),
    deleteLog,
    saving: saveFood.isPending,
    focusTick,
    focusSearch,
    searchKey,
    clearSearch: () => setSearchKey((k) => k + 1),
  };
}

