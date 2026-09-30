import { z } from 'zod';
import { MealSlot } from '../enums';
import { IsoDateTime, LocalDateStr, type Nutrients, type PersonRef } from './common';
import type { DietOptionDto } from './today';

export interface DietPlanSummary {
  id: string;
  name: string;
  version: number;
  note: string | null;
  publishedBy: PersonRef | null;
  publishedAt: string | null;
  effectiveFrom: string | null;
  aiGenerated: boolean;
  reviewedBy: PersonRef | null;
  hasDayTypes: boolean;
}

export interface DietResponse {
  date: string;
  plan: DietPlanSummary | null;
  dayType: 'training' | 'rest';
  targets: Nutrients | null;
  remaining: Nutrients | null;
  slots: { slot: z.infer<typeof MealSlot>; label: string; logged: boolean; options: DietOptionDto[] }[];
  previous: { id: string; version: number; publishedAt: string | null; viewableUntil: string } | null;
  updatedBanner: { by: string; on: string; note: string | null } | null;
  suggestions: { slot: z.infer<typeof MealSlot>; label: string; foods: { id: string; name: string; servingLabel: string; servingGrams: number; kcal: number; protein: number }[] }[] | null;
  swapIdea: string | null;
}

export const LogOptionRequest = z.object({
  logId: z.string().uuid(),
  date: LocalDateStr,
  mealSlot: MealSlot.optional(),
  loggedAt: IsoDateTime,
  /** Optional portion factor per item index (1 = as planned). */
  portions: z.array(z.number().min(0).max(5)).max(20).optional(),
});
export type LogOptionRequest = z.infer<typeof LogOptionRequest>;

export const OptionFeedbackRequest = z.object({ reaction: z.enum(['favourite', 'dislike']).nullable() });
