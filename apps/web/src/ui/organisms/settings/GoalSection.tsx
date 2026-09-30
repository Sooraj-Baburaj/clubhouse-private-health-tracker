import { Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { GoalType } from '@clubhouse/contracts';
import { kgToLb, lbToKg } from '@clubhouse/domain';
import { useDebounced } from '@clubhouse/ui';
import { dateLabel } from '@/features/format';
import { useMeData } from '@/features/me';
import { useTargetsPreview, useUpdateGoal } from '@/features/settings';
import { Button } from '@/ui/atoms/Button';
import { Chip } from '@/ui/atoms/Chip';
import { Segmented } from '@/ui/atoms/Segmented';
import { ListGroup } from '@/ui/molecules/ListGroup';
import { cn } from '@/lib/cn';
import { Divider, FieldRow, inputCls } from './Kit';
import { TargetsCard } from './TargetsCard';

const GOALS: { value: GoalType; label: string; sub: string }[] = [
  { value: 'lose', label: 'Lean out', sub: 'A gentle calorie gap' },
  { value: 'maintain', label: 'Hold steady', sub: 'Eat what you burn' },
  { value: 'gain', label: 'Bulk up', sub: 'A small surplus' },
];
const PACES = [0.25, 0.5, 0.75, 1];

export function GoalSection() {
  const me = useMeData();
  const p = me.profile;
  const imperial = p.units === 'imperial';
  const save = useUpdateGoal();
  const initial = useMemo(
    () => ({ goalType: (p.goalType ?? 'maintain') as GoalType, paceKgWeek: p.paceKgWeek ?? 0.5, targetWeightKg: p.targetWeightKg, targetDate: p.targetDate, mode: (p.targetDate ? 'date' : 'pace') as 'pace' | 'date' }),
    [p],
  );
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const body = {
    goalType: f.goalType,
    paceKgWeek: f.goalType === 'maintain' ? null : f.mode === 'pace' ? f.paceKgWeek : null,
    targetWeightKg: f.goalType === 'maintain' ? null : f.targetWeightKg,
    targetDate: f.goalType === 'maintain' || f.mode === 'pace' ? null : f.targetDate,
  };
  const dirty = JSON.stringify(body) !== JSON.stringify({ goalType: initial.goalType, paceKgWeek: initial.goalType === 'maintain' ? null : initial.mode === 'pace' ? initial.paceKgWeek : null, targetWeightKg: initial.goalType === 'maintain' ? null : initial.targetWeightKg, targetDate: initial.goalType === 'maintain' || initial.mode === 'pace' ? null : initial.targetDate });
  const previewInput = useDebounced(dirty ? body : null, 350);
  const preview = useTargetsPreview(previewInput);
  const t = me.targets;
  const shown = dirty && preview.data?.preview ? preview.data.preview : t;
  const showW = (kg: number | null) => (kg == null ? '' : String(Math.round((imperial ? kgToLb(kg) : kg) * 10) / 10));
  const wrongWay = f.targetWeightKg != null && p.weightKg != null && ((f.goalType === 'lose' && f.targetWeightKg >= p.weightKg) || (f.goalType === 'gain' && f.targetWeightKg <= p.weightKg));

  return (
    <div className="flex flex-col gap-3.5">
      <div role="radiogroup" aria-label="Goal" className="grid grid-cols-3 gap-2">
        {GOALS.map((g) => {
          const on = f.goalType === g.value;
          return (
            <motion.button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={on}
              whileTap={{ scale: 0.96 }}
              onClick={() => set('goalType', g.value)}
              className={cn('flex min-h-[92px] flex-col items-start justify-end gap-0.5 rounded-[24px] border-2 p-3 text-left transition-colors', on ? 'border-accent bg-accent text-on-accent' : 'border-transparent bg-surface')}
            >
              <span className="font-heading text-[17px] leading-tight">{g.label}</span>
              <span className={cn('text-[11px]', on ? 'text-on-accent-sub' : 'text-neutral-700')}>{g.sub}</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {f.goalType !== 'maintain' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ListGroup title="Where you’re heading">
              <FieldRow label={`Target weight (${imperial ? 'lb' : 'kg'})`} hint={wrongWay ? (f.goalType === 'lose' ? 'That’s above your current weight — pick a lower number to lean out.' : 'That’s below your current weight — pick a higher number to bulk up.') : undefined}>
                <input
                  className={inputCls}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={showW(f.targetWeightKg)}
                  placeholder={p.weightKg ? `Now ${showW(p.weightKg)}` : undefined}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    set('targetWeightKg', v == null || !Number.isFinite(v) ? null : Math.round((imperial ? lbToKg(v) : v) * 10) / 10);
                  }}
                />
              </FieldRow>
              <Divider />
              <FieldRow label="Go by">
                <Segmented
                  label="Pace or date"
                  value={f.mode}
                  onChange={(v) => set('mode', v)}
                  options={[
                    { value: 'pace', label: 'Weekly pace' },
                    { value: 'date', label: 'Target date' },
                  ]}
                />
                {f.mode === 'pace' ? (
                  <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label="Pace per week">
                    {PACES.map((v) => (
                      <Chip key={v} selected={f.paceKgWeek === v} onClick={() => set('paceKgWeek', v)}>
                        {imperial ? `${Math.round(kgToLb(v) * 10) / 10} lb` : `${v} kg`} / week
                      </Chip>
                    ))}
                  </div>
                ) : (
                  <input className={cn(inputCls, 'mt-1')} type="date" min={me.today} value={f.targetDate ?? ''} onChange={(e) => set('targetDate', e.target.value || null)} aria-label="Target date" />
                )}
              </FieldRow>
            </ListGroup>
          </motion.div>
        )}
      </AnimatePresence>

      {shown ? (
        <TargetsCard t={shown} title={dirty ? 'Your targets after saving' : 'Your daily targets'} was={dirty ? (t?.kcal ?? null) : null} loading={dirty && preview.isFetching} />
      ) : (
        <p className="m-0 rounded-[24px] bg-surface p-4 text-[13px] text-neutral-700">Finish your profile (height, weight, date of birth) and we’ll work out your targets.</p>
      )}

      {t && t.overridden.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-[24px] bg-surface p-4 text-[13px]">
          <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700" strokeWidth={2.75} />
          <span>
            <b>{t.overridden.map((k) => k.charAt(0).toUpperCase() + k.slice(1)).join(', ')}</b> set by {t.overriddenBy?.name ?? 'your admin'}
            {t.overrideReason ? ` — “${t.overrideReason}”` : ''}. These stay as they are when you change your goal.
          </span>
        </div>
      )}
      {t?.inputs && (
        <p className="m-0 px-1 text-[12px] text-neutral-700">
          Mifflin-St Jeor · {t.computedFromWeightKg ? `${showW(t.computedFromWeightKg)} ${imperial ? 'lb' : 'kg'}` : ''}
          {t.inputs.heightCm ? ` · ${Math.round(t.inputs.heightCm)} cm` : ''}
          {t.inputs.activityLevel ? ` · ${t.inputs.activityLevel.replace('_', ' ')}` : ''}. Never below the safe floor.
          {p.targetDate && !dirty ? ` Goal date ${dateLabel(p.targetDate, { day: 'numeric', month: 'short', year: 'numeric' })}.` : ''}
        </p>
      )}

      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="sticky bottom-3 z-10 flex gap-2">
            <Button variant="secondary" className="flex-1 bg-bg" onClick={() => setF(initial)}>
              Undo changes
            </Button>
            <Button className="flex-1" loading={save.isPending} disabled={wrongWay || (f.goalType !== 'maintain' && f.mode === 'date' && !f.targetDate)} onClick={() => save.mutate(body)}>
              Save goal
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
