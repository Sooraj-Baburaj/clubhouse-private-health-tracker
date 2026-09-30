import { Play } from 'lucide-react';
import { useState } from 'react';
import type { JobRunRow } from '@clubhouse/contracts';
import { useJobRuns, useRunJobStep } from '@/features/system';
import { fmtDateTime, fmtMs, fmtRelative, humanize } from '@/lib/format';
import { Button, Card, CardHeader, DataTable, EmptyState, Grid, Mono, PageHeader, Pill, type Column } from '@/ui';

const STEPS: { step: string; label: string; hint: string }[] = [
  { step: 'deliver_notifications', label: 'Deliver notifications', hint: 'Send due reminders and pushes now.' },
  { step: 'rollover', label: 'Nightly rollover', hint: 'Close finished days: streaks, in-range, day-end triggers.' },
  { step: 'retention', label: 'Retention cleanup', hint: 'Delete images past the retention window.' },
  { step: 'recap', label: 'Weekly recap', hint: 'Build recaps for weeks that have ended.' },
  { step: 'housekeeping', label: 'Housekeeping', hint: 'Expire sessions, exports and stale rate limits.' },
];

function durationOf(r: JobRunRow): number | null {
  if (!r.finishedAt) return null;
  return new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
}

function statsText(s: Record<string, unknown> | null): string {
  if (!s) return '—';
  return Object.entries(s)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

/** Jobs & health: last job runs and "run step now". */
export function JobsPage() {
  const q = useJobRuns();
  const run = useRunJobStep();
  const [running, setRunning] = useState<string | null>(null);
  const [last, setLast] = useState<Record<string, { ok: boolean; stats: Record<string, unknown> }>>({});

  const columns: Column<JobRunRow>[] = [
    { id: 'job', header: 'Job', width: 'minmax(160px,1fr)', sortValue: (r) => r.job, cell: (r) => <span className="font-semibold">{humanize(r.job)}</span> },
    { id: 'source', header: 'Source', width: '110px', sortValue: (r) => r.source, cell: (r) => <Pill tone="muted">{r.source}</Pill> },
    { id: 'started', header: 'Started', width: '150px', sortValue: (r) => r.startedAt, cell: (r) => <span title={fmtDateTime(r.startedAt)} className="text-[13px] text-muted">{fmtRelative(r.startedAt)}</span> },
    { id: 'dur', header: 'Duration', width: '90px', sortValue: (r) => durationOf(r) ?? -1, cell: (r) => <Mono>{r.finishedAt ? fmtMs(durationOf(r)) : 'running'}</Mono> },
    { id: 'ok', header: 'Result', width: '100px', sortValue: (r) => (r.ok == null ? 1 : r.ok ? 2 : 0), cell: (r) => (r.ok == null ? <Pill tone="under">Running</Pill> : r.ok ? <Pill tone="in">OK</Pill> : <Pill tone="over" title={r.error ?? undefined}>Failed</Pill>) },
    { id: 'stats', header: 'Stats', width: 'minmax(220px,2fr)', cell: (r) => <Mono muted className="line-clamp-2 break-words">{r.error ? <span className="text-accent-dark">{r.error}</span> : statsText(r.stats)}</Mono> },
  ];

  return (
    <>
      <PageHeader eyebrow="System" title="Jobs & health" description="Scheduled work runs from the minute pinger and a daily catch-up. Run a step by hand if something looks stuck." />
      <Card>
        <CardHeader title="Run a step now" />
        <Grid min={220}>
          {STEPS.map((s) => (
            <div key={s.step} className="flex flex-col gap-2 rounded-[14px] border border-hairline bg-bg/60 p-3.5">
              <span className="text-[14px] font-semibold">{s.label}</span>
              <span className="text-[12px] leading-snug text-muted">{s.hint}</span>
              {last[s.step] && (
                <Mono muted className="break-words">
                  {last[s.step]!.ok ? 'OK' : 'Problems'} · {statsText(last[s.step]!.stats)}
                </Mono>
              )}
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                icon={<Play className="h-3.5 w-3.5" />}
                loading={running === s.step}
                disabled={!!running && running !== s.step}
                onClick={() => {
                  setRunning(s.step);
                  run.mutate(s.step, {
                    onSuccess: (r) => setLast((l) => ({ ...l, [s.step]: r })),
                    onSettled: () => setRunning(null),
                  });
                }}
              >
                Run now
              </Button>
            </div>
          ))}
        </Grid>
      </Card>
      <DataTable
        label="Recent job runs"
        columns={columns}
        rows={q.data}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => String(r.id)}
        initialSort={{ id: 'started', dir: 'desc' }}
        pageSize={50}
        rowClassName={(r) => r.ok === false && 'bg-over-bg/40'}
        search={{ placeholder: 'Search jobs', text: (r) => `${r.job} ${r.source} ${r.error ?? ''}` }}
        filters={[
          { id: 'job', label: 'Job', options: [{ value: '', label: 'All jobs' }, ...Array.from(new Set((q.data ?? []).map((r) => r.job))).map((j) => ({ value: j, label: humanize(j) }))], predicate: (r, v) => r.job === v },
          { id: 'ok', label: 'Result', options: [{ value: '', label: 'Any result' }, { value: 'ok', label: 'OK' }, { value: 'failed', label: 'Failed' }, { value: 'running', label: 'Running' }], predicate: (r, v) => (v === 'ok' ? r.ok === true : v === 'failed' ? r.ok === false : r.ok == null) },
        ]}
        empty={<EmptyState title="No job runs yet" body="Runs appear here once the pinger or daily cron calls the tick endpoint." />}
      />
    </>
  );
}
