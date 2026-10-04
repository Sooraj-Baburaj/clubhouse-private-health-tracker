import { z } from 'zod';
import { GymFocus, Intensity, MealSlot } from '../enums';
import { IsoDateTime, LocalDateStr, Nutrients } from './common';
import { HabitCheckinUpsert } from './habits';

const ITEM_SOURCES = ['search', 'ai', 'recipe', 'manual', 'diet', 'quick_add'] as const;

/** One ingredient of a dish: a food and its portion in the whole batch, or a quick-add with its own nutrition. */
export const FoodLogComponentInput = z.object({
  foodId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  grams: z.number().min(0).max(5000),
  servings: z.number().min(0).max(100),
  servingLabel: z.string().max(40).nullable().optional(),
  /** Required when foodId is null; ignored (recomputed) when it is set. */
  nutrition: Nutrients.nullable().optional(),
  source: z.enum(ITEM_SOURCES).optional(),
  aiEstimate: z.boolean().optional(),
});
export type FoodLogComponentInput = z.infer<typeof FoodLogComponentInput>;

export const FoodLogItemInput = z.object({
  foodId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  grams: z.number().min(0).max(5000),
  /** For a dish: how many of its `batchServings` servings were eaten. */
  servings: z.number().min(0).max(100),
  servingLabel: z.string().max(40).nullable().optional(),
  /** Required for quick-add and AI-estimate items; ignored (recomputed) when foodId is set or for dishes. */
  nutrition: Nutrients.nullable().optional(),
  source: z.enum(ITEM_SOURCES),
  dietOptionId: z.string().uuid().nullable().optional(),
  aiEstimate: z.boolean().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  /** A dish: its ingredients for the whole batch. The item's nutrition is their total × servings ÷ batchServings. */
  components: z.array(FoodLogComponentInput).min(1).max(30).optional(),
  /** Servings the dish batch makes (default 1). */
  batchServings: z.number().positive().max(50).optional(),
  /** The saved recipe this dish came from. */
  recipeId: z.string().uuid().nullable().optional(),
});
export type FoodLogItemInput = z.infer<typeof FoodLogItemInput>;

export const FoodLogUpsert = z
  .object({
    date: LocalDateStr,
    mealSlot: MealSlot,
    loggedAt: IsoDateTime,
    items: z.array(FoodLogItemInput).max(30),
    imageId: z.string().uuid().nullable().optional(),
    /** A photo still waiting in the outbox: the server finds it by the client id it was uploaded with. */
    imageClientId: z.string().uuid().nullable().optional(),
    aiCallId: z.string().uuid().nullable().optional(),
    note: z.string().max(280).nullable().optional(),
    /** A snapped meal saved with its photo only ("Finish later"); the foods come later. */
    pendingDetails: z.boolean().optional(),
    clientUpdatedAt: IsoDateTime,
    deleted: z.boolean().optional(),
  })
  // A photo-only meal needs its photo; the server checks that (an edit keeps the saved one without resending it).
  .refine((d) => d.deleted || d.items.length > 0 || d.pendingDetails === true, { message: 'Add at least one food.', path: ['items'] });
export type FoodLogUpsert = z.infer<typeof FoodLogUpsert>;

export const ActivityLogUpsert = z.object({
  date: LocalDateStr,
  loggedAt: IsoDateTime,
  typeId: z.string().uuid(),
  durationMin: z.number().min(1).max(720),
  distanceKm: z.number().min(0).max(500).nullable().optional(),
  intensity: Intensity.nullable().optional(),
  focus: GymFocus.nullable().optional(),
  kcalOverride: z.number().min(0).max(10000).nullable().optional(),
  planItemId: z.string().uuid().nullable().optional(),
  imageId: z.string().uuid().nullable().optional(),
  note: z.string().max(280).nullable().optional(),
  clientUpdatedAt: IsoDateTime,
  deleted: z.boolean().optional(),
});
export type ActivityLogUpsert = z.infer<typeof ActivityLogUpsert>;

export const WeightUpsert = z.object({
  date: LocalDateStr,
  weightKg: z.number().min(25).max(350),
  note: z.string().max(280).nullable().optional(),
  clientUpdatedAt: IsoDateTime,
  deleted: z.boolean().optional(),
});
export type WeightUpsert = z.infer<typeof WeightUpsert>;

export const SyncOp = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('food_log'), id: z.string().uuid(), data: FoodLogUpsert }),
  z.object({ kind: z.literal('activity_log'), id: z.string().uuid(), data: ActivityLogUpsert }),
  z.object({ kind: z.literal('weight'), id: z.string().uuid(), data: WeightUpsert }),
  z.object({ kind: z.literal('habit_checkin'), id: z.string().uuid(), data: HabitCheckinUpsert }),
]);
export type SyncOp = z.infer<typeof SyncOp>;
export const SyncRequest = z.object({ ops: z.array(SyncOp).min(1).max(50) });
export type SyncRequest = z.infer<typeof SyncRequest>;

export interface FoodLogComponentDto {
  foodId: string | null;
  name: string;
  grams: number;
  servings: number;
  servingLabel: string | null;
  nutrition: Nutrients;
  aiEstimate: boolean;
}

export interface FoodLogItemDto {
  foodId: string | null;
  name: string;
  grams: number;
  servings: number;
  servingLabel: string | null;
  nutrition: Nutrients;
  source: string;
  dietOptionId: string | null;
  aiEstimate: boolean;
  confidence: number | null;
  tags: string[];
  /** A dish: its ingredients for the whole batch of `batchServings`. */
  components: FoodLogComponentDto[] | null;
  batchServings: number | null;
  recipeId: string | null;
}

export interface FoodLogDto {
  id: string;
  date: string;
  mealSlot: z.infer<typeof MealSlot>;
  loggedAt: string;
  items: FoodLogItemDto[];
  totals: Nutrients;
  imageId: string | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  imageExpired: boolean;
  aiGenerated: boolean;
  aiCallId: string | null;
  confidence: number | null;
  note: string | null;
  /** Saved with its photo only; the foods are still to add. */
  pendingDetails: boolean;
  addedLate: boolean;
  clientUpdatedAt: string;
  deleted: boolean;
}

export interface ActivityLogDto {
  id: string;
  date: string;
  loggedAt: string;
  typeId: string;
  typeKey: string;
  typeName: string;
  icon: string;
  durationMin: number;
  distanceKm: number | null;
  intensity: string | null;
  focus: string | null;
  kcalBurned: number;
  kcalOverridden: boolean;
  met: number | null;
  planItemId: string | null;
  note: string | null;
  addedLate: boolean;
  clientUpdatedAt: string;
  deleted: boolean;
}

export interface WeightEntryDto {
  id: string;
  date: string;
  weightKg: number;
  note: string | null;
  addedLate: boolean;
  clientUpdatedAt: string;
  deleted: boolean;
}

export interface MemeMomentDto {
  fireId: string;
  logId: string | null;
  memeUrl: string | null;
  caption: string;
  tone: 'roast' | 'celebrate' | 'neutral';
  triggerName: string;
  firedAt: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  canRoastOptOut: boolean;
}

export interface LogSideEffects {
  memeMoments: MemeMomentDto[];
  milestones: { kind: string; days: number; badge: string; emoji: string }[];
  streak: { current: number; status: string } | null;
  planProgress: { itemId: string; typeName: string; done: number; target: number } | null;
  personalRecords: string[];
  /** Crew points this save earned this week (`gained` can be 0 or negative after an edit) and the live rank. */
  points: { gained: number; total: number; rank: number | null; rankBefore: number | null } | null;
}

export interface UpsertResult<T> {
  status: 'applied' | 'stale';
  entity: T;
  effects: LogSideEffects;
}

export interface SyncResult {
  results: { kind: SyncOp['kind']; id: string; status: 'applied' | 'stale' | 'rejected'; error?: string; entity?: unknown }[];
  cursor: string;
}

export interface ChangesResponse {
  foodLogs: FoodLogDto[];
  activityLogs: ActivityLogDto[];
  weights: WeightEntryDto[];
  cursor: string;
}

export interface ActivityTypeDto {
  id: string;
  key: string;
  name: string;
  icon: string;
  met: number;
  metBands: { minKmh: number; met: number }[] | null;
  inputs: ('duration' | 'distance' | 'intensity' | 'focus')[];
  defaultDurationMin: number;
}
