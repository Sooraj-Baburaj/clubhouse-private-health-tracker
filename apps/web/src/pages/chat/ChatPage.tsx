import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { addDays } from '@clubhouse/domain';
import type { ChatMessageDto, SendMessageRequest } from '@clubhouse/contracts';
import { toast, useDocumentVisible, useInterval } from '@clubhouse/ui';
import { usePaneRef } from '@/app/pane';
import {
  buildPending,
  sendPresence,
  useChatFeed,
  useChatMembers,
  useChatStore,
  useDeleteMessage,
  useLoadOlder,
  useMarkChatRead,
  useReact,
  useReportMessage,
  useSendMessage,
  type DraftAttachment,
} from '@/features/chat';
import { dateLabel, fmt, SLOT_LABEL } from '@/features/format';
import { useMeData } from '@/features/me';
import { useTeamSummary } from '@/features/team';
import { useToday } from '@/features/today';
import { trimWindow } from '@/infrastructure/cache/chatHistory';
import { outbox } from '@/infrastructure/outbox';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Spinner } from '@/ui/atoms/Spinner';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { AttachSheet } from '@/ui/organisms/chat/AttachSheet';
import { ChatHeader, PinnedBanner } from '@/ui/organisms/chat/ChatHeader';
import { Composer } from '@/ui/organisms/chat/Composer';
import { MessageActionsSheet } from '@/ui/organisms/chat/MessageActionsSheet';
import { ReactionsSheet } from '@/ui/organisms/chat/ReactionsSheet';
import { DaySeparator, DividerRow, MessageItem, PendingItem, UnreadMarker, type MessageCtx } from '@/ui/organisms/chat/MessageItem';
import { ErrorCard } from '@/ui/organisms/progress/Kit';

const GROUP_MS = 5 * 60_000;

/** Team chat (plan §8.12), a layer over the Team tab: one team channel, newest at the bottom, offline-capable sends. */
export function ChatPage({ onBack }: { onBack?: () => void }) {
  const me = useMeData();
  const location = useLocation();
  const active = location.pathname === '/chat';
  const visible = useDocumentVisible();
  const search = useSearch({ strict: false }) as { seq?: number; tag?: string };
  const navigate = useNavigate();
  const paneRef = usePaneRef();
  const feed = useChatFeed();
  const members = useChatMembers();
  const team = useTeamSummary();
  const today = useToday();
  const { mutateAsync: loadOlderAsync, isPending: olderPending } = useLoadOlder();
  const { mutate: reactMutate } = useReact(me.user.displayName);
  const del = useDeleteMessage();
  const report = useReportMessage();
  const { mutate: markReadMutate } = useMarkChatRead();
  const send = useSendMessage();
  const pendingStore = useChatStore((s) => s.pending);
  const dropPending = useChatStore((s) => s.dropPending);
  const box = useSyncExternalStore(outbox.subscribe, outbox.get, outbox.get);

  const [actionsFor, setActionsFor] = useState<ChatMessageDto | null>(null);
  const [reactionsFor, setReactionsFor] = useState<{ id: string; emoji: string | null } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const atBottom = useRef(true);
  // Stuck to the newest message: kept until the user scrolls up, so late layout (images, fonts, the keyboard) can't
  // leave the view a few messages short of the bottom.
  const pinned = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const restore = useRef<{ h: number; top: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);
  const lastSeq = useRef(0);
  const loadingOlder = useRef(false);
  const lastMarked = useRef(0);
  const handledSeq = useRef<number | null>(null);

  const d = feed.data;
  const feedRef = useRef(d);
  useLayoutEffect(() => {
    feedRef.current = d;
  }, [d]);
  const messages = useMemo(() => d?.messages ?? [], [d]);
  const ids = useMemo(() => new Set(messages.map((m) => m.id)), [messages]);
  const usernames = useMemo(() => new Set((members.data ?? []).map((m) => m.username.toLowerCase())), [members.data]);
  const el = useCallback(() => paneRef?.current ?? null, [paneRef]);

  // Drop optimistic bubbles once the server copy is in the feed.
  useEffect(() => {
    const done = pendingStore.filter((p) => ids.has(p.id)).map((p) => p.id);
    if (done.length) dropPending(done);
  }, [ids, pendingStore, dropPending]);

  // Unread marker anchor: captured when the tab opens, so it doesn't jump while reading (adjust state during render).
  if (!active) {
    if (anchor !== null) setAnchor(null);
  } else if (d && anchor === null) setAnchor(d.lastReadSeq);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const e = el();
      if (!e) return;
      pinned.current = true;
      e.scrollTo({ top: e.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      setNewCount(0);
    },
    [el],
  );

  const maybeRead = useCallback(() => {
    const f = feedRef.current;
    if (!active || !visible || !f || !atBottom.current) return;
    if (f.latestSeq > f.lastReadSeq && f.latestSeq > lastMarked.current) {
      lastMarked.current = f.latestSeq;
      markReadMutate(f.latestSeq);
    }
  }, [active, visible, markReadMutate]);

  useEffect(() => {
    const e = el();
    if (!e || !active) return;
    let lastTop = e.scrollTop;
    const h = () => {
      const gap = e.scrollHeight - e.scrollTop - e.clientHeight;
      // Only a scroll up lets go of the bottom: programmatic scrolls (smooth ones included) only ever move down.
      if (e.scrollTop < lastTop - 1 && gap > 2) pinned.current = false;
      else if (gap < 2) pinned.current = true;
      lastTop = e.scrollTop;
      atBottom.current = gap < 140;
      if (atBottom.current) {
        setNewCount(0);
        maybeRead();
      }
      // Back at the newest message: drop the history rendered while scrolling up (it stays cached), unless a ?seq=
      // deep link is still loading back to its target.
      if (gap < 2 && search.seq == null) trimWindow();
    };
    e.addEventListener('scroll', h, { passive: true });
    return () => e.removeEventListener('scroll', h);
  }, [el, active, maybeRead, search.seq]);

  useEffect(maybeRead, [maybeRead, d?.latestSeq, d?.lastReadSeq]);

  // Presence heartbeat while Chat is open and visible (suppresses mention pushes). No typing indicators.
  useEffect(() => {
    if (active && visible) void sendPresence();
  }, [active, visible]);
  useInterval(() => void sendPresence(), active && visible ? 30_000 : null);

  // Keep the reading position when older messages are prepended.
  const oldest = messages[0]?.seq;
  useLayoutEffect(() => {
    const e = el();
    if (restore.current && e) {
      e.scrollTop = e.scrollHeight - restore.current.h + restore.current.top;
      restore.current = null;
    }
  }, [oldest, el]);

  // Follow new messages when near the bottom, else count them in the "new messages" pill.
  const latest = messages[messages.length - 1]?.seq ?? 0;
  useLayoutEffect(() => {
    const e = el();
    if (!e || !d || !didInit.current) return;
    if (latest > lastSeq.current) {
      const fresh = messages.filter((m) => m.seq > lastSeq.current);
      lastSeq.current = latest;
      if (atBottom.current || pinned.current || fresh.some((m) => m.mine)) requestAnimationFrame(() => scrollToBottom(true));
      else setNewCount((c) => c + fresh.filter((m) => !m.mine && m.kind !== 'divider').length);
    }
  }, [latest, d, el, messages, scrollToBottom, search.seq]);

  // First paint: jump to the newest (in an effect, so the pane's ref is attached).
  useEffect(() => {
    if (didInit.current || !d) return;
    const e = el();
    if (!e) return;
    didInit.current = true;
    lastSeq.current = d.messages[d.messages.length - 1]?.seq ?? 0;
    if (search.seq == null) {
      pinned.current = true;
      e.scrollTop = e.scrollHeight;
      requestAnimationFrame(() => (e.scrollTop = e.scrollHeight));
    } else pinned.current = atBottom.current = false;
  }, [d, el, search.seq]);

  // While pinned, stay on the newest message as content settles after the first jump (lazy images and memes loading,
  // the composer growing) and as the pane resizes (keyboard opening).
  useEffect(() => {
    const e = el();
    const r = rootRef.current;
    if (!e || !r) return;
    const ro = new ResizeObserver(() => {
      if (didInit.current && pinned.current) e.scrollTop = e.scrollHeight;
    });
    ro.observe(r);
    ro.observe(e);
    return () => ro.disconnect();
  }, [el]);

  const older = useCallback(async () => {
    const e = el();
    const f = feedRef.current;
    if (!e || loadingOlder.current || !f?.hasMoreBefore || !didInit.current) return;
    loadingOlder.current = true;
    restore.current = { h: e.scrollHeight, top: e.scrollTop };
    try {
      const n = await loadOlderAsync();
      if (!n) restore.current = null;
    } catch {
      restore.current = null;
    } finally {
      loadingOlder.current = false;
    }
  }, [el, loadOlderAsync]);

  // Infinite scroll up (before=seq).
  useEffect(() => {
    const e = el();
    const t = topRef.current;
    if (!e || !t || !active || !d?.hasMoreBefore) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && void older(), { root: e, rootMargin: '240px 0px 0px 0px' });
    io.observe(t);
    return () => io.disconnect();
  }, [el, active, d?.hasMoreBefore, older]);

  const jumpTo = useCallback(
    (id: string) => {
      const m = feedRef.current?.messages.find((x) => x.id === id);
      if (!m) return toast.show('That message is further back — scroll up to find it');
      document.getElementById(`msg-${m.seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight(m.id);
      setTimeout(() => setHighlight((h) => (h === m.id ? null : h)), 2200);
    },
    [],
  );

  // ?seq= deep link (from a push): load back until the message is here, then scroll to it and flash it.
  useEffect(() => {
    const target = search.seq;
    if (target == null || !active || !d || handledSeq.current === target) return;
    const m = messages.find((x) => x.seq === target);
    if (m) {
      handledSeq.current = target;
      requestAnimationFrame(() => jumpTo(m.id));
    } else if (d.hasMoreBefore && (messages[0]?.seq ?? 0) > target) {
      if (!loadingOlder.current) {
        loadingOlder.current = true;
        loadOlderAsync()
          .catch(() => undefined)
          .finally(() => (loadingOlder.current = false));
      }
    } else handledSeq.current = target;
  }, [search.seq, active, d, messages, jumpTo, loadOlderAsync]);

  // ?tag=food_log:<id> | activity_log:<id> | day_card:<date> pre-tags a log in the composer ("share to chat").
  useEffect(() => {
    if (!active || !search.tag) return;
    const [kind, ref] = search.tag.split(':') as [string, string | undefined];
    const t = today.data;
    let a: DraftAttachment | null = null;
    if (kind === 'food_log' && ref) {
      const f = t?.foodLogs.find((x) => x.id === ref);
      a = { key: `food:${ref}`, input: { type: 'food_log', id: ref }, label: f ? `${f.items[0]?.name ?? SLOT_LABEL[f.mealSlot]} · ${fmt(f.totals.kcal)} kcal` : 'Food log', thumbUrl: f?.thumbUrl };
    } else if (kind === 'activity_log' && ref) {
      const x = t?.activityLogs.find((y) => y.id === ref);
      a = { key: `act:${ref}`, input: { type: 'activity_log', id: ref }, label: x ? `${x.typeName} · ${x.durationMin} min` : 'Activity' };
    } else if (kind === 'day_card') {
      const date = ref ?? me.today;
      a = { key: `day:${date}`, input: { type: 'day_card', date }, label: 'Day card' };
    }
    if (a) {
      useChatStore.getState().addAttachment(a);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot ?tag= URL command (also writes the chat store and navigates); the bump asks the composer to focus, even if it mounts later
      setFocusKey((k) => k + 1);
    }
    void navigate({ to: '/chat', search: {}, replace: true });
  }, [active, search.tag, today.data, me.today, navigate]);

  const doSend = () => {
    const s = useChatStore.getState();
    if ((!s.draft.trim() && !s.attachments.length) || d?.muted) return;
    const p = buildPending(s.draft, s.attachments, s.replyTo);
    s.resetComposer();
    send.mutate(p);
    requestAnimationFrame(() => scrollToBottom(true));
  };

  // Stable, so memoised rows only re-render when their own message changes.
  const ctx = useMemo<MessageCtx>(
    () => ({
      usernames,
      myUsername: me.user.username,
      onActions: setActionsFor,
      onToggleReaction: (m, emoji, on) => reactMutate({ id: m.id, emoji, on }),
      onShowReactions: (m, emoji) => setReactionsFor({ id: m.id, emoji }),
      onJumpTo: jumpTo,
    }),
    [usernames, me.user.username, reactMutate, jumpTo],
  );

  // Build the list with day separators, the unread marker and author grouping.
  const tz = me.profile.timezone || me.team.timezone;
  // One formatter and one pass: toLocaleDateString per call is slow enough to dominate long lists.
  const days = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return messages.map((m) => f.format(new Date(m.createdAt)));
  }, [messages, tz]);
  const dayWord = (day: string) => (day === me.today ? 'Today' : day === addDays(me.today, -1) ? 'Yesterday' : dateLabel(day, { weekday: 'short', day: 'numeric', month: 'short' }));
  const same = (i: number, j: number) => {
    const a = messages[i];
    const b = messages[j];
    return !!a && !!b && a.kind === b.kind && a.kind !== 'divider' && !a.deleted && !b.deleted && (a.author?.id ?? 'sys') === (b.author?.id ?? 'sys') && days[i] === days[j] && Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < GROUP_MS;
  };
  const rows: ReactNode[] = [];
  let prevDay = '';
  let unreadAt = -1;
  if (anchor != null) unreadAt = messages.findIndex((m) => m.seq > anchor && !m.mine && m.kind !== 'divider');
  messages.forEach((m, i) => {
    const day = days[i]!;
    const newDay = day !== prevDay;
    if (newDay) {
      rows.push(<DaySeparator key={`day-${day}`}>{dayWord(day)}</DaySeparator>);
      prevDay = day;
    }
    if (i === unreadAt) rows.push(<UnreadMarker key="unread" />);
    if (m.kind === 'divider') {
      rows.push(<DividerRow key={m.id} m={m} />);
      return;
    }
    const first = newDay || i === unreadAt || !same(i - 1, i);
    const last = i + 1 === unreadAt || !same(i, i + 1);
    rows.push(<MessageItem key={m.id} m={m} first={first} last={last} highlight={highlight === m.id} ctx={ctx} />);
  });

  const pending = pendingStore.filter((p) => !ids.has(p.id));
  const outboxOnly = box.pending.filter((o) => o.kind === 'chat' && !ids.has(o.id) && !pendingStore.some((p) => p.id === o.id));

  let body: ReactNode;
  if (!d) {
    body = feed.isError ? (
      <ErrorCard error={feed.error} onRetry={() => void feed.refetch()} what="the chat" className="mt-3" />
    ) : (
      <div className="flex flex-col gap-3 pt-3" aria-busy>
        {[0.6, 0.45, 0.7, 0.5].map((w, i) => (
          <div key={i} className={i % 2 ? 'flex justify-end' : 'flex gap-2'}>
            {!(i % 2) && <Skeleton h={28} w={28} r={999} />}
            <Skeleton h={i === 2 ? 64 : 44} w={`${w * 100}%`} r={24} />
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <>
        <div ref={topRef} className="flex min-h-8 items-center justify-center">
          {olderPending ? (
            <Spinner className="h-5 w-5 text-neutral-600" />
          ) : d.hasMoreBefore ? (
            <button type="button" onClick={() => void older()} className="min-h-9 rounded-full border-0 bg-surface px-3.5 text-[12px] font-bold">
              Load earlier messages
            </button>
          ) : messages.length ? (
            <span className="text-[11px] font-bold text-neutral-600">That’s the very beginning</span>
          ) : null}
        </div>
        {!messages.length && !pending.length && !outboxOnly.length && <EmptyState illustration="chat" title="Say hi to the crew" body="Share a meal, hype a run, or drop a meme. Tag today’s logs with the + button." className="my-auto" />}
        <div role="log" aria-label="Team chat messages" aria-live="polite" className="flex flex-col">
          {rows}
          {pending.map((p) => (
            <PendingItem
              key={p.id}
              body={p.req.body}
              labels={p.labels}
              reply={p.reply}
              status={p.status}
              error={p.error}
              onRetry={() => send.mutate(p)}
              onDiscard={() => {
                dropPending([p.id]);
                if (outbox.isPending(p.id)) void outbox.discard(`chat:${p.id}`);
              }}
            />
          ))}
          {outboxOnly.map((o) => {
            const req = o.data as SendMessageRequest;
            return (
              <PendingItem
                key={o.key}
                body={req.body}
                labels={req.attachments.map((a) => (a.type === 'food_log' ? 'Food log' : a.type === 'activity_log' ? 'Activity' : a.type === 'day_card' ? 'Day card' : a.type === 'image' ? 'Photo' : 'Meme'))}
                reply={null}
                status={o.failed ? 'failed' : 'queued'}
                error={o.lastError}
                onRetry={() => void outbox.retry(o.key)}
                onDiscard={() => void outbox.discard(o.key)}
              />
            );
          })}
        </div>
      </>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className="flex flex-col" style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px))' }}>
        <ChatHeader title={me.team.name} members={members.data?.length ?? me.team.memberCount ?? null} teamStreak={team.data?.teamStreakEnabled === false ? null : (team.data?.teamStreak ?? null)} onBack={onBack} />
        <div className="flex flex-1 flex-col justify-end gap-2 px-4 pb-3">
          {d && (
            <PinnedBanner
              pinned={d.pinned}
              onOpen={(m) => (ids.has(m.id) ? jumpTo(m.id) : void navigate({ to: '/chat', search: { seq: m.seq }, replace: true }))}
            />
          )}
          <div className="flex flex-1 flex-col justify-end">{body}</div>
        </div>
        <Composer
          members={members.data ?? []}
          myId={me.user.id}
          muted={d?.muted ?? null}
          onSend={doSend}
          onAttach={() => setAttachOpen(true)}
          newCount={newCount}
          onJumpDown={() => scrollToBottom(true)}
          focusKey={focusKey}
        />
      </div>
      <MessageActionsSheet
        m={actionsFor}
        onClose={() => setActionsFor(null)}
        actions={{
          react: (m, emoji, on) => reactMutate({ id: m.id, emoji, on }),
          reply: (m) => {
            useChatStore.getState().setReplyTo({ id: m.id, authorName: m.mine ? 'yourself' : (m.author?.name ?? 'Clubhouse'), body: m.body });
            setFocusKey((k) => k + 1);
          },
          remove: (m) => del.mutate(m.id),
          report: (m, reason) => report.mutate({ id: m.id, reason }),
          showReactions: (m) => setReactionsFor({ id: m.id, emoji: null }),
        }}
      />
      <ReactionsSheet
        request={reactionsFor}
        m={reactionsFor ? (messages.find((x) => x.id === reactionsFor.id) ?? null) : null}
        onClose={() => setReactionsFor(null)} members={members.data ?? []} myName={me.user.displayName} />
      <AttachSheet open={attachOpen} onClose={() => setAttachOpen(false)} />
    </MotionConfig>
  );
}
