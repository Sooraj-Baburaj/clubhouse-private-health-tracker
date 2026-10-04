import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type {
  CatalogFood,
  DietOptionDto,
  FoodAlternativeDto,
  FoodDetail,
  FoodDraft,
  FoodLogComponentDto,
  FoodLogComponentInput,
  FoodLogDto,
  FoodLogItemDto,
  FoodLogItemInput,
  FoodLogUpsert,
  FoodSearchResponse,
  FoodSearchResult,
  MealSlot,
  Nutrients,
  RecipeDto,
  RecipeRequest,
  RecognisedItemDto,
  ServingOptionDto,
  UsualFood,
} from '@clubhouse/contracts';
import { dishNutrition, fractionText, nutritionFor, portionText, round1 } from '@clubhouse/domain';
import { useDebounced, useOnline } from '@clubhouse/ui';
import { useMemo } from 'react';
import { useCollectionStatus } from '@/infrastructure/cache';
import { catalogFood, foodCatalog, searchCatalog, toSearchResult } from '@/infrastructure/cache/foodCatalog';
import { outbox } from '@/infrastructure/outbox';
import { nowIso, uuid } from '@/lib/ids';
import { qk } from './keys';

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const;
const SOURCES = ['search', 'ai', 'recipe', 'manual', 'diet', 'quick_add'] as const;

export type CartSource = FoodLogItemInput['source'];

/**
 * One line of the pending log. Quantity is counted in `unitLabel` units of `unitGrams` each; nutrition comes from
 * per-100 g values when known, else from a fixed per-unit value (quick add, AI estimates without grams). A dish has
 * `components` (its ingredients for the whole batch of `batchServings`) and `qty` is how many servings were eaten.
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
  /** The weight is a guess (≈): an AI-estimated portion, or a food logged by a unit with no known weight. */
  estimated?: boolean;
  components?: CartItem[];
  batchServings?: number;
  recipeId?: string | null;
  tags?: string[];
}

const scale = (n: Nutrients, k: number): Nutrients => ({ kcal: round1(n.kcal * k), protein: round1(n.protein * k), carbs: round1(n.carbs * k), fat: round1(n.fat * k), fibre: round1(n.fibre * k) });

export function sumNutrients(list: Nutrients[]): Nutrients {
  const t = { ...ZERO };
  for (const n of list) for (const k of KEYS) t[k] += n[k];
  return t;
}

export const isDish = (i: Pick<CartItem, 'components'>) => !!i.components?.length;

/** Total weight of a line (a dish: its share of the batch). */
export function itemGrams(i: CartItem): number {
  if (isDish(i)) return dishNutrition(i.components!.map((c) => ({ nutrition: itemNutrition(c), grams: itemGrams(c) })), i.batchServings ?? 1, i.qty).grams;
  return Math.round(i.unitGrams * i.qty * 10) / 10;
}

export function itemNutrition(i: CartItem): Nutrients {
  if (isDish(i)) return dishNutrition(i.components!.map((c) => ({ nutrition: itemNutrition(c), grams: itemGrams(c) })), i.batchServings ?? 1, i.qty).nutrition;
  if (i.per100g && i.unitGrams > 0) return nutritionFor(i.per100g, i.unitGrams * i.qty);
  if (i.perUnit) return scale(i.perUnit, i.qty);
  return ZERO;
}

export const cartTotals = (cart: CartItem[]) => sumNutrients(cart.map(itemNutrition));

/** "2 scoops", "½ katori", "150 g"; a dish: the share eaten, "1 of 2". */
export function itemPortion(i: CartItem): string {
  if (isDish(i)) return `${fractionText(i.qty)} of ${i.batchServings ?? 1}`;
  const opt = i.servingOptions.find((o) => o.label === i.unitLabel);
  return portionText(i.qty, opt ?? { label: i.unitLabel });
}

const optionsOf = (r: { servingOptions: ServingOptionDto[] }) => (r.servingOptions.length ? r.servingOptions : [{ label: '100 g', grams: 100 }]);

export function itemFromSearch(r: FoodSearchResult, portion?: { label: string; grams: number; qty: number }): CartItem {
  const opt = r.servingOptions.find((o) => o.label === (portion?.label ?? r.servingLabel));
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
    servingOptions: optionsOf(r),
    estimated: !!opt?.estimated,
    tags: r.tags,
    recipeId: r.recipeId ?? null,
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

function componentFromDto(c: FoodLogComponentDto): CartItem {
  const qty = c.servings > 0 ? c.servings : 1;
  return {
    key: uuid(),
    foodId: c.foodId,
    name: c.name,
    unitLabel: c.servingLabel ?? (c.grams ? `${Math.round(c.grams / qty)} g` : '1 serving'),
    unitGrams: c.grams > 0 ? c.grams / qty : 0,
    qty,
    // Ingredients keep the nutrition they were saved with; per 100 g lets their portion be changed.
    per100g: c.grams > 0 ? scale(c.nutrition, 100 / c.grams) : null,
    perUnit: c.grams > 0 ? null : scale(c.nutrition, 1 / qty),
    source: 'search',
    aiEstimate: c.aiEstimate,
    confidence: null,
    servingOptions: [],
  };
}

/** A saved recipe as a dish line: its ingredients, the batch it makes, one serving eaten. */
export function itemFromRecipe(r: RecipeDto): CartItem {
  return { key: uuid(), foodId: null, name: r.name, unitLabel: '1 serving', unitGrams: 0, qty: 1, per100g: null, perUnit: null, source: 'recipe', aiEstimate: false, confidence: null, servingOptions: [], components: r.components.map(componentFromDto), batchServings: r.makes, recipeId: r.id };
}

/** An AI-read food: one unit ("1 roti") and how many, with the AI's weight flagged as a guess. */
export function itemFromRecognised(i: RecognisedItemDto): CartItem {
  const qty = i.quantity > 0 ? i.quantity : 1;
  const unitGrams = i.grams > 0 ? i.grams / qty : 0;
  return {
    key: uuid(),
    foodId: i.foodId,
    name: i.name,
    unitLabel: i.servingLabel,
    unitGrams,
    qty,
    per100g: unitGrams ? i.per100g : null,
    perUnit: unitGrams ? null : scale(i.nutrition, 1 / qty),
    source: 'ai',
    aiEstimate: i.aiEstimate,
    confidence: i.confidence,
    servingOptions: i.servingOptions,
    estimated: true,
    tags: i.tags,
  };
}

/**
 * "Not right?" → a near match: the same line as that food, keeping the portion when the food has the same unit, else
 * its first portion.
 */
export function itemFromAlternative(a: FoodAlternativeDto, prev: CartItem): CartItem {
  const options = optionsOf(a);
  const same = options.find((o) => o.label.toLowerCase() === prev.unitLabel.toLowerCase());
  const opt = same ?? options[0]!;
  return { key: prev.key, foodId: a.foodId, name: a.name, unitLabel: opt.label, unitGrams: opt.grams, qty: same ? prev.qty : 1, per100g: a.per100g, perUnit: null, source: 'search', aiEstimate: false, confidence: null, servingOptions: options, estimated: !!opt.estimated };
}

export function quickAddItem(name: string, n: Nutrients): CartItem {
  return { key: uuid(), foodId: null, name: name.trim() || 'Quick add', unitLabel: 'quick add', unitGrams: 0, qty: 1, per100g: null, perUnit: n, source: 'quick_add', aiEstimate: false, confidence: null, servingOptions: [] };
}

/** A new dish line from ingredients (Make a dish, Group into a dish). */
export function dishItem(name: string, components: CartItem[], batchServings = 1, qty = 1, recipeId: string | null = null): CartItem {
  return { key: uuid(), foodId: null, name, unitLabel: '1 serving', unitGrams: 0, qty, per100g: null, perUnit: null, source: recipeId ? 'recipe' : 'manual', aiEstimate: components.some((c) => c.aiEstimate), confidence: null, servingOptions: [], components, batchServings, recipeId };
}

/** Rebuild a cart from a saved log (edit, duplicate, log again). */
export function cartFromLog(log: Pick<FoodLogDto, 'items'>): CartItem[] {
  return log.items.map((i: FoodLogItemDto): CartItem => {
    const source = (SOURCES as readonly string[]).includes(i.source) ? (i.source as CartSource) : 'manual';
    if (i.components?.length) return { ...dishItem(i.name, i.components.map(componentFromDto), i.batchServings ?? 1, i.servings > 0 ? i.servings : 1, i.recipeId), source };
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
      source,
      aiEstimate: i.aiEstimate,
      confidence: i.confidence,
      servingOptions: [],
      dietOptionId: i.dietOptionId,
      tags: i.tags,
      recipeId: i.recipeId,
    };
  });
}

function componentInput(c: CartItem): FoodLogComponentInput {
  return { foodId: c.foodId, name: c.name, grams: itemGrams(c), servings: c.qty, servingLabel: c.unitLabel.slice(0, 40), nutrition: itemNutrition(c), source: c.source, aiEstimate: c.aiEstimate };
}

export function cartToItems(cart: CartItem[]): FoodLogItemInput[] {
  return cart
    .filter((i) => i.qty > 0 && (!isDish(i) || i.components!.length > 0))
    .map((i): FoodLogItemInput => {
      if (isDish(i)) {
        const share = itemPortion(i).slice(0, 40);
        return { foodId: null, name: i.name, grams: itemGrams(i), servings: i.qty, servingLabel: share, nutrition: itemNutrition(i), source: i.source, aiEstimate: i.aiEstimate, confidence: i.confidence, components: i.components!.map(componentInput), batchServings: i.batchServings ?? 1, recipeId: i.recipeId ?? null };
      }
      return {
        foodId: i.foodId,
        name: i.name,
        grams: itemGrams(i),
        servings: i.qty,
        servingLabel: i.unitLabel.slice(0, 40),
        nutrition: itemNutrition(i),
        source: i.source,
        dietOptionId: i.dietOptionId ?? null,
        aiEstimate: i.aiEstimate,
        confidence: i.confidence,
        ...(i.recipeId ? { recipeId: i.recipeId } : {}),
      };
    });
}

const componentDto = (c: FoodLogComponentInput): FoodLogComponentDto => ({ foodId: c.foodId, name: c.name, grams: c.grams, servings: c.servings, servingLabel: c.servingLabel ?? null, nutrition: c.nutrition ?? ZERO, aiEstimate: !!c.aiEstimate });

/** Local stand-in for Today until the server answers (or while the write waits in the outbox). */
export function optimisticFoodLog(id: string, data: FoodLogUpsert, extras: { thumbUrl?: string | null; addedLate?: boolean; imageId?: string | null } = {}): FoodLogDto {
  const items: FoodLogItemDto[] = data.items.map((i) => ({
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
    components: i.components?.map(componentDto) ?? null,
    batchServings: i.batchServings ?? null,
    recipeId: i.recipeId ?? null,
  }));
  return {
    id,
    date: data.date,
    mealSlot: data.mealSlot,
    loggedAt: data.loggedAt,
    items,
    totals: sumNutrients(items.map((i) => i.nutrition)),
    imageId: extras.imageId ?? data.imageId ?? null,
    imageUrl: extras.thumbUrl ?? null,
    thumbUrl: extras.thumbUrl ?? null,
    imageExpired: false,
    aiGenerated: items.some((i) => i.source === 'ai'),
    aiCallId: data.aiCallId ?? null,
    confidence: null,
    note: data.note ?? null,
    pendingDetails: !!data.pendingDetails && items.length === 0,
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
      source: ((SOURCES as readonly string[]).includes(i.source) ? i.source : 'manual') as CartSource,
      dietOptionId: i.dietOptionId,
      aiEstimate: i.aiEstimate,
      confidence: i.confidence,
      ...(i.components?.length ? { components: i.components.map((c) => ({ foodId: c.foodId, name: c.name, grams: c.grams, servings: c.servings, servingLabel: c.servingLabel, nutrition: c.nutrition, aiEstimate: c.aiEstimate })), batchServings: i.batchServings ?? 1 } : {}),
      ...(i.recipeId ? { recipeId: i.recipeId } : {}),
    })),
    // A copy of a photo-only meal keeps its photo (the server keeps it on the same log anyway).
    ...(log.pendingDetails && log.imageId ? { imageId: log.imageId, pendingDetails: true } : {}),
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

/** A food's detail (portions, nutrition, your usual), from the server or, offline, the cached catalogue. */
async function fetchFoodDetail(id: string): Promise<FoodDetail> {
  try {
    return await api.foods.get(id);
  } catch (e) {
    // Offline: the cached catalogue has everything needed to log the food.
    const f = e instanceof NetworkError ? catalogFood(id) : undefined;
    if (!f) throw e;
    return { ...toSearchResult(f), category: null, source: f.scope === 'global' ? 'seed' : f.scope, createdByMe: f.scope === 'mine', editable: f.scope === 'mine' && !f.verified && !f.recipeId, usual: null };
  }
}

export function useFood(id: string | null | undefined) {
  return useQuery({ queryKey: qk.food(id ?? ''), queryFn: () => fetchFoodDetail(id!), enabled: !!id, staleTime: 10 * 60_000 });
}

export function useFoodDetail() {
  const qc = useQueryClient();
  return (id: string) => qc.fetchQuery({ queryKey: qk.food(id), queryFn: () => fetchFoodDetail(id), staleTime: 10 * 60_000 });
}

function afterFoodChange(qc: ReturnType<typeof useQueryClient>, id?: string) {
  void qc.invalidateQueries({ queryKey: qk.myFoods });
  void qc.invalidateQueries({ queryKey: ['food-search'] });
  if (id) void qc.invalidateQueries({ queryKey: qk.food(id) });
  // New and edited foods reach the offline catalogue straight away.
  void foodCatalog.revalidate('write');
}

export function useCreateFood() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (d: FoodDraft) => api.foods.create(d), onSuccess: () => afterFoodChange(qc) });
}

export function useUpdateFood() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, draft }: { id: string; draft: FoodDraft }) => api.foods.update(id, draft), onSuccess: (f) => afterFoodChange(qc, f.id) });
}

export function useToggleFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.foods.favourite(id, on),
    onMutate: ({ id, on }) => {
      const prev = qc.getQueryData<FoodDetail>(qk.food(id));
      if (prev) qc.setQueryData<FoodDetail>(qk.food(id), { ...prev, favourite: on });
      return { prev };
    },
    onError: (_e, { id }, ctx) => ctx?.prev && qc.setQueryData(qk.food(id), ctx.prev),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['food-search'] }),
  });
}

// ── recipes ────────────────────────────────────────────────────────────────

export function useRecipe(id: string | null | undefined) {
  return useQuery({ queryKey: qk.recipe(id ?? ''), queryFn: () => api.recipes.get(id!), enabled: !!id, staleTime: 60_000 });
}

/** The ingredients of a dish line as a recipe body. */
export function recipeBody(name: string, components: CartItem[], makes: number, imageId?: string | null): RecipeRequest {
  return { name: name.trim(), components: components.map(componentInput), makes, ...(imageId !== undefined ? { imageId } : {}) };
}

export function useSaveRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: RecipeRequest }) => (id ? api.recipes.update(id, body) : api.recipes.create(body)),
    onSuccess: (r) => {
      qc.setQueryData(qk.recipe(r.id), r);
      afterFoodChange(qc);
    },
  });
}

// ── photos and AI ──────────────────────────────────────────────────────────

/** Multipart field name for image uploads (api.ai.foodPhoto and api.media.upload). */
const IMAGE_FIELD = 'image';
const fileName = (b: Blob) => (b.type === 'image/jpeg' ? 'photo.jpg' : 'photo.webp');

/** A compressed photo plus the clientId the server dedupes on, so retries and fallbacks never store it twice. */
export interface Shot {
  blob: Blob;
  clientId: string;
}

export function useRecognisePhoto() {
  return useMutation({
    mutationFn: ({ blob, clientId, slot, hint }: Shot & { slot: MealSlot; hint?: string }) => {
      const form = new FormData();
      form.append(IMAGE_FIELD, blob, fileName(blob));
      form.append('clientId', clientId);
      form.append('slot', slot);
      if (hint?.trim()) form.append('hint', hint.trim());
      return api.ai.foodPhoto(form);
    },
  });
}

export function useParseMealText() {
  return useMutation({ mutationFn: (b: { text: string; slot: MealSlot }) => api.ai.foodText(b) });
}

export function uploadFoodPhoto({ blob, clientId }: Shot) {
  const form = new FormData();
  form.append(IMAGE_FIELD, blob, fileName(blob));
  form.append('clientId', clientId);
  form.append('kind', 'food');
  return api.media.upload(form);
}

export function useUploadFoodPhoto() {
  return useMutation({ mutationFn: uploadFoodPhoto });
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
      void qc.invalidateQueries({ queryKey: ['team'] });
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
