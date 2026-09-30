import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CalendarRange, Lock, Salad } from 'lucide-react';
import { useState } from 'react';
import type { AdminMemberDetail, AuditRow, NotificationPrefDto, StreakDto } from '@clubhouse/contracts';
import { useSetVacation } from '@/features/members';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, fmtInt, fmtRelative, fmtUsd, humanize, plural, todayLocal, WEEKDAY_SHORT } from '@/lib/format';
import {
  AiChip,
  BandPill,
  Button,
  Card,
  CardHeader,
  DataTable,
  DayChips,
  EmptyState,
  Field,
  FormGrid,
  Grid,
  Input,
  KpiCard,
  KpiGrid,
  Mono,
  PersonCell,
  Pill,
  ProgressBar,
  StatusPill,
  type Column,
  type PillTone,
} from '@/ui';
import { LINK_BTN, LINK_TEXT } from './shared';
import { WeeksChart } from './WeeksChart';

type Detail = AdminMemberDetail;

/* ───────── Diet ───────── */

export function DietTab({ data }: { data: Detail }) {
  const d = data.diet;
  const id = data.member.id;
  return (
    <Card>
      <CardHeader
        title="Diet plan"
        actions={
          <Link to="/diets" search={{ member: id }} className={LINK_TEXT}>
            All diet plans <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        }
      />
      {d ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[18px] font-bold tracking-[-0.02em]">{d.name}</span>
            {d.aiGenerated && <AiChip feature="diet.draft" />}
            <StatusPill status={d.status} />
            <Pill tone="muted">v{d.version}</Pill>
          </div>
          <span className="text-[13px] text-muted">
            {d.publishedAt ? `Published ${fmtDate(d.publishedAt, { year: true })} (${fmtRelative(d.publishedAt)})` : 'Not published yet'}
            {d.aiGenerated && ' · First drafted with AI, reviewed by an admin'}
          </span>
          <Link to="/diets/$planId" params={{ planId: d.id }} className={cn(LINK_BTN, 'self-start')}>
            Open in the builder <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <EmptyState
          compact
          icon={<Salad className="h-5 w-5" />}
          title="No diet plan yet"
          body="Start one from scratch, a template, or with an AI draft you review."
          action={
            <Link to="/diets" search={{ member: id }} className={LINK_BTN}>
              Start a plan
            </Link>
          }
        />
      )}
    </Card>
  );
}

/* ───────── Activity plan & adherence ───────── */

function freqText(i: { perWeek: number | null; perMonth: number | null; targetMin: number | null }): string {
  const f = i.perWeek != null ? `${i.perWeek}× a week` : i.perMonth != null ? `${i.perMonth}× a month` : '';
  return [f, i.targetMin ? `${i.targetMin} min` : null].filter(Boolean).join(' · ');
}

export function ActivityTab({ data }: { data: Detail }) {
  const plan = data.plan;
  const id = data.member.id;
  const weeks = plan.weeks.slice(-12);
  const done = weeks.reduce((a, w) => a + w.done, 0);
  const planned = weeks.reduce((a, w) => a + w.planned, 0);
  return (
    <Grid min={360}>
      <Card>
        <CardHeader
          title="Activity plan"
          actions={
            <Link to="/plans" search={{ member: id }} className={LINK_TEXT}>
              Edit plan <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          }
        />
        {plan.items.length === 0 ? (
          <EmptyState compact title="No activity plan" body="Assign one from Activity plans." />
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {plan.items.map((it) => (
              <li key={it.itemId} className="flex flex-col gap-1.5 border-t border-hairline py-3 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    {it.icon && (
                      <span aria-hidden className="text-[16px]">
                        {it.icon}
                      </span>
                    )}
                    <span className="truncate">{it.typeName}</span>
                  </span>
                  <Mono muted>{freqText(it)}</Mono>
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar className="flex-1" value={it.target ? it.done / it.target : 0} label={`${it.typeName}: ${it.done} of ${it.target} done`} />
                  <Mono>
                    {it.done}/{it.target}
                  </Mono>
                </div>
                {it.days.length > 0 && <span className="text-[12px] text-muted">Picked: {it.days.map((d) => `${WEEKDAY_SHORT[d.weekday] ?? ''} ${d.time}`).join(', ')}</span>}
                {it.note && <span className="text-[12px] text-muted">“{it.note}”</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="flex min-w-0 flex-col gap-3">
        <Card>
          <CardHeader title="Last 12 weeks" aside={planned ? `${fmtInt((done / planned) * 100)}% of planned sessions done` : undefined} />
          {weeks.length === 0 ? <EmptyState compact title="No weeks to show yet" /> : <WeeksChart weeks={weeks} />}
        </Card>
        <Card>
          <CardHeader title="Usual days" aside="Days they usually work out" />
          <DayChips days={[0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, state: plan.usualDays.includes(w) ? 'done' : 'none' }))} />
        </Card>
      </div>
    </Grid>
  );
}

/* ───────── Momentum ───────── */

const STREAK_KIND: Record<string, string> = { logging: 'Logging', activity: 'Activity plan', in_range: 'In range' };
const STREAK_TONE: Record<StreakDto['status'], PillTone> = { active: 'in', paused: 'under', reset: 'none', vacation: 'accent' };

export function MomentumTab({ data }: { data: Detail }) {
  const today = todayLocal();
  const setVacation = useSetVacation();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(todayLocal(7));
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return setErr('Pick both dates.');
    if (to < from) return setErr('The end date must be on or after the start date.');
    setErr(null);
    try {
      await setVacation.mutateAsync({ id: data.member.id, from, to });
    } catch {
      /* toast shows the API message */
    }
  };

  const ranges = [...data.vacation].sort((a, b) => b.from.localeCompare(a.from));
  return (
    <>
      {data.streaks.length === 0 ? (
        <Card>
          <EmptyState compact title="No streaks yet" body="Streaks start once they log their first day." />
        </Card>
      ) : (
        <Grid min={220}>
          {data.streaks.map((s) => (
            <Card key={s.kind} className={cn(s.atRisk && 'border-under-fg/40')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{STREAK_KIND[s.kind] ?? humanize(s.kind)}</span>
                <Pill tone={STREAK_TONE[s.status]}>{humanize(s.status)}</Pill>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[32px] font-extrabold leading-none tracking-[-0.04em]">{fmtInt(s.current)}</span>
                <span className="text-[13px] text-muted">day{s.current === 1 ? '' : 's'}</span>
              </div>
              <span className="text-[12px] text-muted">
                Best {plural(s.best, 'day')} · {plural(s.graceLeft, 'grace day')} left
                {s.pausedSince && ` · paused since ${fmtDate(s.pausedSince)}`}
              </span>
              {s.atRisk && <Pill tone="under">At risk tonight</Pill>}
            </Card>
          ))}
        </Grid>
      )}
      <Card>
        <CardHeader title="Vacation" aside="Streaks pause during vacation instead of resetting." />
        {ranges.length === 0 ? (
          <span className="text-[13px] text-muted">No vacation set.</span>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {ranges.map((r) => {
              const state = r.to < today ? 'Past' : r.from > today ? 'Upcoming' : 'Now';
              return (
                <li key={`${r.from}-${r.to}`} className="flex items-center justify-between gap-3 border-t border-hairline py-2 text-[13px] first:border-t-0">
                  <span className="flex items-center gap-2">
                    <CalendarRange aria-hidden className="h-4 w-4 text-muted" />
                    {fmtDate(r.from)} – {fmtDate(r.to)}
                  </span>
                  <Pill tone={state === 'Now' ? 'accent' : state === 'Upcoming' ? 'outline' : 'muted'}>{state}</Pill>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={submit} className="flex flex-col gap-3 border-t border-hairline pt-3" noValidate>
          <FormGrid min={160}>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To" error={err}>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} invalid={!!err} />
            </Field>
          </FormGrid>
          <Button type="submit" variant="outline" className="self-start" loading={setVacation.isPending}>
            Set vacation
          </Button>
        </form>
      </Card>
    </>
  );
}

/* ───────── Notifications (read-only) ───────── */

export function NotificationsTab({ data }: { data: Detail }) {
  const cols: Column<NotificationPrefDto>[] = [
    {
      id: 'type',
      header: 'Notification',
      width: 'minmax(200px,1.6fr)',
      sortValue: (r) => r.label,
      cell: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{r.label}</span>
          <span className="truncate text-[12px] text-muted">{r.hint}</span>
        </span>
      ),
    },
    { id: 'group', header: 'Group', width: '110px', sortValue: (r) => r.group, cell: (r) => <Pill tone="muted">{humanize(r.group)}</Pill> },
    {
      id: 'on',
      header: 'State',
      width: '110px',
      sortValue: (r) => r.enabled,
      cell: (r) =>
        r.locked ? (
          <Pill tone="neutral" icon={<Lock aria-hidden className="h-3 w-3" />}>
            Always on
          </Pill>
        ) : r.enabled ? (
          <Pill tone="in">On</Pill>
        ) : (
          <Pill tone="none">Off</Pill>
        ),
    },
    { id: 'time', header: 'Time', width: '120px', sortValue: (r) => r.time ?? '', cell: (r) => <Mono muted={!r.supportsTime}>{!r.supportsTime ? '—' : r.smartTime ? `Smart${r.smartTimeValue ? ` · ${r.smartTimeValue}` : ''}` : (r.time ?? '—')}</Mono> },
    {
      id: 'days',
      header: 'Days',
      width: '230px',
      cell: (r) => (r.supportsDays ? <DayChips days={[0, 1, 2, 3, 4, 5, 6].map((w) => ({ weekday: w, state: r.days.includes(w) ? 'planned' : 'none' }))} /> : <span className="text-muted">—</span>),
    },
  ];
  return (
    <>
      <p className="m-0 text-[13px] text-muted">Read-only. Members change these in their app settings; team defaults live under Notifications.</p>
      <DataTable
        label="Notification settings"
        columns={cols}
        rows={data.notificationPrefs}
        rowKey={(r) => r.type}
        minWidth={820}
        search={{ placeholder: 'Search notifications', text: (r) => `${r.label} ${r.hint} ${r.type}` }}
        filters={[
          { id: 'group', label: 'Group', options: [{ value: '', label: 'All groups' }, ...Array.from(new Set(data.notificationPrefs.map((p) => p.group))).map((g) => ({ value: g, label: humanize(g) }))], predicate: (r, v) => r.group === v },
          { id: 'on', label: 'State', options: [{ value: '', label: 'On and off' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }], predicate: (r, v) => (v === 'on' ? r.enabled || r.locked : !r.enabled && !r.locked) },
        ]}
        empty={<EmptyState compact title="No notification settings yet" />}
      />
    </>
  );
}

/* ───────── AI usage ───────── */

export function AiTab({ data }: { data: Detail }) {
  const a = data.ai;
  const cols: Column<Detail['ai']['byFeature'][number]>[] = [
    {
      id: 'feature',
      header: 'Feature',
      width: 'minmax(180px,1.4fr)',
      sortValue: (r) => r.feature,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <AiChip feature={r.feature} />
          <span className="font-semibold">{humanize(r.feature)}</span>
          <Mono muted>{r.feature}</Mono>
        </span>
      ),
    },
    { id: 'calls', header: 'Calls', width: '100px', align: 'end', sortValue: (r) => r.calls, cell: (r) => <Mono>{fmtInt(r.calls)}</Mono> },
    { id: 'cost', header: 'Cost', width: '100px', align: 'end', sortValue: (r) => r.cost, cell: (r) => <Mono>{fmtUsd(r.cost, 3)}</Mono> },
    { id: 'share', header: 'Share', width: '100px', align: 'end', sortValue: (r) => r.cost, cell: (r) => <Mono muted>{a.costMonth > 0 ? `${fmtInt((r.cost / a.costMonth) * 100)}%` : '—'}</Mono> },
  ];
  return (
    <>
      <KpiGrid>
        <KpiCard index={0} label={<span className="inline-flex items-center gap-1.5">AI calls this month <AiChip /></span>} value={a.callsMonth} />
        <KpiCard index={1} label="AI cost this month" value={a.costMonth} format={(n) => fmtUsd(n, 3)} />
      </KpiGrid>
      <DataTable
        label="AI usage by feature"
        columns={cols}
        rows={a.byFeature}
        rowKey={(r) => r.feature}
        minWidth={520}
        initialSort={{ id: 'cost', dir: 'desc' }}
        search={{ placeholder: 'Search features', text: (r) => r.feature }}
        toolbar={
          <Link to="/ai/calls" search={{ userId: data.member.id }} className={LINK_BTN}>
            Open call log <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        }
        empty={<EmptyState compact title="No AI calls this month" />}
      />
    </>
  );
}

/* ───────── Recent days ───────── */

export function DaysTab({ data }: { data: Detail }) {
  type Day = Detail['recentDays'][number];
  const cols: Column<Day>[] = [
    { id: 'date', header: 'Date', width: 'minmax(120px,1fr)', sortValue: (r) => r.date, cell: (r) => <span className="font-semibold">{fmtDate(r.date, { weekday: true })}</span> },
    { id: 'eaten', header: 'Eaten', width: '90px', align: 'end', sortValue: (r) => r.eaten, cell: (r) => <Mono>{r.logs ? fmtInt(r.eaten) : '—'}</Mono> },
    { id: 'target', header: 'Target', width: '90px', align: 'end', sortValue: (r) => r.target, cell: (r) => <Mono muted>{fmtInt(r.target)}</Mono> },
    { id: 'burned', header: 'Burned', width: '90px', align: 'end', sortValue: (r) => r.burned, cell: (r) => <Mono muted={!r.burned}>{r.burned ? fmtInt(r.burned) : '—'}</Mono> },
    { id: 'logs', header: 'Logs', width: '70px', align: 'end', sortValue: (r) => r.logs, cell: (r) => <Mono muted={!r.logs}>{r.logs}</Mono> },
    { id: 'band', header: 'Band', width: '130px', sortValue: (r) => r.band, cell: (r) => <BandPill band={r.band} /> },
  ];
  return (
    <DataTable
      label="Recent days"
      columns={cols}
      rows={data.recentDays}
      rowKey={(r) => r.date}
      minWidth={640}
      initialSort={{ id: 'date', dir: 'desc' }}
      search={{ placeholder: 'Search dates', text: (r) => `${r.date} ${fmtDate(r.date, { weekday: true })}` }}
      filters={[
        {
          id: 'band',
          label: 'Band',
          options: [
            { value: '', label: 'All bands' },
            { value: 'in', label: 'In range' },
            { value: 'under', label: 'Under' },
            { value: 'over', label: 'Over' },
            { value: 'none', label: 'Not logged' },
          ],
          predicate: (r, v) => r.band === v,
        },
      ]}
      empty={<EmptyState compact title="No days logged yet" />}
    />
  );
}

/* ───────── Audit trail ───────── */

function short(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

/** Compact "field: a → b" lines for object diffs, else "a → b". */
export function changeLines(before: unknown, after: unknown, max = 3): string[] {
  const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    const lines = keys.slice(0, max).map((k) => `${k}: ${short(b[k])} → ${short(a[k])}`);
    if (keys.length > max) lines.push(`+${keys.length - max} more`);
    return lines;
  }
  if (before == null && after == null) return [];
  return [`${short(before)} → ${short(after)}`];
}

export function AuditTab({ data }: { data: Detail }) {
  const cols: Column<AuditRow>[] = [
    { id: 'when', header: 'When', width: '120px', sortValue: (r) => r.createdAt, cell: (r) => <span className="text-[13px] text-muted" title={fmtDateTime(r.createdAt)}>{fmtRelative(r.createdAt)}</span> },
    { id: 'actor', header: 'By', width: 'minmax(140px,1fr)', sortValue: (r) => r.actor?.name ?? '', cell: (r) => (r.actor ? <PersonCell person={r.actor} size={24} /> : <span className="text-muted">System</span>) },
    {
      id: 'action',
      header: 'Action',
      width: 'minmax(150px,1fr)',
      sortValue: (r) => r.action,
      cell: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <span className="font-semibold">{humanize(r.action)}</span>
          {r.highImpact && <Pill tone="over">High impact</Pill>}
        </span>
      ),
    },
    {
      id: 'change',
      header: 'Before → after',
      width: 'minmax(220px,2fr)',
      cell: (r) => {
        const lines = changeLines(r.before, r.after);
        return lines.length ? (
          <span className="flex flex-col gap-0.5">
            {lines.map((l, i) => (
              <Mono key={i} muted className="break-words">
                {l}
              </Mono>
            ))}
          </span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    { id: 'reason', header: 'Reason', width: 'minmax(140px,1.2fr)', cell: (r) => <span className="text-[13px] text-muted">{r.reason ? `“${r.reason}”` : '—'}</span> },
  ];
  return (
    <DataTable
      label="Audit trail"
      columns={cols}
      rows={data.audit}
      rowKey={(r) => String(r.id)}
      minWidth={860}
      initialSort={{ id: 'when', dir: 'desc' }}
      rowClassName={(r) => r.highImpact && 'bg-over-bg/30'}
      search={{ placeholder: 'Search actions, reasons', text: (r) => `${r.action} ${r.reason ?? ''} ${r.actor?.name ?? ''}` }}
      filters={[{ id: 'hi', label: 'Impact', options: [{ value: '', label: 'All entries' }, { value: '1', label: 'High impact only' }], predicate: (r) => r.highImpact }]}
      toolbar={
        <Link to="/audit" search={{ memberId: data.member.id }} className={LINK_BTN}>
          Full audit log <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      }
      empty={<EmptyState compact title="Nothing recorded yet" />}
    />
  );
}

/* ───────── Sessions ───────── */

export function SessionsTab({ data, onRevokeAll }: { data: Detail; onRevokeAll: () => void }) {
  type S = Detail['sessions'][number];
  const cols: Column<S>[] = [
    { id: 'device', header: 'Device', width: 'minmax(180px,1.4fr)', sortValue: (r) => r.deviceLabel ?? '', cell: (r) => <span className="font-semibold">{r.deviceLabel ?? 'Unknown device'}</span> },
    { id: 'ip', header: 'IP', width: '150px', sortValue: (r) => r.ip ?? '', cell: (r) => <Mono muted>{r.ip ?? '—'}</Mono> },
    { id: 'seen', header: 'Last seen', width: '140px', sortValue: (r) => r.lastSeenAt, cell: (r) => <span className="text-[13px] text-muted" title={fmtDateTime(r.lastSeenAt)}>{fmtRelative(r.lastSeenAt)}</span> },
  ];
  return (
    <DataTable
      label="Sessions"
      columns={cols}
      rows={data.sessions}
      rowKey={(r) => r.id}
      minWidth={520}
      initialSort={{ id: 'seen', dir: 'desc' }}
      search={{ placeholder: 'Search device or IP', text: (r) => `${r.deviceLabel ?? ''} ${r.ip ?? ''}` }}
      toolbar={
        <Button variant="danger" size="sm" onClick={onRevokeAll} disabled={data.sessions.length === 0}>
          Revoke all
        </Button>
      }
      empty={<EmptyState compact title="Not signed in anywhere" body="They have no active sessions right now." />}
    />
  );
}
