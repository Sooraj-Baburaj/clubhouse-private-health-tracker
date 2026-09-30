import { useState } from 'react';
import { ACTIVITY_LEVELS, AdminGoalUpdate, type ActivityLevel, type AdminGoalRow, type GoalType } from '@clubhouse/contracts';
import { ACTIVITY_LEVEL_LABELS, GAIN_KCAL_PER_KG_WEEK, LOSE_KCAL_PER_KG_WEEK, MAX_PACE_KG_PER_WEEK } from '@clubhouse/domain';
import { useUpdateGoal } from '@/features/goals';
import { useRole } from '@/features/me';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { fmtInt, todayLocal } from '@/lib/format';
import { Button, Checkbox, Field, FormGrid, Input, NumberInput, SectionTag, Segmented, Select, Textarea } from '@/ui';
import { zodErrors } from '../members/shared';
import { asActivityLevel, asGoalType, GOAL_LABEL, Refusal } from './parts';

export interface GoalInitial {
  goalType: string | null;
  paceKgWeek: number | null;
  targetWeightKg: number | null;
  targetDate: string | null;
  activityLevel: string | null;
}

const DEFAULT_PACE: Record<GoalType, number | null> = { lose: 0.5, maintain: null, gain: 0.25 };

/**
 * Goal editor shared by the Goals drawer and the member detail page. Saving recalculates targets on the server.
 * Safety refusals (pace over 1 kg/week, below the calorie floor) come back as 4xx and are shown inline.
 * Super Admins can attach a safety override reason. Render with `key={userId}` so it resets per member.
 */
export function GoalForm({ userId, initial, onSaved, submitLabel = 'Save goal' }: { userId: string; initial: GoalInitial; onSaved?: (row: AdminGoalRow) => void; submitLabel?: string }) {
  const { isSuper } = useRole();
  const save = useUpdateGoal();
  const [goalType, setGoalType] = useState<GoalType>(asGoalType(initial.goalType) ?? 'maintain');
  const [pace, setPace] = useState<number | null>(initial.paceKgWeek);
  const [targetWeight, setTargetWeight] = useState<number | null>(initial.targetWeightKg);
  const [targetDate, setTargetDate] = useState(initial.targetDate ?? '');
  const [activity, setActivity] = useState<ActivityLevel | ''>(asActivityLevel(initial.activityLevel) ?? '');
  const [overrideOn, setOverrideOn] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  const dirty =
    goalType !== (asGoalType(initial.goalType) ?? 'maintain') ||
    pace !== initial.paceKgWeek ||
    targetWeight !== initial.targetWeightKg ||
    targetDate !== (initial.targetDate ?? '') ||
    activity !== (asActivityLevel(initial.activityLevel) ?? '');

  const paceKcal = pace && goalType !== 'maintain' ? Math.round(pace * (goalType === 'lose' ? LOSE_KCAL_PER_KG_WEEK : GAIN_KCAL_PER_KG_WEEK)) : null;
  const paceTooFast = goalType !== 'maintain' && pace != null && pace > MAX_PACE_KG_PER_WEEK;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefusal(null);
    const body = {
      goalType,
      paceKgWeek: goalType === 'maintain' ? null : pace,
      targetWeightKg: targetWeight,
      targetDate: targetDate || null,
      ...(activity ? { activityLevel: activity } : {}),
      ...(isSuper && overrideOn && overrideReason.trim() ? { safetyOverrideReason: overrideReason.trim() } : {}),
    };
    const parsed = AdminGoalUpdate.safeParse(body);
    if (!parsed.success) {
      setErrors(
        zodErrors(parsed.error.issues, {
          paceKgWeek: 'Pace must be between 0 and 2 kg a week.',
          targetWeightKg: 'Target weight must be between 25 and 350 kg.',
          targetDate: 'Pick a valid date.',
          safetyOverrideReason: 'Give a reason of at least 3 characters.',
        }),
      );
      return;
    }
    setErrors({});
    try {
      const row = await save.mutateAsync({ userId, body: parsed.data });
      setOverrideOn(false);
      setOverrideReason('');
      onSaved?.(row);
    } catch (err) {
      setErrors(fieldErrors(err));
      setRefusal(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field as="div" label="Goal">
        <Segmented
          label="Goal type"
          value={goalType}
          onChange={(g) => {
            setGoalType(g);
            if (g === 'maintain') setPace(null);
            else if (pace == null) setPace(DEFAULT_PACE[g]);
          }}
          options={(['lose', 'maintain', 'gain'] as const).map((g) => ({ value: g, label: GOAL_LABEL[g] }))}
        />
      </Field>
      <FormGrid min={180}>
        <Field
          label="Pace (kg / week)"
          error={errors.paceKgWeek}
          hint={goalType === 'maintain' ? 'No pace when maintaining.' : paceKcal ? `About ${fmtInt(paceKcal)} kcal a day ${goalType === 'lose' ? 'below' : 'above'} maintenance.` : 'Up to 1 kg a week.'}
        >
          <NumberInput value={goalType === 'maintain' ? null : pace} onValue={setPace} step={0.05} min={0} max={2} disabled={goalType === 'maintain'} invalid={!!errors.paceKgWeek || paceTooFast} placeholder={goalType === 'maintain' ? '—' : '0.5'} />
        </Field>
        <Field label="Target weight (kg)" error={errors.targetWeightKg} hint="Optional">
          <NumberInput value={targetWeight} onValue={setTargetWeight} step={0.1} min={25} max={350} invalid={!!errors.targetWeightKg} />
        </Field>
        <Field label="Target date" error={errors.targetDate} hint="Optional">
          <Input type="date" value={targetDate} min={todayLocal()} onChange={(e) => setTargetDate(e.target.value)} invalid={!!errors.targetDate} />
        </Field>
        <Field label="Activity level" error={errors.activityLevel} hint={activity ? ACTIVITY_LEVEL_LABELS[activity].hint : 'Keeps the current level when blank.'}>
          <Select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel | '')}>
            <option value="">Not set</option>
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LEVEL_LABELS[a].label}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>
      {paceTooFast && !overrideOn && (
        <p className="m-0 text-[12px] font-semibold text-accent-dark">
          Faster than {MAX_PACE_KG_PER_WEEK} kg a week is outside the safe range{isSuper ? '. Add a safety override reason below to go ahead.' : ' and will be refused. A Super Admin can override it with a reason.'}
        </p>
      )}
      {isSuper && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-dashed border-accent-border p-3">
          <div className="flex items-center justify-between gap-2">
            <Checkbox checked={overrideOn} onChange={(e) => setOverrideOn(e.target.checked)} label="Super Admin override" hint="Only for changes that go past a safety limit (pace over 1 kg/week or below the calorie floor)." />
            <SectionTag>Super Admin</SectionTag>
          </div>
          {overrideOn && (
            <Field label="Safety override reason" required error={errors.safetyOverrideReason} hint="Recorded in the audit log with your name.">
              <Textarea rows={2} maxLength={300} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Supervised plan agreed with their doctor" />
            </Field>
          )}
        </div>
      )}
      {refusal && <Refusal title="The goal wasn’t changed">{refusal}</Refusal>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!dirty && !overrideOn && <span className="mr-auto text-[12px] text-muted">No changes yet.</span>}
        <Button type="submit" loading={save.isPending} disabled={!dirty && !overrideOn}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
