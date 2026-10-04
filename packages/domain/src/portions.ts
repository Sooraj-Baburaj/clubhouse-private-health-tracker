import type { FoodPortionInput, Nutrients, PortionUnit, ServingOptionDto } from '@clubhouse/contracts';
import { per100gFromServing, round1, type Per100g } from './nutrition';

/*
 * Food portions (v2). Nutrition stays canonical per 100 g; a portion is a named amount with a weight. Volume units
 * count 1 ml as 1 g, the usual convention for logging drinks and curries.
 */

export type UnitKind = 'mass' | 'volume' | 'count';

export interface UnitMeta {
  one: string;
  many: string;
  kind: UnitKind;
  /** A typical weight for one unit (g, or ml for volume), shown as a hint and used when the member isn't sure. */
  typical: number | null;
}

export const UNIT_META: Record<PortionUnit, UnitMeta> = {
  g: { one: 'g', many: 'g', kind: 'mass', typical: 1 },
  ml: { one: 'ml', many: 'ml', kind: 'volume', typical: 1 },
  piece: { one: 'piece', many: 'pieces', kind: 'count', typical: null },
  scoop: { one: 'scoop', many: 'scoops', kind: 'count', typical: 32 },
  cup: { one: 'cup', many: 'cups', kind: 'volume', typical: 240 },
  glass: { one: 'glass', many: 'glasses', kind: 'volume', typical: 250 },
  katori: { one: 'katori', many: 'katoris', kind: 'count', typical: 150 },
  bowl: { one: 'bowl', many: 'bowls', kind: 'count', typical: 250 },
  plate: { one: 'plate', many: 'plates', kind: 'count', typical: 350 },
  tbsp: { one: 'tbsp', many: 'tbsp', kind: 'count', typical: 15 },
  tsp: { one: 'tsp', many: 'tsp', kind: 'count', typical: 5 },
  slice: { one: 'slice', many: 'slices', kind: 'count', typical: 30 },
  packet: { one: 'packet', many: 'packets', kind: 'count', typical: null },
  serving: { one: 'serving', many: 'servings', kind: 'count', typical: null },
  custom: { one: 'unit', many: 'units', kind: 'count', typical: null },
};

/** Weight used for a count unit when the member doesn't know it (per-unit nutrition stays exact either way). */
const NOMINAL_GRAMS = 100;

export const isWeightUnit = (u: PortionUnit | null | undefined) => u === 'g' || u === 'ml';
/** The weight unit shown next to a portion: ml for drinks measured by volume, else g. */
export const weightUnitFor = (u: PortionUnit | null | undefined): 'g' | 'ml' => (u && UNIT_META[u].kind === 'volume' ? 'ml' : 'g');

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

/** 0.5 → "½", 1.5 → "1½", 2 → "2", 0.3 → "0.3". */
export function fractionText(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.01) return String(whole);
  const frac = FRACTIONS.find(([v]) => Math.abs(v - rest) < 0.01);
  if (frac) return `${whole || ''}${frac[1]}`;
  return String(Math.round(n * 100) / 100);
}

const NO_PLURAL = new Set(['g', 'kg', 'ml', 'l', 'oz', 'tbsp', 'tsp', 'pcs', 'medium', 'small', 'large', 'x']);

/** Everyday English plural for portion nouns: roti → rotis, glass → glasses, slice → slices, pcs stays. */
export function pluralNoun(noun: string): string {
  const words = noun.split(' ');
  const last = words.at(-1) ?? '';
  const lower = last.toLowerCase();
  if (!last || NO_PLURAL.has(lower) || (/s$/.test(lower) && !/(ss|us)$/.test(lower))) return noun;
  let p: string;
  if (/(s|x|z|ch|sh)$/.test(lower)) p = `${last}es`;
  else if (/[^aeiou]y$/.test(lower)) p = `${last.slice(0, -1)}ies`;
  else p = `${last}s`;
  return [...words.slice(0, -1), p].join(' ');
}

/** The singular name of a portion's unit ("scoop", or the custom name). */
export function unitName(unit: PortionUnit, custom?: string | null): string {
  return unit === 'custom' ? (custom?.trim() || 'unit') : UNIT_META[unit].one;
}

/** "1 scoop", "2 slices", "150 g". */
export function portionLabel(amount: number, unit: PortionUnit, custom?: string | null): string {
  if (isWeightUnit(unit)) return `${round1(amount)} ${unit}`;
  const name = unitName(unit, custom);
  const meta = UNIT_META[unit];
  const noun = Math.abs(amount - 1) < 1e-9 || amount < 1 ? name : unit === 'custom' ? pluralNoun(name) : meta.many;
  return `${fractionText(amount)} ${noun}`;
}

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * Split a legacy serving label into a number and its noun: "2 pcs", "1 roti", "100 g", and fractions as they are
 * written — "1/3 cup", "1 /4 cup", "1 1/2 cups", "½ katori", "1½ cups".
 */
export function parseServingLabel(label: string): { amount: number; noun: string } | null {
  const ok = (amount: number, noun: string | undefined) => (amount > 0 && Number.isFinite(amount) ? { amount, noun: (noun ?? '').trim() } : null);
  const mixed = /^\s*(\d+)\s+(\d+)\s*\/\s*(\d+)\s*(.*?)\s*$/.exec(label);
  if (mixed) return Number(mixed[3]) > 0 ? ok(Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]), mixed[4]) : null;
  const ratio = /^\s*(\d+)\s*\/\s*(\d+)\s*(.*?)\s*$/.exec(label);
  if (ratio) return Number(ratio[2]) > 0 ? ok(Number(ratio[1]) / Number(ratio[2]), ratio[3]) : null;
  const unicode = /^\s*(\d+)?\s*([¼½¾⅓⅔⅛])\s*(.*?)\s*$/.exec(label);
  if (unicode) return ok(Number(unicode[1] ?? 0) + UNICODE_FRACTIONS[unicode[2]!]!, unicode[3]);
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(.*?)\s*$/.exec(label);
  if (!m) return null;
  return ok(Number(m[1]!.replace(',', '.')), m[2]);
}

/**
 * What `qty` of a portion reads as: 2 × "1 scoop" → "2 scoops", ½ × "1 katori" → "½ katori", 1.5 × "100 g" →
 * "150 g", 1.5 × "2 pcs" → "3 pcs". Labels that don't start with a number fall back to "1½ × large bowl".
 */
export function portionText(qty: number, option: Pick<ServingOptionDto, 'label' | 'unit' | 'amount'>): string {
  if (option.unit && option.unit !== 'custom') {
    const amount = (option.amount ?? 1) * qty;
    return portionLabel(amount, option.unit);
  }
  const parsed = parseServingLabel(option.label);
  if (!parsed) return Math.abs(qty - 1) < 1e-9 ? option.label : `${fractionText(qty)} × ${option.label}`;
  const total = parsed.amount * qty;
  if (!parsed.noun) return fractionText(total);
  if (NO_PLURAL.has(parsed.noun.toLowerCase())) return `${round1(total)} ${parsed.noun}`;
  const singular = Math.abs(total - 1) < 1e-9 || total < 1;
  const noun = singular ? singularNoun(parsed.noun) : pluralNoun(singularNoun(parsed.noun));
  return `${fractionText(total)} ${noun}`;
}

/** Best-effort singular for labels saved as "2 rotis" (rotis → roti, glasses → glass). */
function singularNoun(noun: string): string {
  const words = noun.split(' ');
  const last = words.at(-1) ?? '';
  const lower = last.toLowerCase();
  if (NO_PLURAL.has(lower)) return noun;
  let s = last;
  if (/(ss|us)$/.test(lower)) s = last;
  else if (/ies$/.test(lower)) s = `${last.slice(0, -3)}y`;
  else if (/(ses|xes|zes|ches|shes)$/.test(lower)) s = last.slice(0, -2);
  else if (/s$/.test(lower)) s = last.slice(0, -1);
  return [...words.slice(0, -1), s].join(' ');
}

/**
 * An AI household measure as one unit and a count: "2 rotis" (quantity 2, 80 g) → "1 roti" × 2 of 40 g each. A measure
 * whose number doesn't match the quantity ("½ cup", "150 g") stays one portion of the whole weight.
 */
export function householdPortion(measure: string, quantity: number, grams: number): { label: string; grams: number; qty: number } {
  const q = quantity > 0 ? quantity : 1;
  const parsed = parseServingLabel(measure);
  if (parsed?.noun && !isWeightNoun(parsed.noun) && Math.abs(parsed.amount - q) < 0.01) return { label: portionText(1 / parsed.amount, { label: measure }), grams: grams / q, qty: q };
  return { label: measure, grams, qty: 1 };
}

const isWeightNoun = (noun: string) => /^(g|gm|grams?|ml|kg|l)$/i.test(noun.trim());

/** Typical weight of one unit, or null when there is no sensible default. */
export function typicalGrams(unit: PortionUnit): number | null {
  return UNIT_META[unit].typical;
}

export interface BuiltFood {
  per100g: Per100g;
  servingOptions: ServingOptionDto[];
  defaultServing: string;
}

const perUnit = (p: { amount: number; grams: number | null }) => (p.grams != null && p.amount > 0 ? p.grams / p.amount : null);

/**
 * Turn a food draft (nutrition for one basis portion plus other portions) into per-100 g nutrition and serving
 * options of one unit each. Without a known basis weight the food gets a nominal weight flagged `estimated`, so it is
 * logged by that unit only; weights of other portions can't be related to it then, so they are left out.
 */
export function buildFood(d: { basis: FoodPortionInput; nutrients: Nutrients; portions: FoodPortionInput[] }): BuiltFood {
  const basisWeight = isWeightUnit(d.basis.unit) ? d.basis.amount : d.basis.grams;
  const known = basisWeight != null && basisWeight > 0;
  const nominalPerUnit = typicalGrams(d.basis.unit) ?? NOMINAL_GRAMS;
  const basisGrams = known ? basisWeight : nominalPerUnit * d.basis.amount;
  const per100g = per100gFromServing(d.nutrients, basisGrams);
  const options: ServingOptionDto[] = [];
  const add = (o: ServingOptionDto) => {
    if (!options.some((x) => x.label.toLowerCase() === o.label.toLowerCase())) options.push(o);
  };
  const optionFor = (unit: PortionUnit, label: string | undefined, gramsPerUnit: number, estimated: boolean): ServingOptionDto => ({
    label: portionLabel(1, unit, label).slice(0, 40),
    grams: Math.round(gramsPerUnit * 10) / 10,
    unit,
    amount: 1,
    ...(estimated ? { estimated: true } : {}),
  });
  const weightOption = (unit: 'g' | 'ml'): ServingOptionDto => ({ label: `100 ${unit}`, grams: 100, unit, amount: 100 });

  let defaultLabel: string | null = null;
  if (isWeightUnit(d.basis.unit)) add(weightOption(d.basis.unit as 'g' | 'ml'));
  else {
    const o = optionFor(d.basis.unit, d.basis.label, basisGrams / d.basis.amount, !known);
    add(o);
    if (d.basis.isDefault !== false) defaultLabel = o.label;
  }
  if (known) {
    for (const p of d.portions) {
      if (isWeightUnit(p.unit)) {
        add(weightOption(p.unit as 'g' | 'ml'));
        continue;
      }
      const g = perUnit(p);
      if (g == null) continue;
      const o = optionFor(p.unit, p.label, g, false);
      add(o);
      if (p.isDefault) defaultLabel = o.label;
    }
    // Typed grams (or ml) always work for a food with a real weight; the 100-unit option keeps search results sane.
    add(weightOption(weightUnitFor(d.basis.unit)));
  }
  const capped = options.slice(0, 12);
  return { per100g, servingOptions: capped, defaultServing: defaultLabel && capped.some((o) => o.label === defaultLabel) ? defaultLabel : capped[0]!.label };
}

/** A food can take a typed weight unless every portion is a nominal guess (logged by its unit only). */
export function acceptsTypedWeight(options: ServingOptionDto[]): boolean {
  return options.length === 0 || options.some((o) => !o.estimated);
}
