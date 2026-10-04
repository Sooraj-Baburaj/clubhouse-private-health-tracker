import { Link } from '@tanstack/react-router';
import { ArrowRight, MessageSquare, HardDrive } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AdminDashboardResponse } from '@clubhouse/contracts';
import { useDashboard } from '@/features/dashboard';
import { useMeAdmin } from '@/features/me';
import { fmtBytes, fmtDate, fmtDateTime, fmtInt, fmtPct, fmtUsd, humanize } from '@/lib/format';
import { AiChip, BandPill, Card, CardHeader, EmptyState, ErrorState, Grid, HrefLink, KpiCard, KpiGrid, MeterList, PageHeader, PersonCell, ProgressBar, Segmented, SkeletonCard } from '@/ui';

type TodayFilter = 'all' | 'none' | 'over' | 'under' | 'in';

/** Overview (ADM-ACC dashboard): KPIs, today's logging, plan, streaks at risk, AI budget, needs attention, chat, storage. */
export function DashboardPage() {
  const q = useDashboard();
  const me = useMeAdmin();
  const d = q.data;

  return (
    <>
      <PageHeader
        eyebrow={d ? fmtDate(d.date, { weekday: true }) : 'Today'}
        title="Overview"
        actions={
          <div className="flex items-center gap-2 text-[13px] text-muted">
            AI mode <b className="text-ink">{d ? (d.ai.on ? 'on' : 'off') : '…'}</b> · Team <b className="text-ink">{me.data?.team.name ?? '…'}</b>
          </div>
        }
      />
      {q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <>
          <KpiGrid>
            <KpiCard index={0} loading={!d} label="Active members" value={d?.kpis.activeMembers} sub={d && `${d.kpis.invited} invited · ${d.kpis.deactivated} deactivated`} />
            <KpiCard index={1} loading={!d} label="Logged today" value={d ? `${fmtInt(d.kpis.loggedToday)} / ${fmtInt(d.kpis.activeMembers)}` : undefined} sub={d && notYet(d)} />
            <KpiCard index={2} loading={!d} label="Team streak" value={d?.kpis.teamStreak} suffix="days" sub="Everyone logged at least once" />
            <KpiCard index={3} loading={!d} label={<span className="inline-flex items-center gap-1.5">AI spend <AiChip /></span>} value={d?.kpis.aiSpendUsd} format={(n) => fmtUsd(n)} sub={d && `${fmtPct(d.kpis.aiPct)} of ${fmtUsd(d.kpis.aiCapUsd, 0)} monthly cap`} tone={d && d.kpis.aiPct >= d.ai.alertAt ? 'warn' : 'default'} />
          </KpiGrid>
          {!d ? (
            <Grid>
              <SkeletonCard lines={6} />
              <SkeletonCard lines={4} />
            </Grid>
          ) : (
            <Grid>
              <TodayCard data={d} />
              <div className="flex min-w-0 flex-col gap-3">
                <AiBudgetCard data={d} />
                <AttentionCard data={d} />
              </div>
              <PlanStreakCard data={d} />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <ChatCard data={d} />
                <StorageCard data={d} />
              </div>
            </Grid>
          )}
          {/* Full width under the grid, like the design: names and solid days need the room. */}
          {d?.board && <BoardCard board={d.board} />}
        </>
      )}
    </>
  );
}

const dayMonth = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** This week's top five on the crew leaderboard (admin design: Overview), when it and its Overview card are on. */
function BoardCard({ board }: { board: NonNullable<AdminDashboardResponse['board']> }) {
  return (
    <Card className="mt-3">
      <CardHeader title="This week’s leaderboard" aside={`Week ${board.weekNumber} · ${dayMonth(board.weekStart)} – ${dayMonth(board.weekEnd)} · closes Mon 3 am`} />
      {board.rows.length === 0 ? (
        <EmptyState compact title="No points yet this week" body="The board fills in as members log." />
      ) : (
        <div role="table" aria-label="Top five this week" className="flex flex-col">
          <div role="row" className="grid grid-cols-[32px_minmax(0,1fr)_96px_130px] gap-3 pb-1">
            <span role="columnheader" className="th">
              #
            </span>
            <span role="columnheader" className="th">
              Member
            </span>
            <span role="columnheader" className="th">
              Points
            </span>
            <span role="columnheader" className="th">
              Solid days 28d
            </span>
          </div>
          {board.rows.map((r) => (
            <div role="row" key={r.person.id} className="grid grid-cols-[32px_minmax(0,1fr)_96px_130px] items-center gap-3 border-t border-hairline py-2 text-[14px]">
              <span role="cell" className="font-display text-[16px] font-extrabold">
                {r.rank}
              </span>
              <span role="cell" className="min-w-0">
                <Link to="/members/$id" params={{ id: r.person.id }} className="min-w-0 text-ink hover:text-accent">
                  <PersonCell person={r.person} size={26} />
                </Link>
              </span>
              <span role="cell" className="font-mono text-[13px]">
                {fmtInt(r.points)} pts
              </span>
              <span role="cell" className="font-mono text-[13px] text-muted">
                {r.solidPct != null ? `${Math.round(r.solidPct)}%` : 'warming up'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function notYet(d: AdminDashboardResponse): string {
  const missing = d.todayRows.filter((r) => !r.logged).map((r) => r.person.name.split(' ')[0]);
  if (!missing.length) return 'Everyone has logged';
  if (missing.length <= 2) return `${missing.join(', ')} not yet`;
  return `${missing.slice(0, 2).join(', ')} +${missing.length - 2} not yet`;
}

function TodayCard({ data }: { data: AdminDashboardResponse }) {
  const [filter, setFilter] = useState<TodayFilter>('all');
  const rows = useMemo(() => {
    const r = filter === 'all' ? data.todayRows : data.todayRows.filter((x) => x.band === filter);
    // Not logged first (needs a nudge), then by name.
    return [...r].sort((a, b) => Number(a.logged) - Number(b.logged) || a.person.name.localeCompare(b.person.name));
  }, [data.todayRows, filter]);
  return (
    <Card>
      <CardHeader title="Today’s logging" aside={`${data.kpis.loggedToday} of ${data.todayRows.length} logged`} />
      <Segmented
        size="sm"
        label="Filter today's logging"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'none', label: 'Not logged' },
          { value: 'under', label: 'Under' },
          { value: 'in', label: 'In range' },
          { value: 'over', label: 'Over' },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState compact title="Nobody in this group" />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => (
            <li key={r.person.id} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-3 border-t border-hairline py-2 text-[14px] max-sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link to="/members/$id" params={{ id: r.person.id }} className="min-w-0 text-ink hover:text-accent">
                <PersonCell person={r.person} size={28} />
              </Link>
              <span className="font-mono text-[12px] text-muted max-sm:hidden">
                {r.logged ? fmtInt(r.eaten) : '—'} / {r.target != null ? fmtInt(r.target) : '—'}
              </span>
              <BandPill band={r.band} label={r.bandLabel} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AiBudgetCard({ data }: { data: AdminDashboardResponse }) {
  const a = data.ai;
  const frac = a.cap > 0 ? a.monthToDate / a.cap : 0;
  return (
    <Card>
      <CardHeader
        title={
          <>
            AI budget <AiChip />
          </>
        }
        actions={
          <Link to="/ai" className="text-[13px] font-semibold">
            Open
          </Link>
        }
      />
      {!a.on && <div className="rounded-[10px] bg-none-bg px-3 py-2 text-[12px] font-semibold text-none-fg">AI is off team-wide. Members get the logic-only fallbacks.</div>}
      <div className="flex justify-between text-[13px]">
        <span>
          {fmtUsd(a.monthToDate)} of {fmtUsd(a.cap)}
        </span>
        <span className="text-muted">{fmtPct(a.pct)}</span>
      </div>
      <ProgressBar value={frac} marker={a.alertAt / 100} tone={a.pct >= a.alertAt ? 'warn' : 'accent'} label={`AI spend ${fmtPct(a.pct)} of monthly cap`} />
      <span className="text-[12px] text-muted">
        Alert at {a.alertAt}%. Resets {fmtDate(a.resetsOn)}. Projected {fmtUsd(a.projected)} this month · {fmtInt(a.callsToday)} calls today · {fmtPct(a.fallbackRate, true)} fallbacks.
      </span>
    </Card>
  );
}

function AttentionCard({ data }: { data: AdminDashboardResponse }) {
  return (
    <Card>
      <CardHeader title="Needs attention" aside={data.needsAttention.length ? `${data.needsAttention.length}` : undefined} />
      {data.needsAttention.length === 0 ? (
        <div className="text-[13px] text-muted">All clear. Nothing needs you right now.</div>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {data.needsAttention.map((a, i) => (
            <li key={`${a.kind}-${i}`} className="flex items-start justify-between gap-3 border-t border-hairline py-2 text-[13px] leading-normal first:border-t-0">
              <span className="flex min-w-0 flex-col">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{humanize(a.kind)}</span>
                <span>{a.text}</span>
              </span>
              <HrefLink href={a.url} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold">
                Open <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              </HrefLink>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PlanStreakCard({ data }: { data: AdminDashboardResponse }) {
  const { onTrack, total } = data.plan;
  return (
    <Card>
      <CardHeader
        title="Plans & streaks"
        actions={
          <Link to="/plans" className="text-[13px] font-semibold">
            Activity plans
          </Link>
        }
      />
      <div className="flex items-baseline justify-between text-[13px]">
        <span>Activity plan on track this week</span>
        <span className="font-mono text-[12px] text-muted">
          {onTrack} / {total}
        </span>
      </div>
      <ProgressBar value={total ? onTrack / total : 0} label={`${onTrack} of ${total} members on track with their activity plan`} />
      <div className="mt-1 flex flex-col gap-2 border-t border-hairline pt-3">
        <span className="text-[13px] font-semibold">Streaks at risk tonight</span>
        {data.streaksAtRisk.length === 0 ? (
          <span className="text-[13px] text-muted">No streaks at risk.</span>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.streaksAtRisk.map((p) => (
              <Link key={p.id} to="/members/$id" params={{ id: p.id }} search={{ tab: 'momentum' }} className="rounded-full border border-under-bg bg-under-bg/60 py-1 pl-1 pr-3 text-[13px] text-under-fg hover:border-under-fg">
                <PersonCell person={p} size={22} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ChatCard({ data }: { data: AdminDashboardResponse }) {
  const c = data.chat;
  return (
    <Card>
      <CardHeader
        title={
          <>
            <MessageSquare aria-hidden className="h-4 w-4 text-accent" /> Chat
          </>
        }
      />
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
        <li className="flex justify-between">
          <span className="text-muted">Messages today</span>
          <b>{fmtInt(c.messagesToday)}</b>
        </li>
        <li className="flex justify-between">
          <span className="text-muted">Memes fired</span>
          <b>{fmtInt(c.memesToday)}</b>
        </li>
        <li className="flex justify-between">
          <span className="text-muted">Reports pending</span>
          <b className={c.reportsPending ? 'text-accent-dark' : undefined}>{fmtInt(c.reportsPending)}</b>
        </li>
      </ul>
      <Link to="/chat" search={{ tab: c.reportsPending ? 'reports' : 'messages' }} className="text-[13px] font-semibold">
        {c.reportsPending ? 'Review reports' : 'Open moderation'}
      </Link>
    </Card>
  );
}

function StorageCard({ data }: { data: AdminDashboardResponse }) {
  const s = data.storage;
  const items = Object.entries(s.byKind)
    .map(([k, v]) => ({ key: k, label: humanize(k), value: v }))
    .sort((a, b) => b.value - a.value);
  return (
    <Card>
      <CardHeader
        title={
          <>
            <HardDrive aria-hidden className="h-4 w-4 text-accent" /> Storage
          </>
        }
        aside={fmtBytes(s.totalBytes)}
      />
      {items.length > 0 ? <MeterList label="Storage by kind" items={items} format={fmtBytes} /> : <span className="text-[13px] text-muted">No images stored yet.</span>}
      <div className="text-[12px] leading-normal text-muted">
        {s.lastRun ? (
          <>
            Last cleanup {fmtDateTime(s.lastRun.at)}: {fmtInt(s.lastRun.imagesDeleted)} images, {fmtBytes(s.lastRun.bytesReclaimed)} reclaimed.
          </>
        ) : (
          'No cleanup has run yet.'
        )}{' '}
        {s.nextRunAt && <>Next run {fmtDateTime(s.nextRunAt)}.</>}
      </div>
    </Card>
  );
}

