import type { Band, MealSlot, Nutrient, NutrientThreshold, Thresholds } from '@clubhouse/contracts';
import { DAY_CLOSE_TIME } from './constants';

export type BandDirection = 'under' | 'ok' | 'over';
export type BandIcon = 'check' | 'dash' | 'alert' | 'progress';

export interface BandResult {
  band: Band;
  direction: BandDirection;
  label: string;
  icon: BandIcon;
  pct: number;
}

const NEUTRAL_BEFORE_CLOSE: Nutrient[] = ['kcal', 'carbs'];
const NEUTRAL_LABEL: Partial<Record<Nutrient, string>> = { kcal: 'room to fuel', carbs: 'room to go' };

/** SYS-CALC-21: the day counts as closed after 20:00 local or once dinner is logged; past days are closed. */
export function isDayClosed(opts: { isToday: boolean; localTime: string; loggedSlots: MealSlot[] }): boolean {
  if (!opts.isToday) return true;
  return opts.localTime >= DAY_CLOSE_TIME || opts.loggedSlots.includes('dinner');
}

export function bandFromThreshold(nutrient: Nutrient, pct: number, t: NutrientThreshold, dayClosed: boolean): BandResult {
  if (t.yellowUnderBelow != null && pct < t.yellowUnderBelow) {
    if (!dayClosed && NEUTRAL_BEFORE_CLOSE.includes(nutrient)) {
      return { band: 'neutral', direction: 'under', label: NEUTRAL_LABEL[nutrient] ?? 'on the way', icon: 'progress', pct };
    }
    return { band: 'yellow', direction: 'under', label: t.labels.under, icon: 'dash', pct };
  }
  if (t.greenUpTo == null || pct <= t.greenUpTo) return { band: 'green', direction: 'ok', label: t.labels.ok, icon: 'check', pct };
  if (t.yellowOverUpTo != null && pct <= t.yellowOverUpTo) return { band: 'yellow', direction: 'over', label: t.labels.overSoft, icon: 'dash', pct };
  if (t.redOver) return { band: 'red', direction: 'over', label: t.labels.over, icon: 'alert', pct };
  return { band: 'yellow', direction: 'over', label: t.labels.overSoft, icon: 'dash', pct };
}

/** SYS-CALC-20/21/22: percent of target → band + label + icon. Colour is never the only cue. */
export function bandFor(nutrient: Nutrient, eaten: number, target: number, thresholds: Thresholds, dayClosed: boolean): BandResult {
  if (!target || target <= 0) return { band: 'neutral', direction: 'ok', label: 'no target', icon: 'progress', pct: 0 };
  const pct = (eaten / target) * 100;
  return bandFromThreshold(nutrient, pct, thresholds[nutrient], dayClosed);
}

export interface NutrientTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export function allBands(totals: NutrientTotals, targets: NutrientTotals, thresholds: Thresholds, dayClosed: boolean): Record<Nutrient, BandResult> {
  return {
    kcal: bandFor('kcal', totals.kcal, targets.kcal, thresholds, dayClosed),
    protein: bandFor('protein', totals.protein, targets.protein, thresholds, dayClosed),
    carbs: bandFor('carbs', totals.carbs, targets.carbs, thresholds, dayClosed),
    fat: bandFor('fat', totals.fat, targets.fat, thresholds, dayClosed),
    fibre: bandFor('fibre', totals.fibre, targets.fibre, thresholds, dayClosed),
  };
}

/** In-range streak day: food was logged and calories ended inside the green or yellow band (not red). */
export function isInRangeDay(kcalEaten: number, kcalTarget: number, hadFoodLog: boolean, thresholds: Thresholds): boolean {
  if (!hadFoodLog) return false;
  const b = bandFor('kcal', kcalEaten, kcalTarget, thresholds, true);
  return b.band === 'green' || b.band === 'yellow';
}

/** Week-bar class used on Progress: 'in' (green), 'over' (above green), 'under' (below green). */
export function dayCalorieClass(kcalEaten: number, kcalTarget: number, thresholds: Thresholds): 'in' | 'over' | 'under' {
  const b = bandFor('kcal', kcalEaten, kcalTarget, thresholds, true);
  if (b.band === 'green') return 'in';
  return b.direction === 'over' ? 'over' : 'under';
}

export function sumTotals(items: NutrientTotals[]): NutrientTotals {
  return items.reduce(
    (a, x) => ({ kcal: a.kcal + x.kcal, protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat, fibre: a.fibre + x.fibre }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );
}

export const ZERO_TOTALS: NutrientTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
