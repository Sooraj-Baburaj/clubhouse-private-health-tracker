import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Info } from 'lucide-react';
import type { AdminMemberDetail, Nutrient, TargetsDto } from '@clubhouse/contracts';
import { useRole } from '@/features/me';
import { useDeleteMemberData, useResetTotp } from '@/features/members';
import { cn } from '@/lib/cn';
import { fmtDate, fmtInt, fmtKg, fmtNum, humanize } from '@/lib/format';
import { Button, Card, CardHeader, confirmAction, EmptyState, Grid, KeyValues, Pill, SectionTag } from '@/ui';
import { GoalForm } from '../goals/GoalForm';
import { activityLabel, goalText, NUTRIENT_LABEL } from '../goals/parts';
import { LINK_TEXT } from './shared';

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

function list(v: string[]): string {
  return v.length ? v.join(', ') : '—';
}

export function ProfileTab({ data }: { data: AdminMemberDetail }) {
  const { isSuper } = useRole();
  const p = data.profile;
  const m = data.member;
  const age = ageFrom(p?.dob ?? null);
  const customBands = data.thresholdsOverride ? (Object.keys(data.thresholdsOverride) as Nutrient[]) : [];

  return (
    <>
      <Grid min={340}>
        <Card>
          <CardHeader title="Profile" />
          {p ? (
            <KeyValues
              items={[
                ['Sex', p.sex ? humanize(p.sex) : '—'],
                ['Age', age != null ? `${age} (born ${fmtDate(p.dob, { year: true })})` : '—'],
                ['Height', p.heightCm != null ? `${fmtNum(p.heightCm, 0)} cm` : '—'],
                ['Weight', fmtKg(p.weightKg)],
                ['Activity', activityLabel(p.activityLevel)],
                ['Goal', goalText(p.goalType, p.paceKgWeek)],
                ['Target', p.targetWeightKg != null ? `${fmtKg(p.targetWeightKg)}${p.targetDate ? ` by ${fmtDate(p.targetDate, { year: true })}` : ''}` : '—'],
                ['Eat back exercise', p.eatBackExercise ? 'Yes' : 'No'],
                ['Diet', p.dietPrefs.diet ? humanize(p.dietPrefs.diet) : '—'],
                ['Allergies', list(p.dietPrefs.allergies)],
                ['Dislikes', list(p.dietPrefs.dislikes)],
                ['Cuisines', list(p.dietPrefs.cuisines)],
                ['Units', humanize(p.units)],
                ['Timezone', data.timezone],
                ['Email', m.email ?? '—'],
                ['Joined', fmtDate(m.createdAt, { year: true })],
              ]}
            />
          ) : (
            <EmptyState compact title="Profile not set up yet" body="They’ll fill this in during onboarding after their first sign-in." />
          )}
        </Card>

        <TargetsCard targets={data.targets} memberId={m.id} customBands={customBands} />
      </Grid>

      <Card>
        <CardHeader
          title="Goal"
          aside="Saving recalculates targets. Safety limits still apply."
          actions={
            <Link to="/goals" search={{ member: m.id }} className={LINK_TEXT}>
              Overrides & band thresholds <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          }
        />
        <GoalForm
          key={m.id}
          userId={m.id}
          initial={{ goalType: p?.goalType ?? null, paceKgWeek: p?.paceKgWeek ?? null, targetWeightKg: p?.targetWeightKg ?? null, targetDate: p?.targetDate ?? null, activityLevel: p?.activityLevel ?? null }}
        />
      </Card>

      {isSuper && <DangerZone data={data} />}
    </>
  );
}

function TargetsCard({ targets: t, memberId, customBands }: { targets: TargetsDto | null; memberId: string; customBands: Nutrient[] }) {
  const over = new Set(t?.overridden ?? []);
  return (
    <Card>
      <CardHeader
        title="Daily targets"
        actions={
          t && t.overridden.length > 0 ? (
            <Pill tone="accent" title={t.overrideReason ?? undefined}>
              Override
            </Pill>
          ) : t ? (
            <Pill tone="muted">Calculated</Pill>
          ) : undefined
        }
      />
      {!t ? (
        <EmptyState compact title="No targets yet" body="Targets appear once their profile has height, weight, age and sex." />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={cn('font-display text-[34px] font-extrabold leading-none tracking-[-0.04em]', over.has('kcal') && 'text-accent-dark')}>{fmtInt(t.kcal)}</span>
            <span className="text-[14px] text-muted">kcal a day</span>
          </div>
          <div className="grid grid-cols-4 gap-2 max-[420px]:grid-cols-2">
            {(['protein', 'carbs', 'fat', 'fibre'] as const).map((n) => (
              <div key={n} className={cn('flex flex-col gap-0.5 rounded-[12px] bg-bg px-3 py-2', over.has(n) && 'ring-1 ring-accent-border')}>
                <span className="text-[12px] text-muted">{NUTRIENT_LABEL[n]}</span>
                <span className="font-mono text-[14px] font-semibold">{fmtInt(t[n])} g</span>
                {over.has(n) && <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent">override</span>}
              </div>
            ))}
          </div>
          <KeyValues
            items={[
              ['BMR', t.bmr != null ? <span className="font-mono text-[12px]">{fmtInt(t.bmr)} kcal</span> : '—'],
              ['TDEE', t.tdee != null ? <span className="font-mono text-[12px]">{fmtInt(t.tdee)} kcal</span> : '—'],
              ['Calculated from', t.computedFromWeightKg != null ? fmtKg(t.computedFromWeightKg) : '—'],
              ['Band thresholds', customBands.length ? `Custom for ${customBands.map((n) => NUTRIENT_LABEL[n].toLowerCase()).join(', ')}` : 'Team default'],
            ]}
          />
          {(t.floorHit || t.paceCapped) && (
            <div className="flex flex-col gap-1 rounded-[12px] bg-under-bg px-3 py-2 text-[12px] font-semibold text-under-fg">
              {t.floorHit && <span>Held at the safe floor{t.floor ? ` of ${fmtInt(t.floor)} kcal` : ''}.</span>}
              {t.paceCapped && <span>Pace capped{t.effectivePaceKgPerWeek != null ? ` at ${fmtNum(t.effectivePaceKgPerWeek, 2)} kg a week` : ''} to stay safe.</span>}
            </div>
          )}
          {t.explanation && (
            <p className="m-0 flex gap-2 text-[13px] leading-relaxed text-muted">
              <Info aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0" />
              {t.explanation}
            </p>
          )}
          {t.overridden.length > 0 && (
            <div className="flex flex-col gap-1 rounded-[12px] border border-accent-border bg-accent-tint/40 px-3 py-2 text-[13px]">
              <span className="font-semibold text-accent-dark">
                {t.overridden.map((n) => NUTRIENT_LABEL[n as Nutrient] ?? n).join(', ')} overridden{t.overriddenBy ? ` by ${t.overriddenBy.name}` : ''}
              </span>
              {t.overrideReason && <span className="text-ink/80">“{t.overrideReason}”</span>}
            </div>
          )}
          <Link to="/goals" search={{ member: memberId }} className={cn(LINK_TEXT, 'self-start')}>
            {t.overridden.length ? 'Edit or clear the override' : 'Override targets'} <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </>
      )}
    </Card>
  );
}

function DangerZone({ data }: { data: AdminMemberDetail }) {
  const m = data.member;
  const del = useDeleteMemberData();
  const totp = useResetTotp();

  const onDelete = () =>
    confirmAction({
      eyebrow: 'Super Admin · cannot be undone',
      title: `Delete ${m.person.name}’s data?`,
      body: 'Everything they’ve logged is permanently deleted. This can’t be undone.',
      impact: ['All food, activity and weight logs', 'Their photos and chat messages', 'Goals, plans, streaks and badges', 'Recorded in the audit log with your reason'],
      confirmLabel: 'Delete data',
      typedConfirm: m.username,
      requireReason: true,
      reasonPlaceholder: 'e.g. Member asked for their data to be deleted',
      onConfirm: (reason) => del.mutateAsync({ id: m.id, confirm: m.username, reason }),
    });

  const onTotp = () =>
    confirmAction({
      eyebrow: 'Super Admin',
      title: `Reset ${m.person.name}’s two-step sign-in?`,
      body: 'Their authenticator app stops working for Clubhouse. They’ll sign in with just their password and can set up two-step again.',
      impact: ['Authenticator app (TOTP) removed from their account'],
      confirmLabel: 'Reset two-step',
      requireReason: true,
      onConfirm: (reason) => totp.mutateAsync({ id: m.id, reason }),
    });

  return (
    <Card className="border-accent-border">
      <CardHeader title="Danger zone" actions={<SectionTag>Super Admin</SectionTag>} />
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-semibold">Delete member data</span>
            <span className="text-[12px] text-muted">Permanently removes their logs, photos, messages and plans. You’ll type their username to confirm.</span>
          </div>
          <Button variant="danger" onClick={() => void onDelete()} loading={del.isPending}>
            Delete data
          </Button>
        </div>
        {m.totpEnabled && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline py-2 pt-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] font-semibold">Reset two-step (TOTP)</span>
              <span className="text-[12px] text-muted">For a lost phone. They can enrol again after signing in.</span>
            </div>
            <Button variant="danger" onClick={() => void onTotp()} loading={totp.isPending}>
              Reset two-step
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
