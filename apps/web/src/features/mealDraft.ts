import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FoodAlternativeDto, MealSlot, RecipeDto, RecognisedItemDto, RecognitionResponse } from '@clubhouse/contracts';
import { itemFromRecipe, itemFromRecognised, type CartItem } from './food';

/*
 * The meal being logged (the Meal screen and its Food, Dish, Snap and Create views). It lives outside the screens so
 * moving between views never loses it, and in sessionStorage so a reload (or the OS dropping the page while the photo
 * picker is open) brings it back. Leaving the flow clears it.
 */

export type PhotoStatus = 'local' | 'uploading' | 'ready' | 'offline' | 'failed';

export interface MealPhoto {
  /** The id the server dedupes uploads on; an offline photo is found by it when its log syncs. */
  clientId: string;
  /** Object URL of the compressed photo (this session), or the saved photo's URL. */
  previewUrl: string | null;
  imageId: string | null;
  status: PhotoStatus;
  /** Read by AI ("AI read 3 things"). */
  ai: boolean;
  aiCount: number;
}

export interface ReadItem {
  item: CartItem;
  sel: boolean;
  /** Where a matched food lives; null for an AI estimate ("New to Clubhouse"). */
  scope: RecognisedItemDto['scope'];
  verified: boolean;
  alternatives: FoodAlternativeDto[];
}

/** What the AI read off the photo (or the typed description), being checked before it goes on the plate. */
export interface ReadState {
  kind: 'reading' | 'ok' | 'low' | 'notfood';
  from: 'photo' | 'text';
  items: ReadItem[];
  dish: { name: string; items: ReadItem[] } | null;
  /** The AI's "these look like one dish" name, until grouped or dismissed. */
  dishHint: string | null;
  select: boolean;
  naming: boolean;
  dishName: string;
  message: string | null;
  /** The typed description being read ("2 rotis and dal"). */
  query: string | null;
}

export const readItemOf = (r: RecognisedItemDto): ReadItem => ({ item: itemFromRecognised(r), sel: false, scope: r.scope, verified: r.verified, alternatives: r.alternatives });

/** The AI is reading the photo or the typed description. */
export const readingState = (from: ReadState['from'], query: string | null = null): ReadState => ({ kind: 'reading', from, items: [], dish: null, dishHint: null, select: false, naming: false, dishName: '', message: null, query });

/** What came back: foods to check, a few guesses when it isn't sure, or "that's not food". */
export function readStateFrom(r: RecognitionResponse, from: ReadState['from'], query: string | null = null): ReadState {
  const base = readingState(from, query);
  // "Not food" is about a photo; a description that reads as nothing is just unclear.
  if (!r.ok || !r.items.length) return { ...base, kind: r.reason === 'not_food' && from === 'photo' ? 'notfood' : 'low', message: r.message };
  const items = r.items.map(readItemOf);
  return { ...base, kind: r.lowConfidence ? 'low' : 'ok', items, dishHint: !r.lowConfidence && items.length > 1 ? r.dishName : null };
}

export interface DishDraft {
  /** The plate line being edited, or null for a new dish. */
  rowKey: string | null;
  name: string;
  components: CartItem[];
  makes: number;
  had: number;
  save: boolean;
  recipeId: string | null;
  updateRecipe: boolean;
  /** The ingredient whose portion editor is open. */
  open: string | null;
}

export const emptyDish = (): DishDraft => ({ rowKey: null, name: '', components: [], makes: 1, had: 1, save: false, recipeId: null, updateRecipe: false, open: null });

/** A dish line on the plate, opened to change it. */
export const dishFromLine = (i: CartItem): DishDraft => ({ ...emptyDish(), rowKey: i.key, name: i.name, components: i.components ?? [], makes: i.batchServings ?? 1, had: i.qty, recipeId: i.recipeId ?? null });

/** A saved recipe, one serving eaten unless changed. */
export function dishFromRecipe(r: RecipeDto): DishDraft {
  const line = itemFromRecipe(r);
  return { ...emptyDish(), name: r.name, components: line.components ?? [], makes: r.makes, recipeId: r.id };
}

export interface MealDraft {
  /** 'new' or the id of the log being edited. */
  key: string;
  date: string;
  slot: MealSlot;
  /** A chosen time (HH:mm), else now (or the saved time when editing). */
  time: string | null;
  plate: CartItem[];
  photo: MealPhoto | null;
  photoRemoved: boolean;
  aiCallId: string | null;
  read: ReadState | null;
  dish: DishDraft | null;
  /** Editing: the saved log has been loaded into the draft. */
  loaded: boolean;
}

interface Store {
  draft: MealDraft | null;
  start: (d: Pick<MealDraft, 'key' | 'date' | 'slot'> & Partial<MealDraft>) => void;
  patch: (p: Partial<MealDraft> | ((d: MealDraft) => Partial<MealDraft>)) => void;
  addItems: (items: CartItem[]) => void;
  replaceItem: (key: string, item: CartItem) => void;
  /** Removes a line and returns it with its index, for Undo. */
  removeItem: (key: string) => { item: CartItem; index: number } | null;
  restoreItem: (item: CartItem, index: number) => void;
  patchRead: (p: Partial<ReadState> | ((r: ReadState) => Partial<ReadState>)) => void;
  patchDish: (p: Partial<DishDraft> | ((d: DishDraft) => Partial<DishDraft>)) => void;
  reset: () => void;
}

const fresh = (d: Pick<MealDraft, 'key' | 'date' | 'slot'> & Partial<MealDraft>): MealDraft => ({ time: null, plate: [], photo: null, photoRemoved: false, aiCallId: null, read: null, dish: null, loaded: false, ...d });

export const useMealDraft = create<Store>()(
  persist(
    (set, get) => ({
      draft: null,
      start: (d) => set({ draft: fresh(d) }),
      patch: (p) => set((s) => (s.draft ? { draft: { ...s.draft, ...(typeof p === 'function' ? p(s.draft) : p) } } : s)),
      addItems: (items) => set((s) => (s.draft ? { draft: { ...s.draft, plate: [...s.draft.plate, ...items] } } : s)),
      replaceItem: (key, item) => set((s) => (s.draft ? { draft: { ...s.draft, plate: s.draft.plate.map((i) => (i.key === key ? item : i)) } } : s)),
      removeItem: (key) => {
        const d = get().draft;
        const index = d?.plate.findIndex((i) => i.key === key) ?? -1;
        if (!d || index < 0) return null;
        const item = d.plate[index]!;
        set({ draft: { ...d, plate: d.plate.filter((i) => i.key !== key) } });
        return { item, index };
      },
      restoreItem: (item, index) => set((s) => (s.draft ? { draft: { ...s.draft, plate: [...s.draft.plate.slice(0, index), item, ...s.draft.plate.slice(index)] } } : s)),
      patchRead: (p) => set((s) => (s.draft?.read ? { draft: { ...s.draft, read: { ...s.draft.read, ...(typeof p === 'function' ? p(s.draft.read) : p) } } } : s)),
      patchDish: (p) => set((s) => (s.draft?.dish ? { draft: { ...s.draft, dish: { ...s.draft.dish, ...(typeof p === 'function' ? p(s.draft.dish) : p) } } } : s)),
      reset: () => set({ draft: null }),
    }),
    {
      name: 'ch:meal-draft',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      // Object URLs die with the page; a reloaded draft shows the saved photo's URL or a placeholder.
      partialize: (s) => ({ draft: s.draft && { ...s.draft, photo: s.draft.photo && { ...s.draft.photo, previewUrl: s.draft.photo.previewUrl?.startsWith('blob:') ? null : s.draft.photo.previewUrl } } }),
    },
  ),
);

let resetTimer: ReturnType<typeof setTimeout> | null = null;

/** Leaving the meal flow clears the draft — a tick later, so React's development double-mount doesn't. */
export function scheduleDraftReset() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    resetTimer = null;
    useMealDraft.getState().reset();
    // Uploads in flight hold their own reference, and the offline queue keeps its own copy in IndexedDB.
    photoBlobs.clear();
  }, 0);
}

export function cancelDraftReset() {
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = null;
}

/** Compressed photo bytes for this session, by client id (for the upload retry and the offline queue). */
export const photoBlobs = new Map<string, Blob>();
