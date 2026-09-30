import type { MealSlot, Nutrient } from '../enums';
import type { BandDto, Nutrients, PersonRef } from './common';
import type { ActivityLogDto, FoodLogDto, MemeMomentDto, WeightEntryDto } from './logs';

export interface DietOptionDto {
  id: string;
  planId: string;
  mealSlot: MealSlot;
  dayType: 'any' | 'training' | 'rest';
  name: string;
  items: { foodId: string | null; name: string; grams: number; servings: number; servingLabel: string | null; nutrition: Nutrients; aiEstimate: boolean }[];
  nutrition: Nutrients;
  prepNote: string | null;
  imageUrl: string | null;
  fits: boolean;
  bestFit: boolean;
  favourite: boolean;
  notForMe: boolean;
  timesLogged: number;
}

export interface TodayResponse {
  date: string;
  isToday: boolean;
  localTime: string;
  dayClosed: boolean;
  goalWord: string;
  targets: Nutrients;
  budgetKcal: number;
  eaten: Nutrients;
  burned: number;
  net: number;
  remainingKcal: number;
  bands: Record<Nutrient, BandDto>;
  slots: { slot: MealSlot; label: string; logged: boolean; kcal: number }[];
  currentSlot: MealSlot;
  foodLogs: FoodLogDto[];
  activityLogs: ActivityLogDto[];
  weight: WeightEntryDto | null;
  latestWeightKg: number | null;
  nextUp: { slot: MealSlot; slotLabel: string; option: DietOptionDto | null; afterKcal: number | null } | null;
  summary: {
    mode: 'ai' | 'logic';
    text: string;
    updatedAt: string | null;
    aiCallId: string | null;
    swapIdea: string | null;
    why: { remainingKcal: number; lowestNutrient: { nutrient: Nutrient; pct: number } | null; nextSlot: MealSlot | null; weekAvgKcal: number | null };
  };
  crew: (PersonRef & { logged: boolean })[];
  crewLogged: number;
  crewTotal: number;
  streak: { current: number; best: number; status: string; graceLeft: number; atRisk: boolean };
  memeMoments: MemeMomentDto[];
  unread: { inbox: number; chat: number };
  planProgress: { itemId: string; typeName: string; done: number; target: number }[];
}
