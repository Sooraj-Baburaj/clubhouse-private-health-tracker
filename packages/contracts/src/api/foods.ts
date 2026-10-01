import { z } from 'zod';
import { FoodTag, MealSlot } from '../enums';
import { IsoDateTime, Nutrients, ServingOptionSchema, type BandDto, type ServingOptionDto } from './common';

export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  group: 'recent' | 'favourite' | 'team' | 'mine' | 'global';
  verified: boolean;
  aiEstimate: boolean;
  servingLabel: string;
  servingGrams: number;
  perServing: Nutrients;
  per100g: Nutrients;
  servingOptions: ServingOptionDto[];
  tags: string[];
  favourite: boolean;
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

export const CreateFoodRequest = z.object({
  name: z.string().trim().min(2).max(80),
  brand: z.string().trim().max(60).nullable().optional(),
  servingLabel: z.string().trim().min(1).max(40),
  servingGrams: z.number().positive().max(5000),
  perServing: Nutrients,
  tags: z.array(FoodTag).max(8).optional(),
  veg: z.boolean().nullable().optional(),
});
export type CreateFoodRequest = z.infer<typeof CreateFoodRequest>;

export const CreateRecipeRequest = z.object({
  name: z.string().trim().min(2).max(80),
  items: z.array(z.object({ foodId: z.string().uuid(), grams: z.number().positive().max(5000) })).min(1).max(40),
  servings: z.number().positive().max(50),
});
export type CreateRecipeRequest = z.infer<typeof CreateRecipeRequest>;

export interface RecipeDto {
  id: string;
  name: string;
  servings: number;
  perServing: Nutrients;
  items: { foodId: string; name: string; grams: number }[];
  mine: boolean;
}

export interface FoodDetail extends FoodSearchResult {
  category: string | null;
  source: string;
  createdByMe: boolean;
}

export const FoodSearchQuery = z.object({ q: z.string().max(80).default(''), slot: MealSlot.optional(), limit: z.coerce.number().int().min(1).max(50).default(25) });

/* ───────── Offline food catalogue (browser cache, delta sync) ───────── */

/** Bump when CatalogFood changes shape: browsers holding an older format drop their copy and download afresh. */
export const FOOD_CATALOG_FORMAT = 1;

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
