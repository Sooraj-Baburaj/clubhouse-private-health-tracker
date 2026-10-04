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

/**
 * A dish logged as one item: its ingredients are for the whole batch of `batch` servings and `eaten` of them were
 * eaten, so the item is Σ ingredients × eaten ÷ batch (both weight and nutrition).
 */
export function dishNutrition(components: { nutrition: NutrientTotals; grams: number }[], batch: number, eaten: number): { nutrition: NutrientTotals; grams: number; total: NutrientTotals; totalGrams: number } {
  const total = components.reduce(
    (a, x) => ({ kcal: a.kcal + x.nutrition.kcal, protein: a.protein + x.nutrition.protein, carbs: a.carbs + x.nutrition.carbs, fat: a.fat + x.nutrition.fat, fibre: a.fibre + x.nutrition.fibre }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 },
  );
  const totalGrams = components.reduce((a, x) => a + (x.grams > 0 ? x.grams : 0), 0);
  const share = batch > 0 ? Math.max(0, eaten) / batch : 0;
  return {
    nutrition: { kcal: round1(total.kcal * share), protein: round1(total.protein * share), carbs: round1(total.carbs * share), fat: round1(total.fat * share), fibre: round1(total.fibre * share) },
    grams: Math.round(totalGrams * share * 10) / 10,
    total: roundTotals(total),
    totalGrams: Math.round(totalGrams * 10) / 10,
  };
}

/** Energy check: kcal ≈ 4·protein + 4·carbs + 9·fat (+2·fibre). Returns the relative error. */
export function energyMismatch(n: Per100g): number {
  const computed = 4 * n.protein + 4 * Math.max(0, n.carbs - n.fibre) + 2 * n.fibre + 9 * n.fat;
  if (n.kcal <= 0) return computed > 5 ? 1 : 0;
  return Math.abs(computed - n.kcal) / n.kcal;
}
