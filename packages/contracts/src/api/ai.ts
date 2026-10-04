import { z } from 'zod';
import { MealSlot } from '../enums';
import type { Nutrients, ServingOptionDto } from './common';

/** A food from our database that the photo might also show ("Did you mean"). */
export interface FoodAlternativeDto {
  foodId: string;
  name: string;
  per100g: Nutrients;
  servingOptions: ServingOptionDto[];
  verified: boolean;
  scope: 'global' | 'team' | 'mine';
}

export interface RecognisedItemDto {
  name: string;
  foodId: string | null;
  matched: boolean;
  grams: number;
  servingLabel: string;
  quantity: number;
  confidence: number;
  nutrition: Nutrients;
  per100g: Nutrients;
  servingOptions: ServingOptionDto[];
  aiEstimate: boolean;
  /** Where a matched food lives (Verified, Team food, Mine); null for an AI estimate. */
  scope: 'global' | 'team' | 'mine' | null;
  verified: boolean;
  /** Close database matches, best first (not including the matched food). */
  alternatives: FoodAlternativeDto[];
  /** Food tags the AI saw (used to prefill "Save as a food"). */
  tags: string[];
}

export interface RecognitionResponse {
  ok: boolean;
  reason: string | null;
  message: string | null;
  callId: string | null;
  imageId: string | null;
  items: RecognisedItemDto[];
  overallConfidence: number;
  lowConfidence: boolean;
  note: string;
  /** When the items look like the ingredients of one dish (a fruit salad), its name. */
  dishName: string | null;
}

export const FoodTextRequest = z.object({ text: z.string().trim().min(2).max(300), slot: MealSlot });

export interface SummaryResponse {
  mode: 'ai' | 'logic';
  sentences: string[];
  swapIdea: string | null;
  updatedAt: string | null;
  callId: string | null;
  stale: boolean;
}

export interface UploadResponse {
  id: string;
  url: string | null;
  thumbUrl: string | null;
  width: number;
  height: number;
  bytes: number;
}
