import { z } from 'zod';
import { FoodTag, MealSlot } from '../enums';
import { IsoDateTime, Nutrients, PortionUnit, ServingOptionSchema, type BandDto, type ServingOptionDto } from './common';
import { FoodLogComponentInput, type FoodLogComponentDto } from './logs';

export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  group: 'recent' | 'favourite' | 'team' | 'mine' | 'global';
  /** Where the food lives, whatever its search group: the catalogue, the team's foods, or the member's own. */
  scope: 'global' | 'team' | 'mine';
  verified: boolean;
  aiEstimate: boolean;
  servingLabel: string;
  servingGrams: number;
  perServing: Nutrients;
  per100g: Nutrients;
  servingOptions: ServingOptionDto[];
  tags: string[];
  favourite: boolean;
  /** Set for a saved recipe: picking it opens the dish with its ingredients. */
  recipeId: string | null;
}

export interface FoodSearchResponse {
  query: string;
  results: FoodSearchResult[];
  tookMs: number;
}

export interface UsualFood {
  id: string;
  name: string;
  servingLabel: string;
  servingGrams: number;
  kcal: number;
}

/**
 * A way to measure the food: `amount` × `unit` weighs `grams` (ml for volume units). `grams` is null when the member
 * doesn't know the weight — then the food is logged by that unit only.
 */
export const FoodPortionInput = z.object({
  unit: PortionUnit,
  /** The unit's name when `unit` is "custom" (ladle, handful…). */
  label: z.string().trim().min(1).max(24).optional(),
  amount: z.number().positive().max(1000),
  grams: z.number().positive().max(5000).nullable(),
  isDefault: z.boolean().optional(),
});
export type FoodPortionInput = z.infer<typeof FoodPortionInput>;

const FoodName = z.string().trim().min(2).max(80);
const FoodBrand = z.string().trim().max(60).nullable().optional();

/** Create or edit a food (portions v2): nutrition for one `basis` portion, plus the other ways to measure it. */
export const FoodDraft = z
  .object({
    name: FoodName,
    brand: FoodBrand,
    tags: z.array(FoodTag).max(8).optional(),
    veg: z.boolean().nullable().optional(),
    basis: FoodPortionInput,
    /** Nutrition for the basis portion. */
    nutrients: Nutrients,
    portions: z.array(FoodPortionInput).max(11).default([]),
  })
  .refine((d) => d.nutrients.kcal > 0, { message: 'Add the calories.', path: ['nutrients', 'kcal'] })
  .refine((d) => d.basis.unit !== 'custom' || !!d.basis.label, { message: 'Name the unit.', path: ['basis', 'label'] })
  .refine((d) => d.portions.every((p) => p.unit !== 'custom' || !!p.label), { message: 'Name the unit.', path: ['portions'] });
export type FoodDraft = z.infer<typeof FoodDraft>;

/** The pre-portions shape, still accepted from app versions installed before the change. */
export const LegacyCreateFoodRequest = z.object({
  name: FoodName,
  brand: FoodBrand,
  servingLabel: z.string().trim().min(1).max(40),
  servingGrams: z.number().positive().max(5000),
  perServing: Nutrients,
  tags: z.array(FoodTag).max(8).optional(),
  veg: z.boolean().nullable().optional(),
});
export type LegacyCreateFoodRequest = z.infer<typeof LegacyCreateFoodRequest>;

export const CreateFoodRequest = z.union([FoodDraft, LegacyCreateFoodRequest]);
export type CreateFoodRequest = z.infer<typeof CreateFoodRequest>;
export const UpdateFoodRequest = FoodDraft;
export type UpdateFoodRequest = FoodDraft;

/** A saved dish: its ingredients for the whole batch, which makes `makes` servings. */
export const RecipeRequest = z.object({
  name: FoodName,
  components: z.array(FoodLogComponentInput).min(1).max(30),
  makes: z.number().positive().max(50),
  imageId: z.string().uuid().nullable().optional(),
});
export type RecipeRequest = z.infer<typeof RecipeRequest>;

export interface RecipeDto {
  id: string;
  name: string;
  makes: number;
  perServing: Nutrients;
  components: FoodLogComponentDto[];
  /** The searchable food that stands for this recipe ("1 serving"). */
  foodId: string | null;
  imageUrl: string | null;
  mine: boolean;
  updatedAt: string;
}

export interface FoodDetail extends FoodSearchResult {
  category: string | null;
  source: string;
  createdByMe: boolean;
  /** Members can edit their own foods until an admin verifies them. */
  editable: boolean;
  /** The portion this member last logged it with. */
  usual: { label: string; grams: number } | null;
}

export const FoodSearchQuery = z.object({ q: z.string().max(80).default(''), slot: MealSlot.optional(), limit: z.coerce.number().int().min(1).max(50).default(25) });

/* ───────── Offline food catalogue (browser cache, delta sync) ───────── */

/** Bump when CatalogFood changes shape: browsers holding an older format drop their copy and download afresh. */
export const FOOD_CATALOG_FORMAT = 2;

/** One food as the browser stores it for instant, offline search. */
export interface CatalogFood {
  id: string;
  name: string;
  aliases: string[];
  brand: string | null;
  scope: 'global' | 'team' | 'mine';
  verified: boolean;
  aiEstimate: boolean;
  per100g: Nutrients;
  servingOptions: ServingOptionDto[];
  defaultServing: string | null;
  tags: string[];
  veg: boolean | null;
  recipeId: string | null;
}

/**
 * GET /foods/catalog — without `since`: the whole catalogue visible to the member; with `since`: only rows changed
 * after it (with a safety overlap), where `removed` lists ids that were deleted, merged or are no longer visible.
 * Both modes page by id with `after`; `next` is null on the last page. `syncedAt` (database time when the request
 * started) is the `since` to send next time.
 */
export interface FoodCatalogPage {
  format: number;
  items: CatalogFood[];
  removed: string[];
  syncedAt: string;
  next: string | null;
}

export const FoodCatalogQuery = z.object({
  since: IsoDateTime.optional(),
  after: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(50).max(2000).default(1000),
});

export type { BandDto, ServingOptionDto };
export { ServingOptionSchema };
