import { ArrowDown, Plus, Send, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ChatMemberDto } from '@clubhouse/contracts';
import { useChatStore } from '@/features/chat';
import { Avatar } from '@/ui/atoms/Avatar';
import { IconButton } from '@/ui/atoms/IconButton';
import { cn } from '@/lib/cn';

const MENTION = /(?:^|\s)@([\w.]{0,30})$/;

/** The chat is a full-screen layer with no tab bar: the composer docks on the home-indicator inset. */
const DOCK_PADDING = 'max(env(safe-area-inset-bottom, 0px), 14px)';

export interface ComposerProps {
  members: ChatMemberDto[];
  myId: string;
  muted: { until: string; reason: string } | null;
  onSend: () => void;
  onAttach: () => void;
  newCount: number;
  onJumpDown: () => void;
  focusKey: number;
}

/** Composer: auto-growing text, "+" attach, @mention autocomplete, reply preview and tag pills (APP-CHAT-03/08). */
export function Composer({ members, myId, muted, onSend, onAttach, newCount, onJumpDown, focusKey }: ComposerProps) {
  const { draft, setDraft, attachments, removeAttachment, replyTo, setReplyTo } = useChatStore();
  const ta = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft]);
  useEffect(() => {
    if (focusKey) ta.current?.focus();
  }, [focusKey]);

  const match = MENTION.exec(draft.slice(0, caret));
  const query = match ? match[1]!.toLowerCase() : null;
  const suggestions = useMemo(
    () => (query === null || query === dismissed ? [] : members.filter((m) => m.id !== myId && (m.username.toLowerCase().startsWith(query) || m.name.toLowerCase().includes(query))).slice(0, 5)),
    [query, dismissed, members, myId],
  );
  // Reset the highlighted suggestion when the @query changes (adjust state during render).
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActive(0);
  }

  const pick = (m: ChatMemberDto) => {
    const before = draft.slice(0, caret).replace(/@([\w.]{0,30})$/, `@${m.username} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[active]!);
        return;
      }
      if (e.key === 'Escape') {
        setDismissed(query);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      onSend();
    }
  };

  const canSend = draft.trim().length > 0 || attachments.length > 0;
  const pad = { bottom: 0, paddingBottom: DOCK_PADDING };

  if (muted) {
    return (
      <div className="sticky bottom-0 z-10 bg-bg px-3.5 pt-2.5" style={pad}>
        <div role="status" className="rounded-[24px] bg-surface px-4 py-3 text-[13px] text-neutral-700">
          <b className="text-text">You’re muted until {new Date(muted.until).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.</b> {muted.reason}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-bg px-3.5 pt-2.5" style={pad}>
      <AnimatePresence>
        {newCount > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            onClick={onJumpDown}
            className="absolute -top-12 left-1/2 flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full border-0 bg-text px-4 text-[13px] font-bold text-bg shadow-md"
          >
            <ArrowDown aria-hidden className="h-4 w-4" strokeWidth={2.75} />
            {newCount} new message{newCount === 1 ? '' : 's'}
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.ul
            id="mention-list"
            role="listbox"
            aria-label="Mention a teammate"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-3.5 bottom-full m-0 mb-1 flex list-none flex-col rounded-[24px] bg-surface p-1 shadow-lg"
          >
            {suggestions.map((m, i) => (
              <li key={m.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m)}
                  className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-[20px] border-0 px-3 text-left', i === active ? 'bg-accent-200' : 'bg-transparent')}
                >
                  <Avatar name={m.name} initials={m.initials} url={m.avatarUrl} size={30} />
                  <span className="text-[14px] font-bold">{m.name}</span>
                  <span className="text-[12px] text-neutral-700">@{m.username}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {replyTo && (
          <motion.div key="reply" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex items-center gap-2 rounded-[18px] border-l-4 border-accent bg-surface py-1.5 pl-3 pr-1">
              <span className="flex min-w-0 flex-1 flex-col text-[12px]">
                <b>Replying to {replyTo.authorName}</b>
                <span className="truncate text-neutral-700">{replyTo.body || 'attachment'}</span>
              </span>
              <IconButton label="Cancel reply" tone="ghost" size={36} onClick={() => setReplyTo(null)}>
                <X className="h-4 w-4" strokeWidth={2.75} />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <AnimatePresence initial={false}>
            {attachments.map((a) => (
              <motion.span layout key={a.key} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-200 py-0.5 pl-1 pr-0.5 text-[12px] font-bold text-accent-800">
                {a.thumbUrl ? <img src={a.thumbUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="w-1.5" />}
                <span className="truncate">Tagging: {a.label}</span>
                <button type="button" aria-label={`Remove ${a.label}`} onClick={() => removeAttachment(a.key)} className="grid h-8 w-8 place-items-center rounded-full border-0 bg-transparent">
                  <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
      <div className="flex items-end gap-2">
        <IconButton label="Add a log, photo or meme" tone="surface" onClick={onAttach} className="mb-0.5">
          <Plus className="h-5 w-5" strokeWidth={2.75} />
        </IconButton>
        <textarea
          ref={ta}
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKey}
          placeholder="Hype the crew…"
          aria-label="Message"
          aria-autocomplete="list"
          aria-controls={suggestions.length ? 'mention-list' : undefined}
          maxLength={2000}
          className="min-h-12 min-w-0 flex-1 resize-none rounded-[24px] border border-divider bg-surface px-4 py-[11px] text-[15px] leading-[1.45] outline-none transition-colors focus:border-accent"
        />
        <motion.button
          type="button"
          aria-label="Send"
          onClick={onSend}
          disabled={!canSend}
          whileTap={{ scale: 0.9 }}
          animate={{ scale: canSend ? 1 : 0.92, opacity: canSend ? 1 : 0.5 }}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-0 bg-accent text-on-accent-fill"
        >
          <Send className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </motion.button>
      </div>
    </div>
  );
}
