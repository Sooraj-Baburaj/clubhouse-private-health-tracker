import { z } from 'zod';
import { FoodTag, MealSlot } from '../enums';
import { Nutrients, ServingOptionSchema, type BandDto, type ServingOptionDto } from './common';

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

export type { BandDto, ServingOptionDto };
export { ServingOptionSchema };
