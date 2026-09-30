import {
  DEFAULT_THRESHOLDS,
  MEAL_SLOTS,
  type DayType,
  type MealSlot,
  type Nutrients,
  type Thresholds,
} from '@clubhouse/contracts';
import type { BandResult } from '@clubhouse/domain';
import { useMeAdmin } from '@/features/me';
import { fmtInt, fmtNum, SLOT_LABELS } from '@/lib/format';
import { cn } from '@/lib/cn';
import { BandPill, type BandKey } from '@/ui';

export { MEAL_SLOTS };

/** Team meal-slot labels (Settings), falling back to the defaults. */
export function useSlotLabels(): Record<MealSlot, string> {
  const me = useMeAdmin();
  const slots = me.data?.team.mealSlots;
  return Object.fromEntries(
    MEAL_SLOTS.map((s) => [s, slots?.[s]?.label || SLOT_LABELS[s] || s]),
  ) as Record<MealSlot, string>;
}

/** Team band thresholds (Settings), falling back to Appendix E defaults. */
export function useThresholds(): Thresholds {
  return useMeAdmin().data?.team.thresholds ?? DEFAULT_THRESHOLDS;
}

/** AI drafting is available when the team switch and the diet.draft feature are both on. */
export function useAiDraftAvailable(): {
  available: boolean;
  reason: string | null;
  loading: boolean;
} {
  const me = useMeAdmin();
  const ai = me.data?.ai;
  if (!ai) return { available: false, reason: null, loading: me.isPending };
  if (!ai.teamOn)
    return {
      available: false,
      reason: 'AI is switched off for the team. Turn it on in AI settings to draft with AI.',
      loading: false,
    };
  if (!ai.features['diet.draft'])
    return {
      available: false,
      reason: 'The “Diet plan drafts” AI feature is off. Turn it on in AI settings.',
      loading: false,
    };
  return { available: true, reason: null, loading: false };
}

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  any: 'Any day',
  training: 'Training day',
  rest: 'Rest day',
};
export const DAY_TYPE_OPTIONS: { value: DayType; label: string }[] = [
  { value: 'any', label: 'Any day' },
  { value: 'training', label: 'Training' },
  { value: 'rest', label: 'Rest' },
];

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const;
export const NUTRIENT_LABEL: Record<(typeof NUTRIENT_KEYS)[number], string> = {
  kcal: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fibre: 'Fibre',
};

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };

/** "P 22 · C 48 · F 12" (grams). */
export function macroText(n: Nutrients, withFibre = false): string {
  const parts = [`P ${fmtNum(n.protein, 0)}`, `C ${fmtNum(n.carbs, 0)}`, `F ${fmtNum(n.fat, 0)}`];
  if (withFibre) parts.push(`Fb ${fmtNum(n.fibre, 0)}`);
  return parts.join(' · ');
}

/** kcal + macros in mono. */
export function MacroLine({
  n,
  className,
  withFibre,
}: {
  n: Nutrients;
  className?: string;
  withFibre?: boolean;
}) {
  return (
    <span className={cn('font-mono text-[12px] text-muted', className)}>
      <span className="font-semibold text-ink">{fmtInt(n.kcal)} kcal</span> ·{' '}
      {macroText(n, withFibre)}
    </span>
  );
}

export function bandKeyOf(b: Pick<BandResult, 'band'>): BandKey {
  return b.band;
}

/** Band pill with the nutrient name (colour + icon + words). */
export function NutrientBand({
  nutrient,
  band,
  pct,
}: {
  nutrient: (typeof NUTRIENT_KEYS)[number];
  band: Pick<BandResult, 'band' | 'label'>;
  pct?: number;
}) {
  const label = `${NUTRIENT_LABEL[nutrient]}${pct != null && band.band !== 'neutral' ? ` ${Math.round(pct)}%` : ''} · ${band.label}`;
  return <BandPill band={bandKeyOf(band)} label={label} />;
}

/** zod issues → { 'path.to.field': message } (first message per field). */
export function zodErrors(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = i.path.map(String).join('.') || '_';
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

/** Sum of nutrients. */
export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fibre: a.fibre + b.fibre,
  };
}

export function scaleNutrients(n: Nutrients, f: number): Nutrients {
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return {
    kcal: r(n.kcal),
    protein: r(n.protein),
    carbs: r(n.carbs),
    fat: r(n.fat),
    fibre: r(n.fibre),
  };
}
