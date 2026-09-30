import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { ACTIVITY_LEVELS, GOAL_TYPES, NUTRIENTS, type ActivityLevel, type GoalType, type Nutrient, type TargetsDto } from '@clubhouse/contracts';
import { ACTIVITY_LEVEL_LABELS } from '@clubhouse/domain';
import { cn } from '@/lib/cn';
import { fmtInt, fmtNum } from '@/lib/format';

export const NUTRIENT_LABEL: Record<Nutrient, string> = { kcal: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat', fibre: 'Fibre' };
export const NUTRIENT_UNIT: Record<Nutrient, string> = { kcal: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fibre: 'g' };
export { NUTRIENTS };

export const GOAL_LABEL: Record<GoalType, string> = { lose: 'Lose', maintain: 'Maintain', gain: 'Gain' };

export function asGoalType(v: string | null | undefined): GoalType | null {
  return v && (GOAL_TYPES as readonly string[]).includes(v) ? (v as GoalType) : null;
}
export function asActivityLevel(v: string | null | undefined): ActivityLevel | null {
  return v && (ACTIVITY_LEVELS as readonly string[]).includes(v) ? (v as ActivityLevel) : null;
}

export function activityLabel(v: string | null | undefined): string {
  const a = asActivityLevel(v);
  return a ? ACTIVITY_LEVEL_LABELS[a].label : v ? v : '—';
}

/** "Lose 0.5 kg / week", "Maintain", "Gain 0.25 kg / week", "No goal set". */
export function goalText(goalType: string | null | undefined, pace: number | null | undefined): string {
  const g = asGoalType(goalType);
  if (!g) return 'No goal set';
  if (g === 'maintain') return 'Maintain';
  return pace ? `${GOAL_LABEL[g]} ${fmtNum(pace, 2)} kg / week` : GOAL_LABEL[g];
}

/** "68.2 → 62 kg" or "80.3 kg". */
export function weightText(weight: number | null | undefined, target: number | null | undefined): string {
  if (weight == null && target == null) return '—';
  if (target == null || target === weight) return `${fmtNum(weight ?? null, 1)} kg`;
  return `${weight == null ? '—' : fmtNum(weight, 1)} → ${fmtNum(target, 1)} kg`;
}

export function macrosText(t: TargetsDto | null): string {
  if (!t) return '—';
  return `${fmtInt(t.protein)} / ${fmtInt(t.carbs)} / ${fmtInt(t.fat)} / ${fmtInt(t.fibre)}`;
}

/** Prominent safety-refusal / API-error callout (ADM-PLAN-11). */
export function Refusal({ title = 'Not saved', children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-start gap-2.5 rounded-[14px] border border-accent-border bg-accent-tint/50 p-3.5 text-[13px] leading-snug text-accent-dark', className)}>
      <ShieldAlert aria-hidden className="mt-[1px] h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-ink/80">{children}</span>
      </div>
    </div>
  );
}

/** Small mono section label used inside drawers. */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-hairline pt-4">
      <span className="text-[15px] font-semibold">{children}</span>
      {aside}
    </div>
  );
}
