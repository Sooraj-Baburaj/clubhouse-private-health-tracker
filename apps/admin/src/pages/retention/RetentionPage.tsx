import { Link } from '@tanstack/react-router';
import { ArrowRight, Download, HardDrive, Lock, PackageOpen, Play, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { RETAINED_IMAGE_KINDS, RetentionUpdate, type RetentionResponse } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { useRole } from '@/features/me';
import { PENDING_EXPORT, useCleanupPreview, useExportTeam, useHandleDeletion, useRetention, useRunCleanup, useUpdateRetention } from '@/features/retention';
import { fmtBytes, fmtDate, fmtDateTime, fmtInt, fmtPct, fmtRelative, humanize, plural } from '@/lib/format';
import { Button, Card, CardHeader, confirmAction, DataTable, EmptyState, ErrorState, Field, Grid, KpiCard, KpiGrid, MeterList, Mono, NumberInput, PageHeader, PersonCell, Pill, ProgressBar, RowAction, Segmented, SkeletonCard, StatusPill, type Column } from '@/ui';

type Run = RetentionResponse['runs'][number];
type Export = RetentionResponse['exports'][number];
type DeletionRequest = RetentionResponse['pendingDeletionRequests'][number];
type MemberStorage = RetentionResponse['storage']['perMember'][number];

const PRESETS = [30, 60, 90, 180, 365] as const;
const MB = 1024 * 1024;

/** Retention & data (super admin): image retention, storage, cleanup runs, team export, deletion requests. */
export function RetentionPage() {
  const { isSuper, me } = useRole();
  const q = useRetention(isSuper);

  return (
    <>
      <PageHeader eyebrow="Super Admin only" title="Retention & data" description="How long photos are kept, what’s using storage, and the team’s exports and deletion requests." />
      {!me ? (
        <SkeletonCard lines={4} />
      ) : !isSuper ? (
        <Card>
          <EmptyState icon={<Lock className="h-5 w-5" />} title="Super Admins only" body="Retention, exports and deletion requests are handled by a Super Admin. Ask one if something here needs changing." />
        </Card>
      ) : q.isPending ? (
        <>
          <KpiGrid>
            {[0, 1, 2, 3].map((i) => (
              <KpiCard key={i} index={i} loading label="Loading" value={null} />
            ))}
          </KpiGrid>
          <Grid min={300}>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </Grid>
        </>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <RetentionBody data={q.data} />
      )}
    </>
  );
}

function RetentionBody({ data }: { data: RetentionResponse }) {
  const capBytes = data.storage.softCapMb * MB;
  const used = capBytes > 0 ? data.storage.totalBytes / capBytes : 0;
  const lastReal = useMemo(() => [...data.runs].filter((r) => !r.dryRun).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null, [data.runs]);

  return (
    <>
      <KpiGrid>
        <KpiCard index={0} label="Storage used" value={fmtBytes(data.storage.totalBytes)} sub={`${fmtPct(used, true)} of ${fmtInt(data.storage.softCapMb)} MB soft cap`} tone={used >= 0.9 ? 'warn' : 'default'} />
        <KpiCard index={1} label="Photos kept for" value={data.retentionDays} suffix="days" sub={`AI prompts: ${data.promptRetentionDays ? `${data.promptRetentionDays} days` : 'not kept'}`} />
        <KpiCard index={2} label="Next cleanup" value={data.nextRunAt ? fmtRelative(data.nextRunAt) : 'Not scheduled'} sub={lastReal ? `Last: ${fmtRelative(lastReal.startedAt)}` : 'No cleanup has run yet'} />
        <KpiCard index={3} label="Deletion requests" value={data.pendingDeletionRequests.length} sub={data.pendingDeletionRequests.length ? 'Waiting for you' : 'All handled'} tone={data.pendingDeletionRequests.length ? 'warn' : 'default'} />
      </KpiGrid>

      <Grid min={300}>
        <RetentionCard data={data} />
        <CleanupCard data={data} lastReal={lastReal} />
        <ExportCard exports={data.exports} />
      </Grid>

      <DeletionRequests rows={data.pendingDeletionRequests} />

      <Grid min={340}>
        <StorageCard data={data} used={used} />
        <MemberStorageTable rows={data.storage.perMember} total={data.storage.totalBytes} />
      </Grid>

      <RunsTable runs={data.runs} />
    </>
  );
}

/* ───────── Retention ───────── */

function RetentionCard({ data }: { data: RetentionResponse }) {
  const update = useUpdateRetention();
  const [days, setDays] = useState<number | null>(data.retentionDays);
  // Follow the saved value when it changes (adjust state during render).
  const [savedDays, setSavedDays] = useState(data.retentionDays);
  if (savedDays !== data.retentionDays) {
    setSavedDays(data.retentionDays);
    setDays(data.retentionDays);
  }
  const valid = days != null && Number.isInteger(days) && days >= 7 && days <= 365;
  const changed = days !== data.retentionDays;
  const preset = PRESETS.find((p) => p === days);

  const save = async () => {
    if (!valid || !changed || days == null) return;
    const shorter = days < data.retentionDays;
    await confirmAction({
      title: `Keep photos for ${days} days?`,
      eyebrow: 'Retention',
      tone: shorter ? 'danger' : 'default',
      body: shorter
        ? 'Photos older than the new window are deleted at the next cleanup. Logged numbers stay; only the images go.'
        : 'Photos will be kept longer from now on. Anything already deleted can’t come back.',
      impact: [`Food, activity and chat photos: ${data.retentionDays} → ${days} days`, `Applies to ${RETAINED_IMAGE_KINDS.join(', ')} images`],
      confirmLabel: 'Save retention',
      requireReason: true,
      reasonPlaceholder: 'e.g. Storage is close to the cap',
      onConfirm: async (reason) => {
        const body = RetentionUpdate.safeParse({ retentionDays: days, reason });
        if (!body.success) throw new Error(body.error.issues[0]?.message ?? 'Check the values and try again.');
        await update.mutateAsync(body.data);
      },
    });
  };

  return (
    <Card>
      <CardHeader title="Retention" />
      <Field as="div" label="Keep food, activity and chat photos for" error={days != null && !valid ? 'Use 7–365 days' : undefined} hint="Memes, avatars and the team logo are never cleaned up.">
        <Segmented
          size="sm"
          label="Retention presets"
          value={preset ? String(preset) : ''}
          onChange={(v) => setDays(Number(v))}
          options={PRESETS.map((p) => ({ value: String(p), label: p === 365 ? '1 year' : `${p} d` }))}
        />
        <div className="flex items-center gap-2">
          <NumberInput aria-label="Retention days" min={7} max={365} step={1} value={days} invalid={days != null && !valid} onValue={setDays} className="!w-[110px]" />
          <span className="text-[13px] text-muted">days</span>
        </div>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={!valid || !changed} loading={update.isPending}>
          Save…
        </Button>
        {changed && (
          <Button size="sm" variant="ghost" onClick={() => setDays(data.retentionDays)}>
            Undo
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-[13px]">
        <span className="text-muted">
          AI prompt snapshots: <b className="text-ink">{data.promptRetentionDays ? `${data.promptRetentionDays} days` : 'not kept'}</b>
        </span>
        <Link to="/ai" className="inline-flex items-center gap-1 font-semibold">
          Change in AI <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Card>
  );
}

/* ───────── Cleanup job ───────── */

function CleanupCard({ data, lastReal }: { data: RetentionResponse; lastReal: Run | null }) {
  const preview = useCleanupPreview();
  const run = useRunCleanup();
  const busy = preview.isPending || run.isPending;
  const running = data.runs.some((r) => r.status === 'running' && !r.dryRun);

  const start = async () => {
    let dry: { images: number; bytes: number };
    try {
      dry = await preview.mutateAsync();
    } catch {
      return; // useAction already toasted the error
    }
    if (dry.images === 0) {
      toast.success(`Nothing to clean up. No photos are older than ${data.retentionDays} days.`);
      return;
    }
    await confirmAction({
      title: 'Run cleanup now?',
      eyebrow: 'Cleanup',
      body: `Photos past the ${data.retentionDays}-day window are deleted from storage. Logged numbers stay; the photos can’t be restored.`,
      impact: [`${plural(dry.images, 'image')} · ${fmtBytes(dry.bytes)} would be deleted`],
      confirmLabel: `Delete ${plural(dry.images, 'image')}`,
      onConfirm: () => run.mutateAsync(),
    });
  };

  return (
    <Card>
      <CardHeader title="Cleanup job" aside={running ? <Pill tone="under">Running</Pill> : undefined} />
      <div className="text-[14px] leading-relaxed">
        {lastReal ? (
          <>
            Last run <b title={fmtDateTime(lastReal.startedAt)}>{fmtDateTime(lastReal.startedAt)}</b>
            <br />
            Removed {plural(lastReal.imagesDeleted, 'photo')} · {fmtBytes(lastReal.bytesReclaimed)} freed
          </>
        ) : (
          <span className="text-muted">No cleanup has run yet.</span>
        )}
        <br />
        <span className="text-muted">{data.nextRunAt ? `Next run ${fmtDateTime(data.nextRunAt)}` : 'Next run not scheduled'}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Button variant="outline" className="self-start" icon={<Play className="h-3.5 w-3.5" />} loading={busy} disabled={running} onClick={() => void start()}>
          {preview.isPending ? 'Counting…' : 'Run cleanup now'}
        </Button>
        <span className="text-[12px] text-muted">Counts first, then asks before deleting anything.</span>
      </div>
    </Card>
  );
}

/* ───────── Export ───────── */

/** Milliseconds from now until `iso` (negative once it has passed). Reads the clock, like `fmtRelative`. */
const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();

function ExportCard({ exports }: { exports: Export[] }) {
  const start = useExportTeam();
  const sorted = useMemo(() => [...exports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [exports]);
  const pending = sorted.some((e) => PENDING_EXPORT.has(e.status));
  return (
    <Card>
      <CardHeader title="Team export" aside={pending ? <Pill tone="under">Preparing…</Pill> : undefined} />
      <Button className="self-start" icon={<PackageOpen className="h-4 w-4" />} loading={start.isPending} disabled={pending} onClick={() => start.mutate()}>
        Export team data
      </Button>
      <span className="text-[13px] leading-relaxed text-muted">A CSV of every log plus JSON of profiles and plans. Links work for 24 hours. Each export is written to the audit log.</span>
      {sorted.length > 0 && (
        <ul aria-label="Recent exports" className="m-0 flex list-none flex-col border-t border-hairline p-0">
          {sorted.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline py-2.5 last:border-b-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  {humanize(e.scope)} <StatusPill status={e.status} label={PENDING_EXPORT.has(e.status) ? 'Preparing' : undefined} />
                </span>
                <span className="text-[12px] text-muted">
                  <span title={fmtDateTime(e.createdAt)}>{fmtRelative(e.createdAt)}</span>
                  {e.bytes != null && <> · {fmtBytes(e.bytes)}</>}
                  {e.expiresAt && <> · {msUntil(e.expiresAt) < 0 ? 'expired' : `expires ${fmtRelative(e.expiresAt)}`}</>}
                </span>
              </div>
              {e.url && (!e.expiresAt || msUntil(e.expiresAt) > 0) && (
                <a href={e.url} download className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[rgba(182,49,108,0.25)] bg-white px-3 text-[13px] font-semibold text-ink hover:border-accent">
                  <Download aria-hidden className="h-3.5 w-3.5" /> Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ───────── Deletion requests ───────── */

function DeletionRequests({ rows }: { rows: DeletionRequest[] }) {
  const handle = useHandleDeletion();

  const act = (r: DeletionRequest, action: 'done' | 'dismissed') =>
    confirmAction(
      action === 'done'
        ? {
            title: `Mark ${r.person.name}’s request done?`,
            eyebrow: 'Deletion request',
            tone: 'default',
            body: 'Only mark it done once their data has been deleted from the danger zone on their profile. This closes the request.',
            impact: [`Request from ${fmtDate(r.createdAt)}`],
            confirmLabel: 'Mark done',
            onConfirm: () => handle.mutateAsync({ id: r.id, action }),
          }
        : {
            title: `Dismiss ${r.person.name}’s request?`,
            eyebrow: 'Deletion request',
            body: 'The request is closed without deleting anything. Let them know why.',
            impact: [`Request from ${fmtDate(r.createdAt)}`, 'No data is deleted'],
            confirmLabel: 'Dismiss',
            onConfirm: () => handle.mutateAsync({ id: r.id, action }),
          },
    );

  const columns: Column<DeletionRequest>[] = [
    { id: 'person', header: 'Member', width: 'minmax(180px,1.2fr)', sortValue: (r) => r.person.name, cell: (r) => <PersonCell person={r.person} /> },
    { id: 'note', header: 'Note', width: 'minmax(200px,2fr)', cell: (r) => (r.note ? <span className="line-clamp-2 text-[13px]" title={r.note}>{r.note}</span> : <span className="text-[13px] text-muted">No note</span>) },
    { id: 'created', header: 'Requested', width: '120px', sortValue: (r) => r.createdAt, cell: (r) => <span title={fmtDateTime(r.createdAt)} className="text-[13px] text-muted">{fmtRelative(r.createdAt)}</span> },
    {
      id: 'act',
      header: '',
      width: '260px',
      align: 'end',
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Link to="/members/$id" params={{ id: r.person.id }} search={{ tab: 'profile' }} className="rounded-md px-1 py-0.5 text-[13px] font-semibold">
            Delete data
          </Link>
          <RowAction tone="ink" onClick={() => void act(r, 'done')} label={`Mark ${r.person.name}’s request done`}>
            Mark done
          </RowAction>
          <RowAction tone="danger" onClick={() => void act(r, 'dismissed')} label={`Dismiss ${r.person.name}’s request`}>
            Dismiss
          </RowAction>
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="deletion-title" className="flex min-w-0 flex-col gap-3">
      <SectionTitle id="deletion-title" title="Pending deletion requests" sub="Delete the member’s data from the danger zone on their profile, then mark the request done." />
      <DataTable
        label="Pending deletion requests"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        minWidth={720}
        initialSort={{ id: 'created', dir: 'asc' }}
        search={rows.length > 3 ? { placeholder: 'Search requests', text: (r) => `${r.person.name} ${r.note ?? ''}` } : undefined}
        hideCount={rows.length <= 3}
        empty={<EmptyState compact icon={<UserX className="h-5 w-5" />} title="No pending requests" body="When a member asks for their account to be deleted, it shows up here." />}
      />
    </section>
  );
}

/* ───────── Storage ───────── */

function StorageCard({ data, used }: { data: RetentionResponse; used: number }) {
  const items = Object.entries(data.storage.byKind)
    .map(([k, v]) => ({ key: k, label: humanize(k), value: v.bytes, sub: plural(v.count, 'image') }))
    .sort((a, b) => b.value - a.value);
  return (
    <Card>
      <CardHeader
        title={
          <>
            <HardDrive aria-hidden className="h-4 w-4 text-accent" /> Storage
          </>
        }
        aside={`${fmtBytes(data.storage.totalBytes)} of ${fmtInt(data.storage.softCapMb)} MB`}
      />
      <div className="flex flex-col gap-1.5">
        <ProgressBar value={used} label={`Storage used: ${fmtPct(used, true)} of the soft cap`} tone={used >= 0.9 ? 'warn' : 'accent'} />
        <span className={used >= 0.9 ? 'text-[12px] font-semibold text-accent-dark' : 'text-[12px] text-muted'}>
          {fmtPct(used, true)} of the soft cap{used >= 0.9 ? '. Consider a shorter retention window.' : ''}
        </span>
      </div>
      {items.length > 0 ? <MeterList label="Storage by kind" items={items} format={fmtBytes} /> : <span className="text-[13px] text-muted">No images stored yet.</span>}
    </Card>
  );
}

function MemberStorageTable({ rows, total }: { rows: MemberStorage[]; total: number }) {
  const columns: Column<MemberStorage>[] = [
    { id: 'person', header: 'Member', width: 'minmax(160px,1fr)', sortValue: (r) => r.person.name, cell: (r) => <PersonCell person={r.person} size={28} /> },
    { id: 'bytes', header: 'Storage', width: '100px', align: 'end', sortValue: (r) => r.bytes, cell: (r) => <Mono>{fmtBytes(r.bytes)}</Mono> },
    { id: 'share', header: 'Share', width: '70px', align: 'end', sortValue: (r) => r.bytes, cell: (r) => <Mono muted>{total ? fmtPct(r.bytes / total, true) : '—'}</Mono> },
  ];
  return (
    <section aria-labelledby="member-storage-title" className="flex min-w-0 flex-col gap-3">
      <SectionTitle id="member-storage-title" title="Storage by member" />
      <DataTable
        label="Storage by member"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.person.id}
        minWidth={360}
        pageSize={8}
        initialSort={{ id: 'bytes', dir: 'desc' }}
        search={{ placeholder: 'Search members', text: (r) => r.person.name }}
        empty={<EmptyState compact title="No member photos stored" />}
      />
    </section>
  );
}

/* ───────── Runs log ───────── */

function RunsTable({ runs }: { runs: Run[] }) {
  const triggers = Array.from(new Set(runs.map((r) => r.trigger)));
  const columns: Column<Run>[] = [
    { id: 'started', header: 'Started', width: '150px', sortValue: (r) => r.startedAt, cell: (r) => <Mono muted><span title={fmtDateTime(r.startedAt)}>{fmtDateTime(r.startedAt)}</span></Mono> },
    { id: 'trigger', header: 'Trigger', width: '110px', sortValue: (r) => r.trigger, cell: (r) => <Pill tone="muted">{humanize(r.trigger)}</Pill> },
    { id: 'dry', header: 'Mode', width: '100px', sortValue: (r) => r.dryRun, cell: (r) => (r.dryRun ? <Pill tone="outline">Dry run</Pill> : <Pill tone="neutral">Real</Pill>) },
    { id: 'images', header: 'Images', width: '90px', align: 'end', sortValue: (r) => r.imagesDeleted, cell: (r) => <Mono>{fmtInt(r.imagesDeleted)}</Mono> },
    { id: 'bytes', header: 'Freed', width: '90px', align: 'end', sortValue: (r) => r.bytesReclaimed, cell: (r) => <Mono>{fmtBytes(r.bytesReclaimed)}</Mono> },
    { id: 'status', header: 'Status', width: '100px', sortValue: (r) => r.status, cell: (r) => <StatusPill status={r.status} /> },
    { id: 'by', header: 'Started by', width: 'minmax(160px,1fr)', sortValue: (r) => r.startedBy?.name ?? '', cell: (r) => (r.startedBy ? <PersonCell person={r.startedBy} size={24} /> : <span className="text-[13px] text-muted">Scheduled</span>) },
  ];
  return (
    <section aria-labelledby="runs-title" className="flex min-w-0 flex-col gap-3">
      <SectionTitle id="runs-title" title="Cleanup runs" />
      <DataTable
        label="Cleanup runs"
        columns={columns}
        rows={runs}
        rowKey={(r) => r.id}
        initialSort={{ id: 'started', dir: 'desc' }}
        pageSize={20}
        rowClassName={(r) => r.status === 'failed' && 'bg-over-bg/40'}
        search={{ placeholder: 'Search runs', text: (r) => `${r.trigger} ${r.status} ${r.startedBy?.name ?? 'scheduled'}` }}
        filters={[
          { id: 'mode', label: 'Mode', options: [{ value: '', label: 'Any mode' }, { value: 'real', label: 'Real' }, { value: 'dry', label: 'Dry run' }], predicate: (r, v) => (v === 'dry' ? r.dryRun : !r.dryRun) },
          { id: 'trigger', label: 'Trigger', options: [{ value: '', label: 'All triggers' }, ...triggers.map((t) => ({ value: t, label: humanize(t) }))], predicate: (r, v) => r.trigger === v },
          { id: 'status', label: 'Status', options: [{ value: '', label: 'Any status' }, ...Array.from(new Set(runs.map((r) => r.status))).map((s) => ({ value: s, label: humanize(s) }))], predicate: (r, v) => r.status === v },
        ]}
        empty={<EmptyState title="No cleanup runs yet" body="The nightly job and “Run cleanup now” both show up here." />}
      />
    </section>
  );
}

function SectionTitle({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="h3 m-0">
        {title}
      </h2>
      {sub && <p className="m-0 text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

