import { createContext, useContext } from 'react';
import type { FoodLogDto, FoodSearchResult, MealSlot, RecipeDto, UsualFood } from '@clubhouse/contracts';
import type { CartItem } from '@/features/food';
import type { Me } from '@/features/me';
import type { MealDraft } from '@/features/mealDraft';

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** The entry was pushed by the meal flow (a view over the meal), so back closes it. */
    mealView?: boolean;
  }
}

export type MealView = 'snap' | 'read' | 'item' | 'dish' | 'create';
export interface ViewParams {
  food?: string;
  recipe?: string;
  row?: string;
  into?: 'plate' | 'dish' | 'read';
  name?: string;
}

/** Everything the Meal screen and its views share: the draft, view navigation, the plate, the photo and saving. */
export interface MealFlow {
  me: Me;
  draft: MealDraft;
  editing: FoodLogDto | null;
  slotLabel: (s: MealSlot) => string;
  /** AI photo reading is available (team switch, member opt-in) and the device is online. */
  photoAi: boolean;
  textAi: boolean;
  view: MealView | null;
  params: ViewParams;
  openView: (view: MealView, params?: ViewParams) => void;
  replaceView: (view: MealView | null, params?: ViewParams) => void;
  /** Back to the meal screen from a view (the view's own history entry, when it has one). */
  closeView: () => void;
  /** Leave the flow altogether (the meal's back button). */
  exitFlow: () => void;
  /** The camera's ✕: back to the meal, or out of the flow when the camera was the way in and nothing was added. */
  closeCamera: () => void;
  addItems: (items: CartItem[], opts?: { toast?: string | false }) => void;
  replaceItem: (key: string, item: CartItem) => void;
  removeItem: (key: string) => void;
  /** A search result: a food goes on the plate; a saved recipe goes on as a dish. */
  addResult: (r: FoodSearchResult) => void;
  /** A usual goes on at once and gets its full nutrition in the background. */
  addUsual: (u: UsualFood) => void;
  /** Open a dish: a plate line, a saved recipe, or a new empty one. */
  openDish: (from?: { line?: CartItem; recipeId?: string; recipe?: RecipeDto }) => void;
  takePhoto: (file: Blob) => Promise<void>;
  removePhoto: () => void;
  parseText: (text: string) => void;
  parsing: boolean;
  save: () => void;
  finishLater: () => void;
  deleteLog: () => void;
  saving: boolean;
  /** Bumped to move focus to the meal's search box (after "Search instead"). */
  focusTick: number;
  focusSearch: () => void;
  /** Bumped to empty the meal's search box (a typed description that the AI read went on the plate). */
  searchKey: number;
  clearSearch: () => void;
}

export const MealFlowContext = createContext<MealFlow | null>(null);

export function useMealFlow(): MealFlow {
  const f = useContext(MealFlowContext);
  if (!f) throw new Error('useMealFlow outside the meal flow');
  return f;
}
