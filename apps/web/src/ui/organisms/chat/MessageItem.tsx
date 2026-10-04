import { AlertCircle, Clock, CornerUpLeft, Pin, RotateCw, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, memo, type ReactNode } from 'react';
import type { ChatMessageDto } from '@clubhouse/contracts';
import { timeOf } from '@/features/format';
import { AIBadge, Tag } from '@/ui/atoms/Badges';
import { Avatar } from '@/ui/atoms/Avatar';
import { cn } from '@/lib/cn';
import { AttachmentView } from './Attachments';
import { MessageText } from './MessageText';
import { LONG_PRESS_CLASS, useLongPress } from './useLongPress';

export interface MessageCtx {
  usernames: Set<string>;
  myUsername: string;
  onActions: (m: ChatMessageDto) => void;
  onToggleReaction: (m: ChatMessageDto, emoji: string, on: boolean) => void;
  /** Who reacted (long-press a reaction); `emoji` preselects that reaction. */
  onShowReactions: (m: ChatMessageDto, emoji: string | null) => void;
  onJumpTo: (id: string) => void;
  /** A teammate's avatar or name: their profile. */
  onOpenMember: (id: string) => void;
}

/**
 * One message: header (first of a group), bubble, reply quote, attachments, reactions (APP-CHAT-02/05/06).
 * Memoised: a feed change re-renders only the rows whose message or grouping changed, so `ctx` must be stable.
 */
export const MessageItem = memo(forwardRef<HTMLDivElement, { m: ChatMessageDto; first: boolean; last: boolean; highlight: boolean; ctx: MessageCtx }>(function MessageItem({ m, first, last, highlight, ctx }, ref) {
  const own = m.mine;
  const system = m.kind === 'system';
  const who = system ? 'Clubhouse' : own ? 'You' : (m.author?.name.split(' ')[0] ?? 'Someone');
  const meme = m.attachments.find((a) => a.type === 'meme');
  const trigger = typeof m.meta.triggerName === 'string' ? m.meta.triggerName : typeof m.meta.trigger === 'string' ? m.meta.trigger : null;
  const optedIn = typeof m.meta.optedInNote === 'string' ? m.meta.optedInNote : null;
  const lp = useLongPress(() => !m.deleted && ctx.onActions(m));
  const bubble = own ? 'bg-accent text-on-accent' : system ? 'bg-accent-200 text-accent-900' : 'bg-surface text-text';
  const spoken = `${who}, ${timeOf(m.createdAt)}: ${m.deleted ? 'message deleted' : m.body || (meme ? 'meme' : 'attachment')}`;

  return (
    <motion.div
      ref={ref}
      id={`msg-${m.seq}`}
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn('flex gap-2', own ? 'flex-row-reverse' : 'flex-row', first ? 'mt-2' : 'mt-0.5')}
    >
      {!own && (
        <span className="w-7 shrink-0 self-end">
          {last &&
            (system ? (
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-accent font-heading text-[12px] text-on-accent-fill">C</span>
            ) : (
              m.author && (
                <button type="button" onClick={() => ctx.onOpenMember(m.author!.id)} aria-label={`${m.author.name}’s profile`} className="block rounded-full border-0 bg-transparent p-0">
                  <Avatar name={m.author.name} initials={m.author.initials} url={m.author.avatarUrl} size={28} />
                </button>
              )
            ))}
        </span>
      )}
      <div className={cn('flex min-w-0 max-w-[84%] flex-col gap-1', own ? 'items-end' : 'items-start')}>
        {first && (
          <span className="flex items-center gap-1.5 px-2.5 text-[11px] font-bold text-neutral-700">
            {!own && !system && m.author ? (
              <button type="button" onClick={() => ctx.onOpenMember(m.author!.id)} className="border-0 bg-transparent p-0 font-bold text-neutral-700 underline-offset-2 hover:underline">
                {who}
              </button>
            ) : (
              who
            )}{' '}
            · {timeOf(m.createdAt)}
            {m.pinned && <Pin aria-label="Pinned" className="h-3 w-3" strokeWidth={2.75} />}
            {m.test && <Tag className="px-1.5 py-0 text-[10px]">Test</Tag>}
            {m.aiGenerated && <AIBadge />}
          </span>
        )}
        {/* The bubble is not itself a control (it contains links and buttons): touch/mouse use long-press or right-click,
            keyboard and screen readers use the "Message actions" button below. */}
        <div
          role="group"
          aria-label={spoken}
          title="Long-press for reactions and more"
          {...lp.handlers}
          className={cn(
            'flex max-w-full flex-col gap-2 rounded-[24px] px-3.5 py-2.5 transition-shadow',
            LONG_PRESS_CLASS,
            bubble,
            own ? (last ? 'rounded-br-[8px]' : '') : last ? 'rounded-bl-[8px]' : '',
            highlight && 'ring-4 ring-accent-2',
            m.deleted && 'bg-transparent text-neutral-700 ring-1 ring-divider',
          )}
        >
          {m.deleted ? (
            <span className="flex items-center gap-1.5 text-[14px] italic">
              <Trash2 aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
              {m.deletedByAdmin ? 'Removed by an admin' : 'Message deleted'}
            </span>
          ) : (
            <>
              {m.replyTo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.onJumpTo(m.replyTo!.id);
                  }}
                  className={cn('flex flex-col gap-0.5 rounded-[14px] border-l-4 px-2.5 py-1.5 text-left text-[12px]', own ? 'border-on-accent bg-[color-mix(in_srgb,var(--color-bg)_35%,transparent)]' : 'border-accent bg-bg')}
                >
                  <span className="flex items-center gap-1 font-bold">
                    <CornerUpLeft aria-hidden className="h-3 w-3" strokeWidth={2.75} />
                    {m.replyTo.authorName}
                  </span>
                  <span className="line-clamp-2 opacity-80">{m.replyTo.removed ? 'Original message removed' : m.replyTo.body}</span>
                </button>
              )}
              {meme && <AttachmentView a={meme} own={own} authorId={m.author?.id ?? null} />}
              {trigger && <span className={cn('text-[11px] font-bold', own ? 'text-on-accent-sub' : 'text-accent-700')}>Trigger: {trigger}{optedIn ? ` · ${optedIn}` : ''}</span>}
              {m.body && <MessageText body={m.body} usernames={ctx.usernames} me={ctx.myUsername} own={own} />}
              {m.attachments
                .filter((a) => a.type !== 'meme')
                .map((a, i) => (
                  <AttachmentView key={i} a={a} own={own} authorId={m.author?.id ?? null} />
                ))}
            </>
          )}
        </div>
        {!m.deleted && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Message actions — ${spoken}`}
            onClick={() => ctx.onActions(m)}
            className="sr-only rounded-full bg-surface px-3 py-1.5 text-[12px] font-bold text-text focus-visible:not-sr-only focus-visible:ring-2 focus-visible:ring-accent"
          >
            Message actions
          </button>
        )}
        {!m.deleted && (m.reactions.length > 0 || m.memeReactions.length > 0) && <Reactions m={m} onToggle={ctx.onToggleReaction} onShow={ctx.onShowReactions} />}
      </div>
    </motion.div>
  );
}));

function Reactions({ m, onToggle, onShow }: { m: ChatMessageDto; onToggle: MessageCtx['onToggleReaction']; onShow: MessageCtx['onShowReactions'] }) {
  return (
    <div className={cn('flex flex-wrap gap-1 px-1.5', m.mine && 'justify-end')}>
      <AnimatePresence initial={false} mode="popLayout">
        {m.reactions.map((r) => (
          <ReactionPill key={r.emoji} r={r} onToggle={() => onToggle(m, r.emoji, !r.mine)} onShow={() => onShow(m, r.emoji)} />
        ))}
      </AnimatePresence>
      {m.memeReactions.map((mr, i) => (mr.url ? <img key={i} src={mr.url} alt="Meme reaction" draggable={false} className="pointer-events-none h-[30px] w-[30px] select-none rounded-full object-cover" /> : null))}
    </div>
  );
}

/** Tap toggles my reaction; long-press (or right-click) shows who reacted. */
const ReactionPill = forwardRef<HTMLButtonElement, { r: ChatMessageDto['reactions'][number]; onToggle: () => void; onShow: () => void }>(function ReactionPill({ r, onToggle, onShow }, ref) {
  const lp = useLongPress(onShow);
  return (
    <motion.button
      ref={ref}
      layout
      type="button"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      {...lp.handlers}
      onClick={() => {
        if (!lp.consumed()) onToggle();
      }}
      aria-pressed={r.mine}
      aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}. ${r.mine ? 'Remove' : 'Add'} your reaction`}
      title={`${r.names.join(', ')} · long-press to see who reacted`}
      className={cn('inline-flex min-h-[30px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-bold [&_*]:pointer-events-none', LONG_PRESS_CLASS, r.mine ? 'border-accent-400 bg-accent-200 text-accent-900' : 'border-divider bg-transparent')}
    >
      <span aria-hidden>{r.emoji}</span>
      <span className="tabular">{r.count}</span>
    </motion.button>
  );
});

/** Optimistic / queued / failed own message (clock icon until the server has it). */
export function PendingItem({ body, labels, reply, status, error, onRetry, onDiscard }: { body: string; labels: string[]; reply: { authorName: string; body: string } | null; status: 'sending' | 'queued' | 'failed'; error?: string | null; onRetry: () => void; onDiscard: () => void }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-0.5 flex flex-row-reverse">
      <div className="flex max-w-[84%] flex-col items-end gap-1">
        <div className={cn('flex flex-col gap-1.5 rounded-[24px] rounded-br-[8px] bg-accent px-3.5 py-2.5 text-on-accent', status !== 'failed' && 'opacity-80')}>
          {reply && (
            <span className="rounded-[14px] border-l-4 border-on-accent px-2.5 py-1 text-[12px]">
              <b>{reply.authorName}</b> · <span className="opacity-80">{reply.body.slice(0, 80)}</span>
            </span>
          )}
          {body && <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.45]">{body}</span>}
          {labels.map((l, i) => (
            <span key={i} className="self-start rounded-full bg-bg px-2.5 py-1 text-[12px] font-bold text-text">
              {l}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 px-2 text-[11px] font-bold text-neutral-700" role="status">
          {status === 'failed' ? (
            <>
              <AlertCircle aria-hidden className="h-3.5 w-3.5 text-band-red-fg" strokeWidth={2.75} />
              {error ?? 'Couldn’t send'}
              <button type="button" onClick={onRetry} className="inline-flex min-h-8 items-center gap-1 border-0 bg-transparent px-1 font-bold text-accent-700 underline">
                <RotateCw aria-hidden className="h-3 w-3" strokeWidth={2.75} />
                Retry
              </button>
              <button type="button" onClick={onDiscard} className="min-h-8 border-0 bg-transparent px-1 font-bold text-neutral-700 underline">
                Discard
              </button>
            </>
          ) : (
            <>
              <Clock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
              {status === 'queued' ? 'Waiting for signal — sends when you’re back online' : 'Sending…'}
            </>
          )}
        </span>
      </div>
    </motion.div>
  );
}

export function DaySeparator({ children }: { children: ReactNode }) {
  return (
    <div role="separator" className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-bold text-neutral-700">{children}</span>
    </div>
  );
}

export function UnreadMarker() {
  return (
    <div role="separator" aria-label="New messages below" className="my-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-accent-2-700">
      <span className="h-0.5 flex-1 rounded-full bg-accent-2" />
      New
      <span className="h-0.5 flex-1 rounded-full bg-accent-2" />
    </div>
  );
}

export function DividerRow({ m }: { m: ChatMessageDto }) {
  return (
    <div role="separator" id={`msg-${m.seq}`} className="my-3 flex items-center gap-3 text-[12px] text-neutral-700">
      <span className="h-px flex-1 bg-divider" />
      <span className="max-w-[70%] text-center">{m.body || 'Earlier messages were cleared'}</span>
      <span className="h-px flex-1 bg-divider" />
    </div>
  );
}
