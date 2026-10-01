import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type {
  CatalogFood,
  DietOptionDto,
  FoodDetail,
  FoodLogDto,
  FoodLogItemInput,
  FoodLogUpsert,
  FoodSearchResponse,
  FoodSearchResult,
  MealSlot,
  Nutrients,
  RecipeDto,
  RecognisedItemDto,
  ServingOptionDto,
  UsualFood,
} from '@clubhouse/contracts';
import { nutritionFor, round1 } from '@clubhouse/domain';
import { useDebounced, useOnline } from '@clubhouse/ui';
import { useMemo } from 'react';
import { useCollectionStatus } from '@/infrastructure/cache';
import { catalogFood, foodCatalog, searchCatalog, toSearchResult } from '@/infrastructure/cache/foodCatalog';
import { outbox } from '@/infrastructure/outbox';
import { nowIso, uuid } from '@/lib/ids';
import { qk } from './keys';

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const;

export type CartSource = FoodLogItemInput['source'];

/**
 * One line of the pending log. Quantity is counted in `unitLabel` units of `unitGrams` each; nutrition comes from
 * per-100 g values when known, else from a fixed per-unit value (quick add, recipes, AI estimates without grams).
 */
export interface CartItem {
  key: string;
  foodId: string | null;
  name: string;
  unitLabel: string;
  unitGrams: number;
  qty: number;
  per100g: Nutrients | null;
  perUnit: Nutrients | null;
  source: CartSource;
  aiEstimate: boolean;
  confidence: number | null;
  servingOptions: ServingOptionDto[];
  dietOptionId?: string | null;
}

const scale = (n: Nutrients, k: number): Nutrients => ({ kcal: round1(n.kcal * k), protein: round1(n.protein * k), carbs: round1(n.carbs * k), fat: round1(n.fat * k), fibre: round1(n.fibre * k) });

export function sumNutrients(list: Nutrients[]): Nutrients {
  const t = { ...ZERO };
  for (const n of list) for (const k of KEYS) t[k] += n[k];
  return t;
}

export function itemNutrition(i: CartItem): Nutrients {
  if (i.per100g && i.unitGrams > 0) return nutritionFor(i.per100g, i.unitGrams * i.qty);
  if (i.perUnit) return scale(i.perUnit, i.qty);
  return ZERO;
}

export const cartTotals = (cart: CartItem[]) => sumNutrients(cart.map(itemNutrition));

export function itemFromSearch(r: FoodSearchResult, portion?: { label: string; grams: number; qty: number }): CartItem {
  return {
    key: uuid(),
    foodId: r.id,
    name: r.name,
    unitLabel: portion?.label ?? r.servingLabel,
    unitGrams: portion?.grams ?? r.servingGrams,
    qty: portion?.qty ?? 1,
    per100g: r.per100g,
    perUnit: null,
    source: 'search',
    aiEstimate: r.aiEstimate,
    confidence: null,
    servingOptions: r.servingOptions,
  };
}

/** Usuals carry only kcal; the item is added at once and hydrated with full nutrition in the background. */
export function itemFromUsual(u: UsualFood): CartItem {
  return {
    key: uuid(),
    foodId: u.id,
    name: u.name,
    unitLabel: u.servingLabel,
    unitGrams: u.servingGrams,
    qty: 1,
    per100g: null,
    perUnit: { ...ZERO, kcal: u.kcal },
    source: 'search',
    aiEstimate: false,
    confidence: null,
    servingOptions: [],
  };
}

export function itemFromRecipe(r: RecipeDto): CartItem {
  const grams = r.items.reduce((s, i) => s + i.grams, 0) / Math.max(1, r.servings);
  return { key: uuid(), foodId: null, name: r.name, unitLabel: '1 serving', unitGrams: Math.round(grams), qty: 1, per100g: null, perUnit: r.perServing, source: 'recipe', aiEstimate: false, confidence: null, servingOptions: [] };
}

export function itemFromRecognised(i: RecognisedItemDto): CartItem {
  const qty = i.quantity > 0 ? i.quantity : 1;
  const unitGrams = i.grams > 0 ? i.grams / qty : 0;
  return {
    key: uuid(),
    foodId: i.foodId,
    name: i.name,
    unitLabel: qty === 1 ? i.servingLabel : unitGrams ? `${Math.round(unitGrams)} g` : i.servingLabel,
    unitGrams,
    qty,
    per100g: unitGrams ? i.per100g : null,
    perUnit: unitGrams ? null : scale(i.nutrition, 1 / qty),
    source: 'ai',
    aiEstimate: i.aiEstimate,
    confidence: i.confidence,
    servingOptions: i.servingOptions,
  };
}

export function quickAddItem(name: string, n: Nutrients): CartItem {
  return { key: uuid(), foodId: null, name: name.trim() || 'Quick add', unitLabel: 'quick add', unitGrams: 0, qty: 1, per100g: null, perUnit: n, source: 'quick_add', aiEstimate: false, confidence: null, servingOptions: [] };
}

/** Rebuild a cart from a saved log (edit, duplicate, log again). */
export function cartFromLog(log: Pick<FoodLogDto, 'items'>): CartItem[] {
  return log.items.map((i) => {
    const qty = i.servings > 0 ? i.servings : 1;
    const unitGrams = i.grams > 0 ? i.grams / qty : 0;
    return {
      key: uuid(),
      foodId: i.foodId,
      name: i.name,
      unitLabel: i.servingLabel ?? (unitGrams ? `${Math.round(unitGrams)} g` : '1 serving'),
      unitGrams,
      qty,
      per100g: i.grams > 0 ? scale(i.nutrition, 100 / i.grams) : null,
      perUnit: i.grams > 0 ? null : scale(i.nutrition, 1 / qty),
      source: (['search', 'ai', 'recipe', 'manual', 'diet', 'quick_add'].includes(i.source) ? i.source : 'manual') as CartSource,
      aiEstimate: i.aiEstimate,
      confidence: i.confidence,
      servingOptions: [],
      dietOptionId: i.dietOptionId,
    };
  });
}

export function cartToItems(cart: CartItem[]): FoodLogItemInput[] {
  return cart
    .filter((i) => i.qty > 0)
    .map((i) => ({
      foodId: i.foodId,
      name: i.name,
      grams: Math.round(i.unitGrams * i.qty * 10) / 10,
      servings: i.qty,
      servingLabel: i.unitLabel.slice(0, 40),
      nutrition: itemNutrition(i),
      source: i.source,
      dietOptionId: i.dietOptionId ?? null,
      aiEstimate: i.aiEstimate,
      confidence: i.confidence,
    }));
}

/** Local stand-in for Today until the server answers (or while the write waits in the outbox). */
export function optimisticFoodLog(id: string, data: FoodLogUpsert, extras: { thumbUrl?: string | null; addedLate?: boolean } = {}): FoodLogDto {
  const items = data.items.map((i) => ({
    foodId: i.foodId,
    name: i.name,
    grams: i.grams,
    servings: i.servings,
    servingLabel: i.servingLabel ?? null,
    nutrition: i.nutrition ?? ZERO,
    source: i.source,
    dietOptionId: i.dietOptionId ?? null,
    aiEstimate: !!i.aiEstimate,
    confidence: i.confidence ?? null,
    tags: [],
  }));
  return {
    id,
    date: data.date,
    mealSlot: data.mealSlot,
    loggedAt: data.loggedAt,
    items,
    totals: sumNutrients(items.map((i) => i.nutrition)),
    imageUrl: extras.thumbUrl ?? null,
    thumbUrl: extras.thumbUrl ?? null,
    imageExpired: false,
    aiGenerated: items.some((i) => i.source === 'ai'),
    aiCallId: data.aiCallId ?? null,
    confidence: null,
    note: data.note ?? null,
    addedLate: !!extras.addedLate,
    clientUpdatedAt: data.clientUpdatedAt,
    deleted: !!data.deleted,
  };
}

/** Upsert body that recreates a saved log (for delete, duplicate or log-again). */
export function foodLogToUpsert(log: FoodLogDto, over: Partial<FoodLogUpsert> = {}): FoodLogUpsert {
  return {
    date: log.date,
    mealSlot: log.mealSlot,
    loggedAt: log.loggedAt,
    items: log.items.map((i) => ({
      foodId: i.foodId,
      name: i.name,
      grams: i.grams,
      servings: i.servings,
      servingLabel: i.servingLabel,
      nutrition: i.nutrition,
      source: (['search', 'ai', 'recipe', 'manual', 'diet', 'quick_add'].includes(i.source) ? i.source : 'manual') as CartSource,
      dietOptionId: i.dietOptionId,
      aiEstimate: i.aiEstimate,
      confidence: i.confidence,
    })),
    aiCallId: log.aiCallId,
    note: log.note,
    clientUpdatedAt: nowIso(),
    ...over,
  };
}

/** Natural-language row shows when the query reads like a meal description ("2 rotis and dal"). */
export const looksLikeMeal = (q: string) => q.trim().length >= 3 && (/\d/.test(q) || /\band\b/i.test(q) || q.includes(','));

// ── queries ────────────────────────────────────────────────────────────────

/**
 * Food search, local-first: every keystroke searches the cached catalogue in memory (instant, works offline); when
 * online, the server's answer (typo-tolerant ranking plus recents and favourites) replaces the order once it arrives
 * for the current query, with any local-only matches appended. An empty query shows the server's recents.
 */
export function useFoodSearch(query: string, slot: MealSlot) {
  const raw = query.trim();
  const q = useDebounced(raw, 220);
  const online = useOnline();
  const catalog = useCollectionStatus(foodCatalog);
  const usuals = useUsuals();
  const boost = useMemo(() => new Map((usuals.data ?? []).map((u, i) => [u.id, Math.max(1, 4 - i / 2)])), [usuals.data]);
  const catalogVersion = catalog.version;
  const local = useMemo(
    () => (raw && catalog.ready && catalogVersion >= 0 ? searchCatalog(raw, { boost, limit: 25 }).map((f) => toLocalResult(f)) : null),
    [raw, catalog.ready, catalogVersion, boost],
  );
  const server = useQuery({
    queryKey: [...qk.foodSearch(q), slot],
    queryFn: ({ signal }) => api.foods.search(q, slot, signal),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    enabled: online,
  });
  const data = useMemo<FoodSearchResponse | undefined>(() => {
    if (!raw) return server.data;
    const fresh = server.data && q === raw && !server.isPlaceholderData ? server.data : null;
    if (fresh) {
      const ids = new Set(fresh.results.map((r) => r.id));
      return { ...fresh, results: [...fresh.results, ...(local ?? []).filter((r) => !ids.has(r.id))].slice(0, 30) };
    }
    if (local) return { query: raw, results: local, tookMs: 0 };
    return server.data;
  }, [raw, q, server.data, server.isPlaceholderData, local]);
  return { ...server, data, isPending: server.isPending && !local, isError: server.isError && !local, debouncedQuery: q, settling: !local && q !== raw };
}

/** Local catalogue hit, labelled like the server would (usage-based "Recent" comes from the server answer). */
function toLocalResult(f: CatalogFood): FoodSearchResult {
  return toSearchResult(f);
}

export function useUsuals() {
  return useQuery({ queryKey: qk.usuals, queryFn: () => api.foods.usuals(), staleTime: 5 * 60_000 });
}

export function useMyFoods(enabled = true) {
  return useQuery({ queryKey: qk.myFoods, queryFn: () => api.foods.mine(), staleTime: 60_000, enabled });
}

export function useFoodLogById(id: string | undefined) {
  return useQuery({ queryKey: qk.foodLog(id ?? ''), queryFn: () => api.logs.food(id!), enabled: !!id, staleTime: 0 });
}

export function useFoodDetail() {
  const qc = useQueryClient();
  return (id: string) =>
    qc.fetchQuery({
      queryKey: qk.food(id),
      queryFn: async (): Promise<FoodDetail> => {
        try {
          return await api.foods.get(id);
        } catch (e) {
          // Offline: the cached catalogue has everything needed to log the food.
          const f = e instanceof NetworkError ? catalogFood(id) : undefined;
          if (!f) throw e;
          return { ...toSearchResult(f), category: null, source: f.scope === 'global' ? 'seed' : f.scope, createdByMe: f.scope === 'mine' };
        }
      },
      staleTime: 10 * 60_000,
    });
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.foods.create,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.myFoods });
      void qc.invalidateQueries({ queryKey: ['food-search'] });
      // The new food joins the offline catalogue straight away.
      void foodCatalog.revalidate('write');
    },
  });
}

// ── photos and AI ──────────────────────────────────────────────────────────

/** Multipart field name for image uploads (api.ai.foodPhoto and api.media.upload). */
const IMAGE_FIELD = 'image';
const fileName = (b: Blob) => (b.type === 'image/jpeg' ? 'photo.jpg' : 'photo.webp');

export function useRecognisePhoto() {
  return useMutation({
    mutationFn: ({ blob, slot, hint }: { blob: Blob; slot: MealSlot; hint?: string }) => {
      const form = new FormData();
      form.append(IMAGE_FIELD, blob, fileName(blob));
      form.append('slot', slot);
      if (hint?.trim()) form.append('hint', hint.trim());
      return api.ai.foodPhoto(form);
    },
  });
}

export function useParseMealText() {
  return useMutation({ mutationFn: (b: { text: string; slot: MealSlot }) => api.ai.foodText(b) });
}

export function useUploadFoodPhoto() {
  return useMutation({
    mutationFn: (blob: Blob) => {
      const form = new FormData();
      form.append(IMAGE_FIELD, blob, fileName(blob));
      form.append('kind', 'food');
      return api.media.upload(form);
    },
  });
}

/** SYS-PWA-05: a photo shared into the app by the service worker's share target. Read once, then removed. */
export async function takeSharedPhoto(): Promise<Blob | null> {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open('shared');
    const res = await cache.match('/shared/photo');
    if (!res) return null;
    const blob = await res.blob();
    await cache.delete('/shared/photo');
    return blob.size ? blob : null;
  } catch {
    return null;
  }
}

// ── diet option + chat share ───────────────────────────────────────────────

/** "Log it" on the Next-up card via the diet endpoint (the caller falls back to an outbox save when offline). */
export function useLogDietOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ optionId, date, slot }: { optionId: string; date: string; slot: MealSlot }) => {
      const r = await api.diet.logOption(optionId, { logId: uuid(), date, mealSlot: slot, loggedAt: nowIso() });
      return r.entity;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['today'] });
      void qc.invalidateQueries({ queryKey: ['diet'] });
      void qc.invalidateQueries({ queryKey: qk.momentum });
    },
  });
}

/** A diet option as a plain food-log body (offline fallback for "Log it"). */
export function dietOptionUpsert(option: DietOptionDto, date: string, slot: MealSlot): FoodLogUpsert {
  const now = nowIso();
  return {
    date,
    mealSlot: slot,
    loggedAt: now,
    clientUpdatedAt: now,
    items: option.items.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, servings: i.servings, servingLabel: i.servingLabel, nutrition: i.nutrition, source: 'diet' as const, dietOptionId: option.id, aiEstimate: i.aiEstimate })),
  };
}

export async function shareLogToChat(kind: 'food_log' | 'activity_log', id: string): Promise<'sent' | 'queued'> {
  const msgId = uuid();
  const data = { body: '', attachments: [kind === 'food_log' ? { type: 'food_log' as const, id } : { type: 'activity_log' as const, id }], clientCreatedAt: nowIso() };
  try {
    await api.chat.send(msgId, data);
    return 'sent';
  } catch (e) {
    if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
      await outbox.enqueue({ kind: 'chat', id: msgId, data });
      return 'queued';
    }
    throw e;
  }
}
