import { AnimatePresence, motion } from 'motion/react';
import { useId } from 'react';
import { GOAL_TYPES, type GoalType } from '@clubhouse/contracts';
import { ACTIVITY_LEVEL_LABELS, GAIN_PACES, kgToLb, LOSE_PACES, type TargetResult } from '@clubhouse/domain';
import { AnimatedNumber } from '@clubhouse/ui';
import { fmt, fmt1 } from '@/features/format';
import { cn } from '@/lib/cn';
import { Chip } from '@/ui/atoms/Chip';
import { TextField } from '@/ui/atoms/Field';
import { Toggle } from '@/ui/atoms/Toggle';
import { minTargetDate, previewTargets, type About, type GoalDraft } from './model';

const GOALS: Record<GoalType, { label: string; desc: string }> = {
  lose: { label: 'Lean out', desc: 'Lose weight at a steady pace' },
  maintain: { label: 'Hold steady', desc: 'Keep weight, build fitness' },
  gain: { label: 'Bulk up', desc: 'Gain lean mass slowly' },
};

const paceLabel = (kg: number, imperial: boolean) => (imperial ? `${fmt1(kgToLb(kg))} lb` : `${kg} kg`);

/** Step 2 "Your goal": goal cards with a kcal preview each, pace chips or a target date, and the live target card. */
export function StepGoal({ about, value, onChange, today, dateError }: { about: About; value: GoalDraft; onChange: (g: GoalDraft) => void; today: string; dateError?: string | null }) {
  const set = (patch: Partial<GoalDraft>) => onChange({ ...value, ...patch });
  const imperial = about.units === 'imperial';
  const paces = value.goal === 'gain' ? GAIN_PACES : LOSE_PACES;
  const preview = previewTargets(about, value.goal, value, today);
  const goalId = useId();
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-labelledby={goalId} className="flex flex-col gap-2.5">
        <span id={goalId} className="sr-only">
          Goal
        </span>
        {GOAL_TYPES.map((g) => {
          const on = value.goal === g;
          const kcal = previewTargets(about, g, { ...value, mode: 'pace', pace: g === 'gain' ? Math.min(value.pace, 0.5) : value.pace }, today).kcal;
          return (
            <motion.button
              key={g}
              type="button"
              role="radio"
              aria-checked={on}
              whileTap={{ scale: 0.98 }}
              onClick={() => set({ goal: g, pace: g === 'gain' ? Math.min(value.pace, 0.5) : value.pace })}
              className={cn('flex items-center justify-between gap-3 rounded-[28px] border-2 px-5 py-4 text-left transition-colors', on ? 'border-accent bg-accent-200' : 'border-transparent bg-surface')}
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-heading text-[19px] leading-tight">{GOALS[g].label}</span>
                <span className="text-[13px] text-neutral-700">{GOALS[g].desc}</span>
              </span>
              <span className="shrink-0 text-[15px] font-extrabold tabular">
                {fmt(kcal)}
                <span className="sr-only"> kcal a day</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {value.goal !== 'maintain' && (
          <motion.div key="pace" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-neutral-700">{value.mode === 'pace' ? 'Pace per week' : 'Aim for a date'}</span>
              <label className="flex items-center gap-2 text-[13px] font-bold">
                Set a target date
                <Toggle checked={value.mode === 'date'} onChange={(on) => set({ mode: on ? 'date' : 'pace' })} label="Set a target date instead of a pace" />
              </label>
            </div>
            {value.mode === 'pace' ? (
              <div role="radiogroup" aria-label="Pace per week" className="flex flex-wrap gap-2">
                {paces.map((p) => (
                  <Chip key={p} selected={value.pace === p} onClick={() => set({ pace: p })} className="min-h-11 px-4">
                    {paceLabel(p, imperial)}
                  </Chip>
                ))}
              </div>
            ) : (
              <TextField label="Target date" type="date" min={minTargetDate(today)} value={value.targetDate} onChange={(e) => set({ targetDate: e.target.value })} error={dateError} />
            )}
            <TextField
              label={value.mode === 'date' ? 'Target weight' : 'Target weight (optional)'}
              inputMode="decimal"
              value={value.targetWeight}
              onChange={(e) => set({ targetWeight: e.target.value })}
              suffix={<span className="text-neutral-700">{imperial ? 'lb' : 'kg'}</span>}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <TargetPreviewCard about={about} t={preview} />
    </div>
  );
}

export function TargetPreviewCard({ about, t }: { about: About; t: TargetResult }) {
  const weight = about.units === 'imperial' ? `${fmt(kgToLb(about.weightKg))} lb` : `${fmt1(about.weightKg)} kg`;
  const level = ACTIVITY_LEVEL_LABELS[about.activityLevel].label.toLowerCase();
  return (
    <motion.div layout className="flex flex-col gap-1 rounded-[28px] bg-accent-2-200 px-[18px] py-4 text-accent-2-900" aria-live="polite">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent-2-800">Your daily target</div>
      <div className="font-heading text-[30px] leading-tight tabular">
        <AnimatedNumber value={t.kcal} /> kcal
      </div>
      <div className="text-[14px] font-semibold">{t.explanation}.</div>
      <div className="mt-1 grid grid-cols-4 gap-1.5 text-center text-[12px]">
        {(
          [
            ['Protein', t.protein],
            ['Carbs', t.carbs],
            ['Fat', t.fat],
            ['Fibre', t.fibre],
          ] as const
        ).map(([k, v]) => (
          <span key={k} className="rounded-[16px] bg-accent-2-100 px-1 py-1.5">
            <span className="block font-extrabold tabular">{fmt(v)} g</span>
            <span className="text-accent-2-800">{k}</span>
          </span>
        ))}
      </div>
      <div className="mt-1 text-[12px] text-accent-2-800">
        Mifflin-St Jeor · {weight} · {about.units === 'imperial' ? `${Math.floor(about.heightCm / 30.48)} ft ${Math.round((about.heightCm / 2.54) % 12)} in` : `${fmt(about.heightCm)} cm`} · {level}.{' '}
        {t.floorHit ? `We held this at the safe floor of ${fmt(t.floor)} kcal.` : `Never below the safe floor of ${fmt(t.floor)}.`}
        {t.paceCapped && ' That pace is quicker than we plan for, so we eased it to a safe one.'}
      </div>
    </motion.div>
  );
}
