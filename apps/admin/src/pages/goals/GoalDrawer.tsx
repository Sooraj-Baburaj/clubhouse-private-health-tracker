import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Info } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_THRESHOLDS, NUTRIENTS, OverrideTargetsRequest, Thresholds, type AdminGoalRow, type Nutrient, type NutrientThreshold } from '@clubhouse/contracts';
import { useTeamSettings } from '@/features/directory';
import { useClearOverride, useEatBackToggle, useMemberThresholds, useOverrideTargets } from '@/features/goals';
import { useRole } from '@/features/me';
import { useMember } from '@/features/members';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { fmtInt, fmtKg, fmtNum, humanize } from '@/lib/format';
import { Button, confirmAction, DrawerPanel, EmptyState, Field, FormGrid, Inset, KeyValues, NumberInput, Pill, SectionTag, Skeleton, Textarea, Toggle, ToggleRow } from '@/ui';
import { zodErrors } from '../members/shared';
import { GoalForm } from './GoalForm';
import { activityLabel, goalText, NUTRIENT_LABEL, NUTRIENT_UNIT, Refusal, SectionLabel, weightText } from './parts';
import { BandPreview, thresholdProblems } from './ThresholdsEditor';

/** Goals drawer: formula inputs, goal editor, target override, eat-back and per-member band thresholds. */
export function GoalDrawer({ row, open, onClose, notFound }: { row: AdminGoalRow | null; open: boolean; onClose: () => void; notFound?: boolean }) {
  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Goals & targets"
      title={row?.person.name ?? (notFound ? 'Member not found' : 'Loading…')}
      subtitle={row ? `${goalText(row.goalType, row.paceKgWeek)} · ${weightText(row.weightKg, row.targetWeightKg)}` : undefined}
      label={row ? `Goals and targets for ${row.person.name}` : 'Goals and targets'}
      headerActions={
        row ? (
          <Link to="/members/$id" params={{ id: row.userId }} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-semibold">
            Profile <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        ) : undefined
      }
    >
      {row ? (
        <DrawerBody key={row.userId} row={row} />
      ) : notFound ? (
        <EmptyState compact title="Member not found" body="They may have been deactivated or removed." />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      )}
    </DrawerPanel>
  );
}

function DrawerBody({ row }: { row: AdminGoalRow }) {
  const t = row.targets;
  const inputs = t?.inputs ?? null;
  return (
    <>
      <Inset>
        <span className="flex items-center justify-between gap-2 text-[14px] font-semibold">
          How it’s calculated <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted">Mifflin–St Jeor</span>
        </span>
        {!t ? (
          <span className="text-[13px] text-muted">No targets yet. They appear once the profile has height, weight, age and sex.</span>
        ) : (
          <>
            <KeyValues
              items={[
                ['Sex', inputs?.sex ? humanize(inputs.sex) : '—'],
                ['Age', inputs?.ageYears != null ? `${inputs.ageYears}` : '—'],
                ['Height', inputs?.heightCm != null ? `${fmtNum(inputs.heightCm, 0)} cm` : '—'],
                ['Weight', fmtKg(inputs?.weightKg ?? t.computedFromWeightKg)],
                ['Activity level', activityLabel(inputs?.activityLevel)],
                ['Goal', goalText(inputs?.goalType ?? row.goalType, row.paceKgWeek)],
              ]}
            />
            <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-2">
              {[
                ['BMR', t.bmr],
                ['TDEE', t.tdee],
                ['Target', t.kcal],
              ].map(([k, v]) => (
                <div key={k as string} className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-muted">{k}</span>
                  <span className="font-mono text-[14px] font-semibold">{v != null ? `${fmtInt(v as number)} kcal` : '—'}</span>
                </div>
              ))}
            </div>
            {t.explanation && (
              <p className="m-0 flex gap-2 text-[13px] leading-relaxed text-muted">
                <Info aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0" />
                {t.explanation}
              </p>
            )}
            {(t.floorHit || t.paceCapped) && (
              <div className="flex flex-col gap-1 rounded-[10px] bg-under-bg px-3 py-2 text-[12px] font-semibold text-under-fg">
                {t.floorHit && <span>Held at the safe floor{t.floor ? ` of ${fmtInt(t.floor)} kcal` : ''}. The calculated number was lower.</span>}
                {t.paceCapped && <span>Pace capped{t.effectivePaceKgPerWeek != null ? ` at ${fmtNum(t.effectivePaceKgPerWeek, 2)} kg a week` : ''} to stay within the safe range.</span>}
              </div>
            )}
          </>
        )}
      </Inset>

      <SectionLabel>Goal</SectionLabel>
      <GoalForm userId={row.userId} initial={{ goalType: row.goalType, paceKgWeek: row.paceKgWeek, targetWeightKg: row.targetWeightKg, targetDate: row.targetDate, activityLevel: inputs?.activityLevel ?? null }} />

      <SectionLabel
        aside={
          t && t.overridden.length > 0 ? (
            <Pill tone="accent" title={t.overrideReason ?? undefined}>
              Override active
            </Pill>
          ) : (
            <Pill tone="muted">Calculated</Pill>
          )
        }
      >
        Override targets
      </SectionLabel>
      <OverrideForm row={row} />

      <SectionLabel>Member settings</SectionLabel>
      <EatBackRow row={row} />
      <MemberThresholds userId={row.userId} name={row.person.name} />
    </>
  );
}

/* ───────── Override ───────── */

function OverrideForm({ row }: { row: AdminGoalRow }) {
  const { isSuper } = useRole();
  const t = row.targets;
  const override = useOverrideTargets();
  const clear = useClearOverride();
  const overridden = new Set(t?.overridden ?? []);
  const [values, setValues] = useState<Record<Nutrient, number | null>>(() => Object.fromEntries(NUTRIENTS.map((n) => [n, t && overridden.has(n) ? t[n] : null])) as Record<Nutrient, number | null>);
  const [reason, setReason] = useState('');
  const [safety, setSafety] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  const anySet = NUTRIENTS.some((n) => values[n] != null);
  const belowFloor = values.kcal != null && t?.floor != null && values.kcal < t.floor;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefusal(null);
    const body = { ...values, reason, ...(isSuper && safety.trim() ? { safetyOverrideReason: safety } : {}) };
    const parsed = OverrideTargetsRequest.safeParse(body);
    if (!parsed.success) {
      setErrors(
        zodErrors(parsed.error.issues, {
          kcal: 'Calories must be a whole number from 800 to 6,000.',
          protein: 'Protein must be a whole number up to 500 g.',
          carbs: 'Carbs must be a whole number up to 1,000 g.',
          fat: 'Fat must be a whole number up to 400 g.',
          fibre: 'Fibre must be a whole number up to 150 g.',
          reason: 'Say why you’re overriding (at least 3 characters).',
          safetyOverrideReason: 'Give a reason of at least 3 characters.',
        }),
      );
      return;
    }
    setErrors({});
    try {
      await override.mutateAsync({ userId: row.userId, body: parsed.data });
      setReason('');
      setSafety('');
    } catch (err) {
      setRefusal(errorMessage(err));
    }
  };

  const onClear = () =>
    confirmAction({
      title: `Clear ${row.person.name}’s override?`,
      tone: 'default',
      body: 'Their targets go back to the calculated numbers from their profile and goal.',
      impact: [`${(t?.overridden ?? []).map((n) => NUTRIENT_LABEL[n as Nutrient] ?? n).join(', ')} back to calculated`],
      confirmLabel: 'Clear override',
      requireReason: true,
      onConfirm: (r) => clear.mutateAsync({ userId: row.userId, reason: r }),
    });

  if (!t) return <p className="m-0 text-[13px] text-muted">Targets can be overridden once they’ve been calculated.</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {overridden.size > 0 && (
        <div className="flex flex-col gap-0.5 rounded-[12px] border border-accent-border bg-accent-tint/40 px-3 py-2 text-[13px]">
          <span className="font-semibold text-accent-dark">
            {[...overridden].map((n) => NUTRIENT_LABEL[n as Nutrient] ?? n).join(', ')} overridden{t.overriddenBy ? ` by ${t.overriddenBy.name}` : ''}
          </span>
          {t.overrideReason && <span className="text-ink/80">“{t.overrideReason}”</span>}
        </div>
      )}
      <FormGrid min={130}>
        {NUTRIENTS.map((n) => (
          <Field key={n} label={`${NUTRIENT_LABEL[n]} (${NUTRIENT_UNIT[n]})`} error={errors[n]} hint={values[n] == null ? 'Calculated' : overridden.has(n) ? 'Overridden' : 'New override'}>
            <NumberInput value={values[n]} onValue={(v) => setValues((s) => ({ ...s, [n]: v }))} step={1} min={0} placeholder={fmtInt(t[n]).replace(/,/g, '')} invalid={!!errors[n] || (n === 'kcal' && belowFloor)} />
          </Field>
        ))}
      </FormGrid>
      <p className="m-0 text-[12px] text-muted">Leave a box blank to keep the calculated number (shown greyed).</p>
      {belowFloor && (
        <p className="m-0 text-[12px] font-semibold text-accent-dark">
          {fmtInt(values.kcal)} kcal is below the safe floor of {fmtInt(t.floor)} kcal{isSuper ? '. Add a safety override reason to go ahead.' : ' and will be refused.'}
        </p>
      )}
      <Field label="Reason" required error={errors.reason} hint="Recorded in the audit log and shown to other admins.">
        <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Coach asked for higher protein during training block" />
      </Field>
      {isSuper && (
        <Field label={<span className="inline-flex items-center gap-2">Safety override reason <SectionTag>Super Admin</SectionTag></span>} error={errors.safetyOverrideReason} hint="Only needed below the calorie floor. Leave blank otherwise.">
          <Textarea rows={2} maxLength={300} value={safety} onChange={(e) => setSafety(e.target.value)} />
        </Field>
      )}
      {refusal && <Refusal title="Override not saved">{refusal}</Refusal>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {overridden.size > 0 && (
          <Button variant="danger" className="mr-auto" onClick={() => void onClear()}>
            Clear override
          </Button>
        )}
        <Button type="submit" loading={override.isPending} disabled={!anySet}>
          Save override
        </Button>
      </div>
    </form>
  );
}

/* ───────── Eat-back ───────── */

function EatBackRow({ row }: { row: AdminGoalRow }) {
  const toggle = useEatBackToggle();
  return (
    <ToggleRow
      className="border-t-0 py-1"
      label="Eat back exercise calories"
      hint="Adds calories burned from logged activity to today’s target."
      checked={row.eatBackExercise}
      onChange={(on) => toggle.mutate({ userId: row.userId, on })}
    />
  );
}

/* ───────── Per-member thresholds ───────── */

function MemberThresholds({ userId, name }: { userId: string; name: string }) {
  const detail = useMember(userId);
  const team = useTeamSettings();
  if (detail.isPending || team.isPending) return <Skeleton className="h-32" />;
  if (detail.isError) return <p className="m-0 text-[13px] text-muted">Couldn’t load band thresholds: {errorMessage(detail.error)}</p>;
  const teamT = team.data?.settings.thresholds ?? DEFAULT_THRESHOLDS;
  const saved = detail.data.thresholdsOverride ?? {};
  return <ThresholdOverrides key={JSON.stringify(saved)} userId={userId} name={name} saved={saved} teamT={teamT} />;
}

type Partial5 = Partial<Record<Nutrient, NutrientThreshold>>;

function ThresholdOverrides({ userId, name, saved, teamT }: { userId: string; name: string; saved: Partial5; teamT: Thresholds }) {
  const saveM = useMemberThresholds();
  const [draft, setDraft] = useState<Partial5>(saved);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const customCount = Object.keys(draft).length;

  const setCustom = (n: Nutrient, on: boolean) =>
    setDraft((d) => {
      const next = { ...d };
      if (on) next[n] = structuredClone(teamT[n]);
      else delete next[n];
      return next;
    });
  const setNum = (n: Nutrient, k: 'yellowUnderBelow' | 'greenUpTo' | 'yellowOverUpTo', v: number | null) => setDraft((d) => (d[n] ? { ...d, [n]: { ...d[n], [k]: v } } : d));
  const setRed = (n: Nutrient, v: boolean) => setDraft((d) => (d[n] ? { ...d, [n]: { ...d[n], redOver: v } } : d));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    for (const n of NUTRIENTS) {
      const t = draft[n];
      const p = t && thresholdProblems(t);
      if (p) return setError(`${NUTRIENT_LABEL[n]}: ${p}`);
    }
    const parsed = Thresholds.partial().safeParse(draft);
    if (!parsed.success) return setError('Percentages must be between 0 and 1000 (under below up to 300).');
    try {
      await saveM.mutateAsync({ userId, body: { thresholdsOverride: customCount ? parsed.data : null } });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold">Band thresholds</span>
        <span className="text-[12px] text-muted">{customCount ? `Custom for ${customCount} of 5 nutrients. The rest follow the team.` : `${name} follows the team thresholds.`}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {NUTRIENTS.map((n) => {
          const custom = draft[n];
          const t = custom ?? teamT[n];
          return (
            <li key={n} className={cn('flex flex-col gap-2 rounded-[12px] border p-3', custom ? 'border-accent-border bg-white' : 'border-hairline bg-bg/60')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{NUTRIENT_LABEL[n]}</span>
                <span className="flex items-center gap-2 text-[12px] text-muted">
                  {custom ? 'Custom' : 'Team default'}
                  <Toggle checked={!!custom} onChange={(on) => setCustom(n, on)} label={`Custom ${NUTRIENT_LABEL[n]} thresholds`} />
                </span>
              </div>
              {custom ? (
                <div className="flex flex-wrap items-end gap-2">
                  {(
                    [
                      ['yellowUnderBelow', 'Under below %'],
                      ['greenUpTo', 'Green up to %'],
                      ['yellowOverUpTo', 'Soft over up to %'],
                    ] as const
                  ).map(([k, l]) => (
                    <Field key={k} label={l} className="w-[118px] text-[12px]">
                      <NumberInput className="h-9" value={custom[k]} onValue={(v) => setNum(n, k, v)} min={0} max={1000} step={1} placeholder="—" />
                    </Field>
                  ))}
                  <span className="flex h-9 items-center gap-2 text-[12px] font-medium">
                    <Toggle checked={custom.redOver} onChange={(v) => setRed(n, v)} label={`${NUTRIENT_LABEL[n]}: red when over`} /> Red over
                  </span>
                </div>
              ) : (
                <span className="font-mono text-[12px] text-muted">
                  {t.yellowUnderBelow ?? '—'} / {t.greenUpTo ?? '—'} / {t.yellowOverUpTo ?? '—'} %{t.redOver ? ' · red over' : ''}
                </span>
              )}
              <BandPreview nutrient={n} t={t} compact />
            </li>
          );
        })}
      </ul>
      {error && <Refusal title="Thresholds not saved">{error}</Refusal>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {customCount > 0 && (
          <Button variant="ghost" className="mr-auto" onClick={() => setDraft({})}>
            Use team defaults for all
          </Button>
        )}
        <Button type="submit" variant="outline" loading={saveM.isPending} disabled={!dirty}>
          Save thresholds
        </Button>
      </div>
    </form>
  );
}
