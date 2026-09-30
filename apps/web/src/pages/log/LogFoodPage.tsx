import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ApiError, NetworkError } from '@clubhouse/client';
import type { FoodLogUpsert, FoodSearchResult, MealSlot, RecognitionResponse, UsualFood } from '@clubhouse/contracts';
import { slotForTime } from '@clubhouse/domain';
import { toast } from '@clubhouse/ui';
import {
  cartFromLog,
  cartToItems,
  cartTotals,
  foodLogToUpsert,
  itemFromRecipe,
  itemFromRecognised,
  itemFromSearch,
  itemFromUsual,
  optimisticFoodLog,
  quickAddItem,
  takeSharedPhoto,
  useFoodDetail,
  useFoodLogById,
  useParseMealText,
  useRecognisePhoto,
  useUploadFoodPhoto,
  type CartItem,
} from '@/features/food';
import { fmt, SLOT_LABEL } from '@/features/format';
import { useSaveFoodLog } from '@/features/logs';
import { useMeData } from '@/features/me';
import { useMoments } from '@/features/moments';
import { memberNow } from '@/features/summary';
import { compressImage } from '@/infrastructure/images';
import { nowIso, uuid } from '@/lib/ids';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { AttachedPhoto } from '@/ui/organisms/log/AttachedPhoto';
import { AnalyzingCard, CameraCapture, PhotoOffCard } from '@/ui/organisms/log/CameraCapture';
import { CreateFoodSheet, FoodSearchSheet, MyFoodsSheet, QuickAddSheet } from '@/ui/organisms/log/FoodSheets';
import { PlateReview } from '@/ui/organisms/log/PlateReview';
import { PortionSheet, type Portion } from '@/ui/organisms/log/PortionSheet';
import { SearchPanel } from '@/ui/organisms/log/SearchPanel';
import { SlotChips } from '@/ui/organisms/log/SlotChips';
import { shortDay } from '@/ui/organisms/today/dates';

type Stage = 'idle' | 'analyzing' | 'results';
interface Photo {
  url: string;
  imageId: string | null;
  status: 'local' | 'uploading' | 'ready' | 'failed';
}

/** APP-HOME-20…27: camera-first (2a) or search-first (2b) food logging into a local cart, saved as one log. */
export function LogFoodPage() {
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const search = useSearch({ from: '/shell/log/food' });
  const now = memberNow(me);
  const editId = search.edit;
  const editing = useFoodLogById(editId);
  const log = editing.data;
  const date = log?.date ?? search.date ?? now.date;
  const slotLabels = Object.fromEntries(Object.entries(SLOT_LABEL).map(([k, v]) => [k, me.team.mealSlots[k as MealSlot]?.label ?? v])) as Record<MealSlot, string>;

  const photoAi = me.ai.photoAvailable;
  const textAi = me.ai.teamOn && !!me.ai.features['food.text'];
  const [mode, setMode] = useState<'camera' | 'search'>(search.mode ?? (search.shared ? 'camera' : 'search'));
  const [slot, setSlot] = useState<MealSlot>(search.slot ?? slotForTime(now.time, me.team.mealSlots));
  const [stage, setStage] = useState<Stage>('idle');
  const [resultsFrom, setResultsFrom] = useState<'photo' | 'text'>('photo');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [aiCallId, setAiCallId] = useState<string | null>(null);
  const [portion, setPortion] = useState<{ food: FoodSearchResult; replaceKey?: string; initial?: Portion } | null>(null);
  const [searchSheet, setSearchSheet] = useState<{ replaceKey?: string } | null>(null);
  const [sheet, setSheet] = useState<'quick' | 'create' | 'mine' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const recognise = useRecognisePhoto();
  const parse = useParseMealText();
  const upload = useUploadFoodPhoto();
  const saveFood = useSaveFoodLog();
  const foodDetail = useFoodDetail();
  const pushEffects = useMoments((s) => s.pushEffects);

  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/', search: {} }));
  const done = () => void navigate({ to: '/', search: date === now.date ? {} : { date }, replace: true });

  // Edit mode: load the saved log into the cart once.
  const loaded = useRef(false);
  useEffect(() => {
    if (!log || loaded.current) return;
    loaded.current = true;
    setCart(cartFromLog(log));
    setSlot(log.mealSlot);
    setMode('search');
    setAiCallId(log.aiCallId);
    const thumb = !log.imageExpired ? (log.thumbUrl ?? log.imageUrl) : null;
    if (thumb) setPhoto({ url: thumb, imageId: null, status: 'ready' });
  }, [log]);

  // ── cart ──
  const addItem = (item: CartItem, opts: { quiet?: boolean } = {}) => {
    setCart((c) => [...c, item]);
    if (!opts.quiet) toast.show(`${item.name} added`, { action: { label: 'Undo', onClick: () => setCart((c) => c.filter((i) => i.key !== item.key)) } });
  };
  const replaceItem = (key: string, item: CartItem) => setCart((c) => c.map((i) => (i.key === key ? item : i)));
  const removeItem = (key: string) => {
    const idx = cart.findIndex((i) => i.key === key);
    const item = cart[idx];
    if (!item) return;
    setCart((c) => c.filter((i) => i.key !== key));
    toast.show(`${item.name} removed`, { action: { label: 'Undo', onClick: () => setCart((c) => [...c.slice(0, idx), item, ...c.slice(idx)]) } });
  };
  const setQty = (key: string, qty: number) => setCart((c) => c.map((i) => (i.key === key ? { ...i, qty } : i)));

  const addResult = (r: FoodSearchResult) => {
    if (searchSheet?.replaceKey) {
      replaceItem(searchSheet.replaceKey, itemFromSearch(r));
      setSearchSheet(null);
      toast.show(`Swapped for ${r.name}`);
    } else addItem(itemFromSearch(r));
  };
  const addUsual = (u: UsualFood) => {
    const item = itemFromUsual(u);
    if (searchSheet?.replaceKey) {
      replaceItem(searchSheet.replaceKey, item);
      setSearchSheet(null);
    } else addItem(item);
    // Usuals only carry kcal: fill in the full nutrition in the background.
    foodDetail(u.id)
      .then((f) => setCart((c) => c.map((i) => (i.key === item.key ? { ...i, per100g: f.per100g, perUnit: null, servingOptions: f.servingOptions, aiEstimate: f.aiEstimate } : i))))
      .catch(() => undefined);
  };
  const openPortion = (food: FoodSearchResult, replaceKey?: string, initial?: Portion) => {
    setSearchSheet(null);
    setPortion({ food, replaceKey: replaceKey ?? searchSheet?.replaceKey, initial });
  };
  const editPortion = async (key: string) => {
    const item = cart.find((i) => i.key === key);
    if (!item?.foodId) return;
    try {
      const f = await foodDetail(item.foodId);
      openPortion(f, key, { label: item.unitLabel, grams: item.unitGrams, qty: item.qty });
    } catch {
      toast.error('Couldn’t load that food’s portions.');
    }
  };

  // ── photos ──
  const attachUpload = (blob: Blob) => {
    setPhoto((p) => (p ? { ...p, status: 'uploading' } : p));
    upload.mutate(blob, {
      onSuccess: (r) => setPhoto((p) => (p ? { ...p, imageId: r.id, status: 'ready' } : p)),
      onError: () => setPhoto((p) => (p ? { ...p, status: 'failed' } : p)),
    });
  };
  const couldntTell = (r: RecognitionResponse | null, blob: Blob) => {
    toast.show(r?.message ? `Couldn’t quite tell — ${r.message}` : 'Couldn’t quite tell. Search for it and the photo stays attached.');
    setStage('idle');
    setMode('search');
    if (r?.imageId) setPhoto((p) => (p ? { ...p, imageId: r.imageId, status: 'ready' } : p));
    else attachUpload(blob);
  };
  // Guards against a slow answer landing after "Search instead" or a retake.
  const run = useRef(0);
  const analyse = (blob: Blob) => {
    setStage('analyzing');
    const mine = ++run.current;
    recognise.mutate(
      { blob, slot },
      {
        onSuccess: (r) => {
          if (mine !== run.current) return;
          if (r.callId) setAiCallId(r.callId);
          if (!r.ok || r.lowConfidence || !r.items.length) return couldntTell(r, blob);
          setPhoto((p) => (p ? { ...p, imageId: r.imageId, status: r.imageId ? 'ready' : p.status } : p));
          if (!r.imageId) attachUpload(blob);
          setCart((c) => [...c.filter((i) => i.source !== 'ai'), ...r.items.map(itemFromRecognised)]);
          setResultsFrom('photo');
          setStage('results');
        },
        onError: (e) => {
          if (mine !== run.current) return;
          if (e instanceof NetworkError) {
            toast.error('You’re offline — photo reading needs a connection. Search your usuals instead.');
            setStage('idle');
            setMode('search');
            setPhoto(null);
            return;
          }
          if (e instanceof ApiError && e.status !== 429 && e.status < 500) toast.error(e.message);
          couldntTell(null, blob);
        },
      },
    );
  };
  const handlePhoto = async (raw: Blob) => {
    let c: Awaited<ReturnType<typeof compressImage>>;
    try {
      c = await compressImage(raw);
    } catch {
      toast.error('Couldn’t read that photo. Try another one.');
      return;
    }
    setPhotoRemoved(false);
    setPhoto({ url: c.previewUrl, imageId: null, status: 'local' });
    if (photoAi) analyse(c.blob);
    else attachUpload(c.blob);
  };

  // Share target: a photo shared into the app lands here once.
  const sharedTaken = useRef(false);
  const handlePhotoRef = useRef(handlePhoto);
  handlePhotoRef.current = handlePhoto;
  useEffect(() => {
    if (!search.shared || sharedTaken.current) return;
    sharedTaken.current = true;
    void takeSharedPhoto().then((b) => {
      if (b) void handlePhotoRef.current(b);
      else toast.show('That share didn’t include a photo.');
    });
  }, [search.shared]);

  const parseText = (text: string) =>
    parse.mutate(
      { text, slot },
      {
        onSuccess: (r) => {
          if (r.callId) setAiCallId(r.callId);
          if (!r.ok || !r.items.length) {
            toast.show('Couldn’t quite tell. Try one food at a time.');
            return;
          }
          setCart((c) => [...c, ...r.items.map(itemFromRecognised)]);
          setResultsFrom('text');
          setStage('results');
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'AI parsing needs a connection. Search works offline for your usuals.'),
      },
    );

  const retake = () => {
    setCart((c) => c.filter((i) => i.source !== 'ai'));
    setPhoto(null);
    setAiCallId(null);
    setStage('idle');
    setMode(resultsFrom === 'photo' && photoAi ? 'camera' : 'search');
  };

  // ── save ──
  const totals = cartTotals(cart);
  const uploading = photo?.status === 'uploading';
  const save = () => {
    if (!cart.length) return;
    const id = editId ?? uuid();
    const stamp = nowIso();
    const hasAi = cart.some((i) => i.source === 'ai');
    const data: FoodLogUpsert = {
      date,
      mealSlot: slot,
      loggedAt: log?.loggedAt ?? stamp,
      items: cartToItems(cart),
      // Editing: undefined keeps the saved photo; null removes it.
      imageId: photo?.imageId ?? (editId && !photoRemoved ? undefined : null),
      aiCallId: hasAi ? aiCallId : null,
      note: log?.note ?? null,
      clientUpdatedAt: stamp,
    };
    saveFood.mutate(
      { id, data, optimistic: optimisticFoodLog(id, data, { thumbUrl: photo?.url ?? null }) },
      {
        onSuccess: (r) => {
          if (!r.queued) toast.success(editId ? 'Changes saved' : `${fmt(totals.kcal)} kcal added to ${slotLabels[slot].toLowerCase()}`);
          pushEffects(r.effects);
          done();
        },
      },
    );
  };
  const del = () => {
    if (!log) return;
    saveFood.mutate({ id: log.id, data: foodLogToUpsert(log, { deleted: true }), optimistic: { ...log, deleted: true } }, { onSuccess: () => toast.show('Log removed') });
    setConfirmDelete(false);
    done();
  };

  const searchProps = {
    slot,
    onAdd: addResult,
    onAddUsual: addUsual,
    onOpen: (r: FoodSearchResult) => openPortion(r),
    onParse: textAi ? parseText : undefined,
    parsing: parse.isPending,
  };

  if (editId && editing.isPending) {
    return (
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader title="Edit log" onBack={back} />
        <Skeleton h={40} r={999} />
        <Skeleton h={140} r={26} />
        <Skeleton h={54} r={999} />
      </div>
    );
  }
  if (editId && editing.isError) {
    return (
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader title="Edit log" onBack={back} />
        <EmptyState title="Couldn’t open that log" body="It may have been deleted, or you’re offline." action={<Button variant="dark" onClick={() => void editing.refetch()}>Try again</Button>} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-3.5 px-5 pb-10 pt-2">
      <StackHeader
        title={editId ? 'Edit log' : 'Log food'}
        subtitle={date !== now.date ? `For ${shortDay(date)}` : undefined}
        onBack={back}
        right={
          editId ? (
            <IconButton label="Delete this log" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.75} />
            </IconButton>
          ) : undefined
        }
      />
      <SlotChips value={slot} onChange={setSlot} labels={slotLabels} />

      <AnimatePresence mode="wait" initial={false}>
        {stage === 'analyzing' && photo && (
          <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <AnalyzingCard
              url={photo.url}
              onCancel={() => {
                run.current += 1;
                recognise.reset();
                setStage('idle');
                setMode('search');
                setPhoto(null);
              }}
            />
          </motion.div>
        )}

        {stage === 'results' && (
          <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <PlateReview
              title={`Found ${cart.length} ${cart.length === 1 ? 'thing' : 'things'}`}
              subtitle="Check portions — numbers come from our food database."
              photoUrl={resultsFrom === 'photo' ? (photo?.url ?? null) : undefined}
              cart={cart}
              onQty={setQty}
              onRemove={removeItem}
              onSwap={(key) => setSearchSheet({ replaceKey: key })}
              onPortion={(key) => void editPortion(key)}
              onAddMore={() => setSearchSheet({})}
              footer={
                <div className="flex gap-2">
                  <Button variant="secondary" size="lg" className="flex-1 text-[15px]" onClick={retake}>
                    {resultsFrom === 'photo' ? 'Retake' : 'Start over'}
                  </Button>
                  <Button size="lg" className="flex-[2] text-[16px]" disabled={!cart.length || uploading} loading={saveFood.isPending} onClick={save}>
                    Add to {slotLabels[slot].toLowerCase()}
                  </Button>
                </div>
              }
            />
          </motion.div>
        )}

        {stage === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3.5">
            {mode === 'camera' && !photo && (
              <>
                {photoAi ? <CameraCapture onPhoto={(b) => void handlePhoto(b)} /> : <PhotoOffCard reason={me.ai.teamOn && me.profile.aiOptOuts.photo ? 'optout' : 'team'} onAttach={(b) => void handlePhoto(b)} />}
                <div className="mt-1 text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">Or search</div>
              </>
            )}
            {photo && (
              <AttachedPhoto
                url={photo.url}
                status={photo.status}
                onRemove={() => {
                  setPhoto(null);
                  setPhotoRemoved(true);
                }}
              />
            )}
            {cart.length > 0 && <PlateReview title={editId ? 'In this log' : 'Your plate'} cart={cart} onQty={setQty} onRemove={removeItem} onPortion={(key) => void editPortion(key)} />}
            <SearchPanel
              {...searchProps}
              onCamera={photoAi && mode === 'search' && !photo ? () => setMode('camera') : undefined}
              onQuickAdd={() => setSheet('quick')}
              onCreate={() => setSheet('create')}
              onMyFoods={() => setSheet('mine')}
              autoFocus={mode === 'search' && !editId && !search.shared}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stage === 'idle' && cart.length > 0 && (
          <motion.div
            key="save"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="sticky z-10 mt-auto"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <Button size="lg" block className="shadow-lg" loading={saveFood.isPending} disabled={uploading} onClick={save}>
              {uploading ? 'Attaching photo…' : editId ? `Save changes · ${fmt(totals.kcal)} kcal` : `Add to ${slotLabels[slot].toLowerCase()} · ${fmt(totals.kcal)} kcal`}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <PortionSheet
        food={portion?.food ?? null}
        initial={portion?.initial}
        confirmLabel={portion?.replaceKey ? 'Update' : 'Add'}
        onClose={() => setPortion(null)}
        onConfirm={(p) => {
          if (!portion) return;
          const item = itemFromSearch(portion.food, p);
          if (portion.replaceKey) replaceItem(portion.replaceKey, item);
          else addItem(item);
          setPortion(null);
        }}
      />
      <FoodSearchSheet open={!!searchSheet} title={searchSheet?.replaceKey ? 'Swap for…' : 'Add more'} onClose={() => setSearchSheet(null)} {...searchProps} onParse={undefined} />
      <QuickAddSheet open={sheet === 'quick'} onClose={() => setSheet(null)} onAdd={(name, n) => addItem(quickAddItem(name, n))} />
      <CreateFoodSheet open={sheet === 'create'} onClose={() => setSheet(null)} onCreated={(f) => addItem(itemFromSearch(f), { quiet: true })} />
      <MyFoodsSheet
        open={sheet === 'mine'}
        onClose={() => setSheet(null)}
        onAddFood={(f) => addItem(itemFromSearch(f))}
        onAddRecipe={(r) => addItem(itemFromRecipe(r))}
        onCreate={() => setSheet('create')}
      />
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={del} title="Delete this log?" body="It comes off your day and your totals update straight away." confirmLabel="Delete" danger />
    </div>
  );
}
