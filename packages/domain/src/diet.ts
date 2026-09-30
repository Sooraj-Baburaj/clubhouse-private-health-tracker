import type { MealSlot } from '@clubhouse/contracts';
import type { NutrientTotals } from './bands';
import { SLOT_ORDER } from './constants';

/** Typical share of the day's calories per slot, used to size the "ideal" option for a slot. */
export const SLOT_WEIGHTS: Record<MealSlot, number> = {
  breakfast: 0.25,
  morning_snack: 0.1,
  lunch: 0.3,
  evening_snack: 0.1,
  dinner: 0.25,
};

export function remainingOf(targets: NutrientTotals, eaten: NutrientTotals): NutrientTotals {
  return {
    kcal: targets.kcal - eaten.kcal,
    protein: targets.protein - eaten.protein,
    carbs: targets.carbs - eaten.carbs,
    fat: targets.fat - eaten.fat,
    fibre: targets.fibre - eaten.fibre,
  };
}

export function idealKcalForSlot(slot: MealSlot, remaining: NutrientTotals, openSlots: MealSlot[]): number {
  const slots = openSlots.includes(slot) ? openSlots : [...openSlots, slot];
  const total = slots.reduce((a, s) => a + SLOT_WEIGHTS[s], 0) || 1;
  return Math.max(0, remaining.kcal) * (SLOT_WEIGHTS[slot] / total);
}

/** APP-DIET-03: an option "fits today" when it fits the remaining calories and does not blow the fat or carb budget. */
export function fitsToday(option: NutrientTotals, remaining: NutrientTotals): boolean {
  return option.kcal <= Math.max(0, remaining.kcal) + 50 && option.fat <= Math.max(0, remaining.fat) + 5 && option.carbs <= Math.max(0, remaining.carbs) + 10;
}

export function fitScore(option: NutrientTotals, ideal: number, remaining: NutrientTotals): number {
  return -Math.abs(option.kcal - ideal) + 4 * Math.min(option.protein, Math.max(0, remaining.protein));
}

export interface RankedOption<T> {
  option: T;
  fits: boolean;
  score: number;
}

/** Rank a slot's options: fitting options first, best score first; the first one is the "best fit". */
export function rankOptions<T extends { nutrition: NutrientTotals }>(
  slot: MealSlot,
  options: T[],
  remaining: NutrientTotals,
  openSlots: MealSlot[],
): RankedOption<T>[] {
  const ideal = idealKcalForSlot(slot, remaining, openSlots);
  return options
    .map((option) => ({ option, fits: fitsToday(option.nutrition, remaining), score: fitScore(option.nutrition, ideal, remaining) }))
    .sort((a, b) => (a.fits === b.fits ? b.score - a.score : a.fits ? -1 : 1));
}

/** The next slot to log: the current slot if it is still open, else the next open slot later today. */
export function nextOpenSlot(currentSlot: MealSlot, loggedSlots: MealSlot[]): MealSlot | null {
  const idx = SLOT_ORDER.indexOf(currentSlot);
  for (let i = idx; i < SLOT_ORDER.length; i++) {
    const s = SLOT_ORDER[i]!;
    if (!loggedSlots.includes(s)) return s;
  }
  return null;
}

export function openSlotsFrom(currentSlot: MealSlot, loggedSlots: MealSlot[]): MealSlot[] {
  const idx = SLOT_ORDER.indexOf(currentSlot);
  return SLOT_ORDER.slice(idx).filter((s) => !loggedSlots.includes(s));
}

/** Scale an option's portions to a member's calorie target (ADM-DIET-09 bulk assign). */
export function scaleFactor(templateDayKcal: number, memberKcal: number): number {
  if (templateDayKcal <= 0) return 1;
  const f = memberKcal / templateDayKcal;
  return Math.round(Math.max(0.5, Math.min(2, f)) * 20) / 20;
}
