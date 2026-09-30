import { z } from 'zod';
import { MealSlot } from '../enums';
import type { Nutrients, ServingOptionDto } from './common';

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
