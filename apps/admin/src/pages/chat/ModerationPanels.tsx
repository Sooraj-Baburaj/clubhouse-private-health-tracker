import { Link } from '@tanstack/react-router';
import { BellOff, Flag, Plus } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { KeywordsRequest } from '@clubhouse/contracts';
import {
  useKeywords,
  useMutes,
  useReports,
  useResolveReport,
  useSetKeywords,
  useUnmute,
  type MuteRow,
  type ReportRow,
} from '@/features/chat';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  ChipInput,
  confirmAction,
  DataTable,
  EmptyState,
  ErrorState,
  FilterSelect,
  Grid,
  PersonCell,
  RowAction,
  SearchInput,
  Segmented,
  SkeletonCard,
  StatusPill,
  type Column,
} from '@/ui';

const isOpen = (r: ReportRow) => r.status === 'open' || r.status === 'pending';

/* ───────── Reports ───────── */

export function ReportsPanel() {
  const q = useReports();
  const resolve = useResolveReport();
  const reduce = useReducedMotion();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('open');
  const [order, setOrder] = useState<'new' | 'old'>('new');
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    let r = q.data ?? [];
    if (status === 'open') r = r.filter(isOpen);
    else if (status === 'closed') r = r.filter((x) => !isOpen(x));
    const t = text.trim().toLowerCase();
    if (t)
      r = r.filter((x) =>
        `${x.reason} ${x.message.body} ${x.message.author?.name ?? ''} ${x.reporter.name}`
          .toLowerCase()
          .includes(t),
      );
    return [...r].sort((a, b) =>
      order === 'new'
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }, [q.data, status, text, order]);

  const act = (r: ReportRow, action: 'dismiss' | 'delete' | 'nudge') => {
    setBusy(`${r.id}:${action}`);
    return resolve.mutateAsync({ id: r.id, body: { action } }).finally(() => setBusy(null));
  };

  const onDelete = (r: ReportRow) =>
    confirmAction({
      title: 'Delete the reported message?',
      eyebrow: 'Reports',
      body: 'Removed for everyone; the chat shows “removed by an admin” in its place. The report is closed. Recorded in the audit log.',
      impact: [
        `1 message from ${r.message.author?.name ?? 'Clubhouse'} · ${fmtDateTime(r.message.createdAt)}`,
      ],
      confirmLabel: 'Delete message',
      onConfirm: () => act(r, 'delete'),
    });

  const onNudge = (r: ReportRow) =>
    confirmAction({
      title: `Nudge ${r.message.author?.name ?? 'the author'}?`,
      eyebrow: 'Reports',
      body: 'They get a friendly private note about keeping chat kind. The message stays and the report is closed. The reporter stays anonymous.',
      confirmLabel: 'Send nudge',
      tone: 'default',
      onConfirm: () => act(r, 'nudge'),
    });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={text} onChange={setText} placeholder="Search reports" />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Resolved' },
            { value: '', label: 'All reports' },
          ]}
        />
        <Segmented
          size="sm"
          label="Order"
          value={order}
          onChange={setOrder}
          options={[
            { value: 'new', label: 'Newest' },
            { value: 'old', label: 'Oldest' },
          ]}
          className="ml-auto"
        />
      </div>
      {q.isPending ? (
        <Grid min={320}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </Grid>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Flag className="h-5 w-5" />}
            title={status === 'open' && !text ? 'No open reports' : 'No reports match'}
            body={
              status === 'open' && !text
                ? 'All clear. When someone reports a message, it shows up here.'
                : 'Try another search or status.'
            }
          />
        </Card>
      ) : (
        <Grid min={320}>
          {rows.map((r, i) => (
            <motion.div
              key={r.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduce ? 0 : Math.min(i, 10) * 0.03 }}
              className="min-w-0"
            >
              <Card className={isOpen(r) ? 'border-accent-border' : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-muted" title={fmtDateTime(r.createdAt)}>
                    Reported {fmtRelative(r.createdAt)}
                  </span>
                  <StatusPill status={r.status} />
                </div>
                <div className="flex gap-2.5 rounded-[12px] bg-bg p-3">
                  <Avatar person={r.message.author} size={28} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-semibold">
                      {r.message.author?.name ?? 'Clubhouse'}{' '}
                      <span className="font-normal text-muted">
                        · {fmtDateTime(r.message.createdAt)}
                      </span>
                    </span>
                    {r.message.deleted ? (
                      <span className="text-[13px] italic text-muted">
                        {r.message.deletedByAdmin
                          ? 'Message removed by an admin'
                          : 'Message deleted by the author'}
                      </span>
                    ) : (
                      <span className="line-clamp-4 whitespace-pre-wrap break-words text-[14px] leading-normal">
                        {r.message.body ||
                          (r.message.attachments.length
                            ? `${r.message.attachments.length} attachment(s)`
                            : '—')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-[13px]">
                  <span className="text-muted">
                    Reason from <b className="font-semibold text-ink">{r.reporter.name}</b>
                  </span>
                  <span className="leading-relaxed">“{r.reason}”</span>
                </div>
                {isOpen(r) && (
                  <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === `${r.id}:dismiss`}
                      disabled={!!busy}
                      onClick={() => void act(r, 'dismiss').catch(() => undefined)}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy || !r.message.author}
                      onClick={() => void onNudge(r)}
                    >
                      Nudge author
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!!busy || r.message.deleted}
                      onClick={() => void onDelete(r)}
                      className="ml-auto"
                    >
                      Delete message
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </Grid>
      )}
    </div>
  );
}

/* ───────── Keywords ───────── */

const MAX_KEYWORDS = 200;

export function KeywordsPanel() {
  const q = useKeywords();
  const save = useSetKeywords();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = q.data?.keywords ?? [];
  const value = draft ?? saved;
  const dirty =
    draft != null && (draft.length !== saved.length || draft.some((k, i) => k !== saved[i]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = KeywordsRequest.safeParse({ keywords: value });
    if (!parsed.success)
      return setError(`Up to ${MAX_KEYWORDS} keywords, each up to 40 characters.`);
    setError(null);
    save.mutate(parsed.data.keywords, { onSuccess: () => setDraft(null) });
  };

  return (
    <Card className="max-w-[860px]">
      <CardHeader
        title="Flagged keywords"
        aside={
          <span className="font-mono text-[12px]">
            {value.length} / {MAX_KEYWORDS}
          </span>
        }
      />
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Messages containing these words are flagged in the moderation list. The same list powers the
        “Message contains” meme trigger, so edits here change what that trigger reacts to.{' '}
        <Link
          to="/memes"
          search={{ tab: 'triggers' }}
          className="font-semibold text-accent hover:text-accent-dark"
        >
          Open triggers
        </Link>
      </p>
      {q.isPending ? (
        <SkeletonCard lines={2} className="border-0 p-0" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <ChipInput
            label="Flagged keywords"
            value={value}
            onChange={(v) => setDraft(v)}
            max={MAX_KEYWORDS}
            placeholder="Add a word and press Enter"
          />
          {error && (
            <span role="alert" className="text-[12px] font-semibold text-accent-dark">
              {error}
            </span>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dirty && (
              <Button variant="secondary" onClick={() => setDraft(null)} disabled={save.isPending}>
                Discard changes
              </Button>
            )}
            <Button type="submit" loading={save.isPending} disabled={!dirty}>
              Save keywords
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/* ───────── Mutes ───────── */

export function MutesPanel({ onMute }: { onMute: () => void }) {
  const q = useMutes();
  const unmute = useUnmute();
  const onUnmute = (m: MuteRow) =>
    confirmAction({
      title: `Unmute ${m.person.name}?`,
      body: 'They can post in chat again straight away.',
      impact: [`Mute was due to end ${fmtRelative(m.until)} (${fmtDateTime(m.until)})`],
      confirmLabel: 'Unmute',
      tone: 'default',
      onConfirm: () => unmute.mutateAsync(m.person.id),
    });
  const columns: Column<MuteRow>[] = [
    {
      id: 'person',
      header: 'Member',
      width: 'minmax(180px,1fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => <PersonCell person={r.person} size={28} />,
    },
    {
      id: 'until',
      header: 'Muted until',
      width: '170px',
      sortValue: (r) => r.until,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="text-[13px]">{fmtDateTime(r.until)}</span>
          <span className="text-[12px] text-muted">ends {fmtRelative(r.until)}</span>
        </div>
      ),
    },
    {
      id: 'reason',
      header: 'Reason',
      width: 'minmax(200px,2fr)',
      cell: (r) => <span className="line-clamp-2 text-[13px] text-muted">{r.reason}</span>,
    },
    {
      id: 'act',
      header: '',
      width: '80px',
      align: 'end',
      cell: (r) => <RowAction onClick={() => void onUnmute(r)}>Unmute</RowAction>,
    },
  ];
  return (
    <DataTable
      label="Muted members"
      columns={columns}
      rows={q.data}
      loading={q.isPending}
      error={q.error}
      onRetry={() => void q.refetch()}
      rowKey={(r) => r.person.id}
      initialSort={{ id: 'until', dir: 'asc' }}
      minWidth={620}
      search={{ placeholder: 'Search muted members', text: (r) => `${r.person.name} ${r.reason}` }}
      filters={[
        {
          id: 'ends',
          label: 'Ends',
          options: [
            { value: '', label: 'Any time' },
            { value: 'day', label: 'Within 24 hours' },
            { value: 'later', label: 'Later than 24 hours' },
          ],
          predicate: (r, v) => {
            const soon = new Date(r.until).getTime() - Date.now() <= 24 * 3_600_000;
            return v === 'day' ? soon : !soon;
          },
        },
      ]}
      toolbar={
        <Button size="sm" variant="danger" icon={<Plus className="h-3.5 w-3.5" />} onClick={onMute}>
          Mute a member
        </Button>
      }
      empty={
        <EmptyState
          icon={<BellOff className="h-5 w-5" />}
          title="Nobody is muted"
          body="Mute someone from a message, or use “Mute a member”."
        />
      }
    />
  );
}
