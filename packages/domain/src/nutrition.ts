import type { NutrientTotals } from './bands';

export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export interface ServingOption {
  label: string;
  grams: number;
}

/** Nutrition for `grams` of a food given its per-100 g values. */
export function nutritionFor(per100g: Per100g, grams: number): NutrientTotals {
  const f = grams / 100;
  return {
    kcal: round1(per100g.kcal * f),
    protein: round1(per100g.protein * f),
    carbs: round1(per100g.carbs * f),
    fat: round1(per100g.fat * f),
    fibre: round1(per100g.fibre * f),
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function roundTotals(t: NutrientTotals): NutrientTotals {
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fibre: round1(t.fibre) };
}

/** Normalise a food name for search: lower-case, strip accents and punctuation, collapse spaces. */
export function normaliseName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Per-100 g values from a per-serving entry (used by custom foods and quick-add). */
export function per100gFromServing(n: NutrientTotals, grams: number): Per100g {
  const g = grams > 0 ? grams : 100;
  const f = 100 / g;
  return { kcal: round1(n.kcal * f), protein: round1(n.protein * f), carbs: round1(n.carbs * f), fat: round1(n.fat * f), fibre: round1(n.fibre * f) };
}

/** Energy check: kcal ≈ 4·protein + 4·carbs + 9·fat (+2·fibre). Returns the relative error. */
export function energyMismatch(n: Per100g): number {
  const computed = 4 * n.protein + 4 * Math.max(0, n.carbs - n.fibre) + 2 * n.fibre + 9 * n.fat;
  if (n.kcal <= 0) return computed > 5 ? 1 : 0;
  return Math.abs(computed - n.kcal) / n.kcal;
}
