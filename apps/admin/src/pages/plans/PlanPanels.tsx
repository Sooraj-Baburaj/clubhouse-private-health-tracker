import { CalendarOff, Inbox, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminRestWeekRequest } from '@clubhouse/contracts';
import { weekStartOf } from '@clubhouse/domain';
import {
  useDecideRestWeek,
  usePlanProposals,
  usePlanRanking,
  usePlanRestWeeks,
  useReplyProposal,
  useSetRestWeek,
  type ProposalRow,
  type RankingRow,
  type RestWeekRow,
} from '@/features/plans';
import { fmtDate, fmtDateTime, fmtPct, fmtRelative, todayLocal } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  Field,
  FormGrid,
  Input,
  MemberSelect,
  Modal,
  Mono,
  PersonCell,
  ProgressBar,
  RowAction,
  StatusPill,
  Textarea,
  type Column,
} from '@/ui';

const pctOf = (r: { done: number; planned: number; pct: number }) =>
  r.planned > 0 ? r.done / r.planned : r.pct > 1 ? r.pct / 100 : r.pct;

/* ───────── Ranking ───────── */

export function RankingPanel({ onOpen }: { onOpen: (userId: string) => void }) {
  const q = usePlanRanking();
  const rows = useMemo(() => q.data?.map((r, i) => ({ ...r, rank: i + 1 })), [q.data]);
  const columns: Column<RankingRow & { rank: number }>[] = [
    {
      id: 'rank',
      header: '#',
      width: '44px',
      sortValue: (r) => r.rank,
      cell: (r) => (
        <Mono className={r.rank <= 3 ? 'font-semibold text-accent' : undefined}>{r.rank}</Mono>
      ),
    },
    {
      id: 'person',
      header: 'Member',
      width: 'minmax(180px,1.2fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => <PersonCell person={r.person} size={28} />,
    },
    {
      id: 'bar',
      header: 'Progress',
      width: 'minmax(160px,1.6fr)',
      sortValue: (r) => pctOf(r),
      cell: (r) => (
        <ProgressBar
          value={pctOf(r)}
          label={`${r.person.name}: ${r.done} of ${r.planned}`}
          tone={pctOf(r) >= 1 ? 'ink' : 'accent'}
        />
      ),
    },
    {
      id: 'done',
      header: 'Done',
      width: '90px',
      align: 'end',
      sortValue: (r) => r.done,
      cell: (r) => (
        <Mono>
          {r.done} of {r.planned}
        </Mono>
      ),
    },
    {
      id: 'pct',
      header: '%',
      width: '64px',
      align: 'end',
      sortValue: (r) => pctOf(r),
      cell: (r) => <Mono muted>{fmtPct(pctOf(r), true)}</Mono>,
    },
  ];
  return (
    <DataTable
      label="Weekly team ranking"
      columns={columns}
      rows={rows}
      loading={q.isPending}
      error={q.error}
      onRetry={() => void q.refetch()}
      rowKey={(r) => r.person.id}
      onRowClick={(r) => onOpen(r.person.id)}
      minWidth={560}
      search={{ placeholder: 'Search members', text: (r) => r.person.name }}
      filters={[
        {
          id: 'state',
          label: 'Progress',
          options: [
            { value: '', label: 'Everyone' },
            { value: 'met', label: 'Plan met' },
            { value: 'going', label: 'In progress' },
            { value: 'zero', label: 'Nothing yet' },
          ],
          predicate: (r, v) =>
            v === 'met' ? pctOf(r) >= 1 : v === 'zero' ? r.done === 0 : pctOf(r) < 1 && r.done > 0,
        },
      ]}
      empty={
        <EmptyState
          icon={<Trophy className="h-5 w-5" />}
          title="No ranking yet"
          body="The ranking fills in once members have plans for this week."
        />
      }
    />
  );
}

/* ───────── Proposals ───────── */

export function ProposalsPanel({ onOpen }: { onOpen: (userId: string) => void }) {
  const q = usePlanProposals();
  const reply = useReplyProposal();
  const [active, setActive] = useState<ProposalRow | null>(null);
  const rows = useMemo(
    () =>
      q.data
        ? [...q.data].sort(
            (a, b) =>
              Number(b.status === 'pending') - Number(a.status === 'pending') ||
              b.createdAt.localeCompare(a.createdAt),
          )
        : undefined,
    [q.data],
  );
  const statuses = Array.from(new Set((q.data ?? []).map((r) => r.status)));

  const columns: Column<ProposalRow>[] = [
    {
      id: 'person',
      header: 'Member',
      width: 'minmax(160px,1fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => <PersonCell person={r.person} size={28} sub={fmtRelative(r.createdAt)} />,
    },
    {
      id: 'text',
      header: 'Proposal',
      width: 'minmax(240px,2.4fr)',
      cell: (r) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 text-[14px] leading-snug">{r.text}</span>
          {r.adminReply && (
            <span className="line-clamp-1 text-[12px] text-muted">Reply: {r.adminReply}</span>
          )}
        </div>
      ),
    },
    {
      id: 'created',
      header: 'Sent',
      width: '110px',
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span title={fmtDateTime(r.createdAt)} className="text-[13px] text-muted">
          {fmtDate(r.createdAt)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: '100px',
      sortValue: (r) => r.status,
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      id: 'act',
      header: '',
      width: '190px',
      align: 'end',
      cell: (r) =>
        r.status === 'pending' ? (
          <div className="flex justify-end gap-1">
            <RowAction
              onClick={() => reply.mutate({ id: r.id, body: { status: 'accepted' } })}
              disabled={reply.isPending}
            >
              Accept
            </RowAction>
            <RowAction
              tone="ink"
              onClick={() => reply.mutate({ id: r.id, body: { status: 'declined' } })}
              disabled={reply.isPending}
            >
              Decline
            </RowAction>
            <RowAction tone="ink" onClick={() => setActive(r)}>
              Reply
            </RowAction>
          </div>
        ) : (
          <RowAction tone="ink" onClick={() => setActive(r)}>
            View
          </RowAction>
        ),
    },
  ];

  return (
    <>
      <DataTable
        label="Plan change proposals"
        columns={columns}
        rows={rows}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => r.id}
        onRowClick={setActive}
        rowClassName={(r) => r.status === 'pending' && 'bg-accent-tint/20'}
        search={{
          placeholder: 'Search proposals',
          text: (r) => `${r.person.name} ${r.text} ${r.adminReply ?? ''}`,
        }}
        filters={[
          {
            id: 'status',
            label: 'Status',
            options: [
              { value: '', label: 'All statuses' },
              ...(['pending', 'accepted', 'declined', 'replied'] as const)
                .filter((s) => s === 'pending' || statuses.includes(s))
                .map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
            ],
            predicate: (r, v) => r.status === v,
          },
        ]}
        empty={
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title="No proposals"
            body="When a member suggests a change to their plan, it lands here."
          />
        }
      />
      <ProposalModal
        proposal={active}
        onClose={() => setActive(null)}
        onOpenPlan={(id) => {
          setActive(null);
          onOpen(id);
        }}
      />
    </>
  );
}

function ProposalModal({
  proposal,
  onClose,
  onOpenPlan,
}: {
  proposal: ProposalRow | null;
  onClose: () => void;
  onOpenPlan: (userId: string) => void;
}) {
  const reply = useReplyProposal();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'accepted' | 'declined' | 'replied' | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (proposal && shownFor !== proposal.id) {
    setShownFor(proposal.id);
    setText('');
  }
  const pending = proposal?.status === 'pending';
  const send = (status: 'accepted' | 'declined' | 'replied') => {
    if (!proposal) return;
    if (status === 'replied' && text.trim().length === 0) return;
    setBusy(status);
    reply.mutate(
      { id: proposal.id, body: { status, ...(text.trim() ? { reply: text.trim() } : {}) } },
      { onSuccess: onClose, onSettled: () => setBusy(null) },
    );
  };
  return (
    <Modal
      open={!!proposal}
      onClose={onClose}
      eyebrow="Plan proposal"
      title={proposal?.person.name ?? 'Proposal'}
      width={520}
    >
      {proposal && (
        <form
          className="flex flex-col gap-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            send('replied');
          }}
        >
          <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
            <span>Sent {fmtDateTime(proposal.createdAt)}</span>
            <StatusPill status={proposal.status} />
          </div>
          <blockquote className="m-0 whitespace-pre-wrap rounded-[14px] bg-white/80 p-3.5 text-[14px] leading-relaxed">
            {proposal.text}
          </blockquote>
          {proposal.adminReply && (
            <div className="rounded-[14px] bg-accent-tint/40 p-3 text-[13px] leading-relaxed">
              <span className="font-semibold">Your reply:</span> {proposal.adminReply}
            </div>
          )}
          <Field
            label={pending ? 'Reply (optional for accept/decline)' : 'Send another reply'}
            hint={`${text.length}/500`}
          >
            <Textarea
              data-autofocus
              rows={3}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Good idea. I’ve swapped one gym day for a swim."
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="link" onClick={() => onOpenPlan(proposal.person.id)}>
              Edit their plan
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="secondary"
                loading={busy === 'replied'}
                disabled={!!busy || text.trim().length === 0}
              >
                Reply only
              </Button>
              {pending && (
                <>
                  <Button
                    variant="danger"
                    loading={busy === 'declined'}
                    disabled={!!busy}
                    onClick={() => send('declined')}
                  >
                    Decline
                  </Button>
                  <Button
                    loading={busy === 'accepted'}
                    disabled={!!busy}
                    onClick={() => send('accepted')}
                  >
                    Accept
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ───────── Rest weeks ───────── */

export function RestWeeksPanel() {
  const q = usePlanRestWeeks();
  const decide = useDecideRestWeek();
  const rows = useMemo(
    () =>
      q.data
        ? [...q.data].sort(
            (a, b) =>
              Number(b.status === 'pending') - Number(a.status === 'pending') ||
              b.weekStart.localeCompare(a.weekStart),
          )
        : undefined,
    [q.data],
  );
  const columns: Column<RestWeekRow>[] = [
    {
      id: 'person',
      header: 'Member',
      width: 'minmax(170px,1fr)',
      sortValue: (r) => r.person.name,
      cell: (r) => <PersonCell person={r.person} size={28} />,
    },
    {
      id: 'week',
      header: 'Week of',
      width: '130px',
      sortValue: (r) => r.weekStart,
      cell: (r) => <span className="text-[13px]">{fmtDate(r.weekStart, { weekday: true })}</span>,
    },
    {
      id: 'reason',
      header: 'Reason',
      width: 'minmax(180px,2fr)',
      cell: (r) => <span className="line-clamp-2 text-[13px] text-muted">{r.reason || '—'}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      width: '100px',
      sortValue: (r) => r.status,
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      id: 'act',
      header: '',
      width: '140px',
      align: 'end',
      cell: (r) =>
        r.status === 'pending' ? (
          <div className="flex justify-end gap-1">
            <RowAction
              onClick={() => decide.mutate({ id: r.id, status: 'approved' })}
              disabled={decide.isPending}
            >
              Approve
            </RowAction>
            <RowAction
              tone="ink"
              onClick={() => decide.mutate({ id: r.id, status: 'declined' })}
              disabled={decide.isPending}
            >
              Decline
            </RowAction>
          </div>
        ) : null,
    },
  ];
  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <DataTable
        label="Rest weeks"
        columns={columns}
        rows={rows}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => r.id}
        minWidth={640}
        rowClassName={(r) => r.status === 'pending' && 'bg-accent-tint/20'}
        search={{
          placeholder: 'Search rest weeks',
          text: (r) => `${r.person.name} ${r.reason ?? ''}`,
        }}
        filters={[
          {
            id: 'status',
            label: 'Status',
            options: [
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'declined', label: 'Declined' },
            ],
            predicate: (r, v) => r.status === v,
          },
          {
            id: 'when',
            label: 'When',
            options: [
              { value: '', label: 'Any week' },
              { value: 'upcoming', label: 'This week onwards' },
              { value: 'past', label: 'Past weeks' },
            ],
            predicate: (r, v) =>
              v === 'upcoming'
                ? r.weekStart >= weekStartOf(todayLocal())
                : r.weekStart < weekStartOf(todayLocal()),
          },
        ]}
        empty={
          <EmptyState
            icon={<CalendarOff className="h-5 w-5" />}
            title="No rest weeks"
            body="Members can ask for a rest week from their plan screen, or you can set one here."
          />
        }
      />
      <SetRestWeekCard />
    </div>
  );
}

function SetRestWeekCard() {
  const set = useSetRestWeek();
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(() => weekStartOf(todayLocal(7)));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const monday = date ? weekStartOf(date) : '';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AdminRestWeekRequest.safeParse({
      userId,
      weekStart: monday,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? 'form');
        errs[k] ??=
          k === 'userId'
            ? 'Choose a member'
            : k === 'weekStart'
              ? 'Pick a week'
              : k === 'reason'
                ? 'Keep it under 200 characters'
                : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    set.mutate(parsed.data, {
      onSuccess: () => {
        setUserId('');
        setReason('');
      },
    });
  };
  return (
    <Card>
      <CardHeader title="Set a rest week" />
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        The member’s plan pauses for that week, and streaks and ranking skip it.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Member" required error={errors.userId}>
          <MemberSelect value={userId} onChange={(id) => setUserId(id)} />
        </Field>
        <FormGrid min={160}>
          <Field
            label="Week starting"
            required
            hint={
              monday && monday !== date
                ? `Starts Monday ${fmtDate(monday)}`
                : 'Weeks start on Monday'
            }
            error={errors.weekStart}
          >
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              invalid={!!errors.weekStart}
            />
          </Field>
        </FormGrid>
        <Field label="Reason" hint={`Optional. ${reason.length}/200`} error={errors.reason}>
          <Textarea
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Travelling for a wedding"
          />
        </Field>
        <Button type="submit" loading={set.isPending} className="self-start">
          Set rest week
        </Button>
      </form>
    </Card>
  );
}
