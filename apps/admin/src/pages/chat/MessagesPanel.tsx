import { useNavigate, useSearch } from '@tanstack/react-router';
import { Flag, MessagesSquare, Pin } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { AttachmentDto, PersonRef } from '@clubhouse/contracts';
import { useDebounced } from '@clubhouse/ui';
import {
  cleanFilters,
  useChatMessages,
  useDeleteMessage,
  usePinMessage,
  type AdminChatMessage,
} from '@/features/chat';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, fmtInt, fmtTime } from '@/lib/format';
import {
  AiChip,
  Avatar,
  Button,
  Card,
  confirmAction,
  EmptyState,
  ErrorState,
  Field,
  Input,
  MemberSelect,
  Pill,
  RowAction,
  SearchInput,
  Segmented,
  SkeletonRows,
  Toggle,
} from '@/ui';

/** Local date (YYYY-MM-DD) → ISO at the start or end of that local day. */
function dayBound(date: string, end: boolean): string | undefined {
  if (!date) return undefined;
  const d = new Date(`${date}T${end ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function attachmentSummary(list: AttachmentDto[]): string[] {
  const out: string[] = [];
  const images = list.filter((a) => a.type === 'image');
  if (images.length)
    out.push(
      `${images.length} ${images.length === 1 ? 'photo' : 'photos'}${images.some((a) => a.type === 'image' && a.expired) ? ' (expired)' : ''}`,
    );
  for (const a of list) {
    if (a.type === 'food_log')
      out.push(
        a.removed
          ? 'Food log (removed)'
          : `Food: ${a.items.slice(0, 3).join(', ') || 'log'}${a.kcal ? ` · ${fmtInt(a.kcal)} kcal` : ''}`,
      );
    else if (a.type === 'activity_log')
      out.push(
        a.removed
          ? 'Activity (removed)'
          : `Activity: ${a.typeName ?? 'log'}${a.durationMin ? ` · ${a.durationMin} min` : ''}${a.distanceKm ? ` · ${a.distanceKm} km` : ''}`,
      );
    else if (a.type === 'day_card') out.push(`Day card · ${fmtDate(a.date)}`);
    else if (a.type === 'meme') out.push(a.caption ? `Meme: “${a.caption}”` : 'Meme');
  }
  return out;
}

function aiFeature(m: AdminChatMessage): string | undefined {
  const f = m.meta.aiFeature ?? m.meta.feature;
  return typeof f === 'string' ? f : undefined;
}

/** Server-side chat search with filters in the URL (q, member), pin/delete/mute and "Load older" paging. */
export function MessagesPanel({ onMute }: { onMute: (p: PersonRef) => void }) {
  const search = useSearch({ from: '/shell/chat' });
  const navigate = useNavigate({ from: '/chat' });
  const reduce = useReducedMotion();
  const [text, setText] = useState(search.q ?? '');
  const debounced = useDebounced(text, 350);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reported, setReported] = useState(false);
  const [order, setOrder] = useState<'new' | 'old'>('new');

  // Keep the box in sync when the URL changes (back/forward), and push debounced typing to the URL.
  const [urlQ, setUrlQ] = useState(search.q);
  if (urlQ !== search.q) {
    setUrlQ(search.q);
    // Only external URL changes (back/forward, links) overwrite what's being typed.
    if ((search.q ?? '') !== debounced.trim()) setText(search.q ?? '');
  }
  useEffect(() => {
    if ((debounced.trim() || undefined) !== (search.q || undefined))
      void navigate({ search: (s) => ({ ...s, q: debounced.trim() || undefined }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filters = useMemo(
    () =>
      cleanFilters({
        q: search.q,
        userId: search.member,
        from: dayBound(from, false),
        to: dayBound(to, true),
        reported: reported ? '1' : undefined,
      }),
    [search.q, search.member, from, to, reported],
  );
  const q = useChatMessages(filters);
  const pin = usePinMessage(filters);
  const del = useDeleteMessage(filters);

  const messages = useMemo(() => {
    const all = q.data?.pages.flatMap((p) => p.messages) ?? [];
    const seen = new Set<string>();
    const uniq = all.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
    return uniq.sort((a, b) => (order === 'new' ? b.seq - a.seq : a.seq - b.seq));
  }, [q.data, order]);

  const active = !!(filters.q || filters.userId || filters.from || filters.to || filters.reported);
  const clearAll = () => {
    setText('');
    setFrom('');
    setTo('');
    setReported(false);
    void navigate({ search: (s) => ({ ...s, q: undefined, member: undefined }), replace: true });
  };

  const onDelete = async (m: AdminChatMessage) => {
    await confirmAction({
      title: 'Delete this message?',
      eyebrow: 'Team chat',
      body: 'Removed for everyone; the chat shows “removed by an admin” in its place. Attached photos are removed too. Recorded in the audit log.',
      impact: [
        `1 message from ${m.author?.name ?? 'Clubhouse'} · ${fmtDateTime(m.createdAt)}`,
        ...(m.attachments.some((a) => a.type === 'image')
          ? [`${m.attachments.filter((a) => a.type === 'image').length} photo(s)`]
          : []),
      ],
      confirmLabel: 'Delete message',
      onConfirm: () => del.mutateAsync(m.id),
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <SearchInput
          value={text}
          onChange={setText}
          placeholder="Search message text"
          label="Search messages"
          className="sm:w-[260px]"
        />
        <div className="w-full sm:w-[220px]">
          <MemberSelect
            aria-label="Filter by member"
            placeholder="Any member"
            includeInactive
            value={search.member ?? ''}
            onChange={(id) =>
              void navigate({ search: (s) => ({ ...s, member: id || undefined }), replace: true })
            }
          />
        </div>
        <Field label="From" className="w-[calc(50%-4px)] sm:w-[150px]">
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10"
          />
        </Field>
        <Field label="To" className="w-[calc(50%-4px)] sm:w-[150px]">
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="h-10"
          />
        </Field>
        <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-white px-3 text-[13px] font-semibold">
          <Toggle checked={reported} onChange={setReported} label="Reported only" />
          <span>Reported only</span>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {active && (
            <Button variant="link" size="sm" onClick={clearAll}>
              Clear filters
            </Button>
          )}
          <Segmented
            size="sm"
            label="Order"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'new', label: 'Newest' },
              { value: 'old', label: 'Oldest' },
            ]}
          />
        </div>
      </div>

      <Card padded={false} className="px-5 py-1">
        {q.isPending ? (
          <SkeletonRows rows={6} className="-mx-5" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare className="h-5 w-5" />}
            title={active ? 'No messages match' : 'Chat is quiet'}
            body={
              active
                ? 'Try different words, another member or a wider date range.'
                : 'Messages from the team show up here.'
            }
            action={
              active ? (
                <Button variant="secondary" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul aria-label="Chat messages" className="m-0 flex list-none flex-col p-0">
            {messages.map((m, i) => (
              <motion.li
                key={m.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  delay: reduce ? 0 : Math.min(i, 14) * 0.022,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
                className="border-b border-hairline last:border-b-0"
              >
                <MessageRow
                  m={m}
                  onPin={() => pin.mutate({ id: m.id, on: !m.pinned })}
                  onDelete={() => void onDelete(m)}
                  onMute={m.author && m.kind === 'user' ? () => onMute(m.author!) : undefined}
                  onFilterMember={
                    m.author
                      ? () =>
                          void navigate({
                            search: (s) => ({ ...s, member: m.author!.id }),
                            replace: true,
                          })
                      : undefined
                  }
                />
              </motion.li>
            ))}
          </ul>
        )}
      </Card>
      {messages.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          <span>
            Showing {fmtInt(messages.length)} {messages.length === 1 ? 'message' : 'messages'}
            {q.hasNextPage ? ' · older messages available' : ' · that’s everything'}
          </span>
          {q.hasNextPage && (
            <Button
              variant="secondary"
              size="sm"
              loading={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              Load older
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageRow({
  m,
  onPin,
  onDelete,
  onMute,
  onFilterMember,
}: {
  m: AdminChatMessage;
  onPin: () => void;
  onDelete: () => void;
  onMute?: () => void;
  onFilterMember?: () => void;
}) {
  const system = m.kind !== 'user';
  const name = m.author?.name ?? 'Clubhouse';
  const meta = attachmentSummary(m.attachments);
  const reactions = m.reactions.reduce((s, r) => s + r.count, 0);
  const feature = aiFeature(m);
  const removed = m.deleted;
  return (
    <article
      aria-label={`${name}, ${fmtDateTime(m.createdAt)}`}
      className={cn('flex gap-3 py-3.5', m.reports > 0 && !removed && 'relative')}
    >
      {system && !m.author ? (
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white"
        >
          CH
        </span>
      ) : (
        <Avatar person={m.author} size={32} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {onFilterMember ? (
            <button
              type="button"
              onClick={onFilterMember}
              title={`Show only ${name}`}
              className="text-[14px] font-bold hover:text-accent"
            >
              {name}
            </button>
          ) : (
            <b className="text-[14px]">{name}</b>
          )}
          <span className="text-[12px] text-muted" title={fmtDateTime(m.createdAt)}>
            {fmtDate(m.createdAt)} · {fmtTime(m.createdAt)}
          </span>
          {m.pinned && !removed && (
            <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
              <Pin aria-hidden className="h-3 w-3" /> Pinned
            </span>
          )}
          {m.aiGenerated && <AiChip feature={feature} />}
          {m.test && <Pill tone="muted">Test</Pill>}
          {system && (
            <Pill tone="muted">{m.systemKind ? m.systemKind.replace(/_/g, ' ') : 'System'}</Pill>
          )}
        </div>
        {m.replyTo && !removed && (
          <div className="border-l-2 border-hairline pl-2 text-[12px] text-muted">
            <span className="font-semibold">{m.replyTo.authorName}:</span>{' '}
            {m.replyTo.removed ? 'removed message' : m.replyTo.body}
          </div>
        )}
        {removed ? (
          <div className="text-[14px] italic text-muted">
            {m.deletedByAdmin ? 'Message removed by an admin' : 'Message deleted by the author'}
          </div>
        ) : (
          m.body && (
            <div className="whitespace-pre-wrap break-words text-[14px] leading-normal">
              {m.body}
            </div>
          )
        )}
        {!removed &&
          (meta.length > 0 || reactions > 0 || m.reports > 0 || m.flaggedKeywords.length > 0) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
              {meta.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
              {reactions > 0 && (
                <span>
                  {reactions} {reactions === 1 ? 'reaction' : 'reactions'}
                </span>
              )}
              {m.reports > 0 && (
                <Pill tone="over" icon={<Flag aria-hidden className="h-3 w-3" />}>
                  {m.reports} {m.reports === 1 ? 'report' : 'reports'}
                </Pill>
              )}
              {m.flaggedKeywords.map((k) => (
                <Pill key={k} tone="under" title="Matches a flagged keyword">
                  {k}
                </Pill>
              ))}
            </div>
          )}
      </div>
      {!removed && (
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start sm:gap-2">
          <RowAction
            tone="ink"
            onClick={onPin}
            label={m.pinned ? `Unpin message from ${name}` : `Pin message from ${name}`}
          >
            {m.pinned ? 'Unpin' : 'Pin'}
          </RowAction>
          {onMute && (
            <RowAction tone="ink" onClick={onMute} label={`Mute ${name}`}>
              Mute
            </RowAction>
          )}
          <RowAction onClick={onDelete} label={`Delete message from ${name}`}>
            Delete
          </RowAction>
        </div>
      )}
    </article>
  );
}
