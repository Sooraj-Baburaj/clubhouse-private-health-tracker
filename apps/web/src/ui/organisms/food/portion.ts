import type { ServingOptionDto } from '@clubhouse/contracts';
import { acceptsTypedWeight, isWeightUnit, parseServingLabel, unitName, weightUnitFor } from '@clubhouse/domain';
import type { CartItem } from '@/features/food';

/*
 * Choosing a portion (Food detail, an AI-read row, a dish ingredient): one of the food's portions and how many, or a
 * typed weight in g (ml for drinks). A typed weight is stored as one portion of that weight ("150 g × 1").
 */

export type PortionChoice = { kind: 'unit'; option: ServingOptionDto; qty: number } | { kind: 'weight'; grams: number; unit: 'g' | 'ml' };

const WEIGHT_LABEL = /^(\d+(?:\.\d+)?)\s*(g|ml)$/;

/** The chip for a portion: "katori", "scoop", "100 g", or a legacy label as it was saved. */
export function chipLabel(o: ServingOptionDto): string {
  if (o.unit && !isWeightUnit(o.unit) && (o.amount ?? 1) === 1) return o.unit === 'custom' ? (parseServingLabel(o.label)?.noun || o.label) : unitName(o.unit);
  return o.label;
}

/** The weight unit for typed amounts on this food (ml when it is measured by volume). */
export function typedUnit(options: ServingOptionDto[]): 'g' | 'ml' {
  return options.some((o) => o.unit === 'ml' || (o.unit && weightUnitFor(o.unit) === 'ml')) ? 'ml' : 'g';
}

/** The portions offered for a food: its own, then a typed weight unless every portion is a nominal guess. */
export function portionOptions(options: ServingOptionDto[]): { options: ServingOptionDto[]; typed: 'g' | 'ml' | null } {
  // The 100 g/ml portion is covered by typing a weight.
  const list = options.filter((o) => !WEIGHT_LABEL.test(o.label));
  const typed = acceptsTypedWeight(options) ? typedUnit(options) : null;
  return { options: list.length || typed ? list : options, typed };
}

/** The current choice for a line, given the food's portions. */
export function choiceOf(item: Pick<CartItem, 'unitLabel' | 'unitGrams' | 'qty'>, options: ServingOptionDto[]): PortionChoice {
  const opt = options.find((o) => o.label === item.unitLabel);
  if (opt && !WEIGHT_LABEL.test(opt.label)) return { kind: 'unit', option: opt, qty: item.qty };
  const m = WEIGHT_LABEL.exec(item.unitLabel);
  if (m) return { kind: 'weight', grams: Math.round(Number(m[1]) * item.qty), unit: m[2] as 'g' | 'ml' };
  // A portion the food doesn't list (an AI household measure, a saved label): offer it as it was logged.
  return { kind: 'unit', option: { label: item.unitLabel, grams: item.unitGrams }, qty: item.qty };
}

export function applyChoice<T extends CartItem>(item: T, c: PortionChoice): T {
  if (c.kind === 'weight') return { ...item, unitLabel: `${Math.round(c.grams)} ${c.unit}`, unitGrams: Math.max(0, c.grams), qty: 1, estimated: false };
  return { ...item, unitLabel: c.option.label, unitGrams: c.option.grams, qty: c.qty, estimated: !!c.option.estimated || (item.estimated && c.option.label === item.unitLabel) };
}

/** Steps under one go by a quarter, above by a half (½ roti is real; 2¼ rarely is). */
export const stepDown = (q: number) => Math.max(0.25, Math.round((q - (q > 1 ? 0.5 : 0.25)) * 100) / 100);
export const stepUp = (q: number) => Math.round((q + (q >= 1 ? 0.5 : 0.25)) * 100) / 100;
export const FRACTIONS = [0.25, 0.5, 0.75, 1, 1.5, 2];

/** The grams of a choice. */
export const choiceGrams = (c: PortionChoice) => (c.kind === 'weight' ? c.grams : c.option.grams * c.qty);
