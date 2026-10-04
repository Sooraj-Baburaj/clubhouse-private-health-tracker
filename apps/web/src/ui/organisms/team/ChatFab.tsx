import { useNavigate } from '@tanstack/react-router';
import { MessageCircle } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessageDto } from '@clubhouse/contracts';
import { useChatFeed } from '@/features/chat';

const previewText = (m: ChatMessageDto) => m.body.trim() || (m.attachments.some((a) => a.type === 'image') ? 'Photo' : m.attachments.some((a) => a.type === 'meme') ? 'Meme' : 'Shared a log');

/**
 * The Chat pill on the Team tab (bottom right, above the tab bar), with the unread count. A message that arrives while
 * you're on Team shows as a short preview bubble above it.
 */
export function ChatFab({ unread }: { unread: number }) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const feed = useChatFeed();
  const [preview, setPreview] = useState<{ who: string; text: string; key: number } | null>(null);
  const lastSeq = useRef<number | null>(null);
  const latest = feed.data?.messages.at(-1);

  useEffect(() => {
    if (!latest) return;
    // The first message seen on this visit is the baseline, not news.
    if (lastSeq.current == null || latest.seq <= lastSeq.current) {
      lastSeq.current = Math.max(lastSeq.current ?? 0, latest.seq);
      return;
    }
    lastSeq.current = latest.seq;
    if (latest.mine || latest.kind === 'divider' || latest.deleted) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a transient bubble driven by the feed changing
    setPreview({ who: latest.author?.name.split(' ')[0] ?? 'Clubhouse', text: previewText(latest), key: latest.seq });
  }, [latest]);
  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => setPreview(null), 4000);
    return () => clearTimeout(t);
  }, [preview]);

  const label = unread ? `Open team chat, ${unread} unread message${unread === 1 ? '' : 's'}` : 'Open team chat';
  return (
    <div className="pointer-events-none absolute right-4 z-20 flex flex-col items-end gap-2" style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 14px) + 90px)' }}>
      <AnimatePresence>
        {preview && (
          <motion.div
            key={preview.key}
            role="status"
            aria-live="polite"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, transition: reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 420, damping: 22 } }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.8, transition: { duration: 0.18 } }}
            style={{ transformOrigin: 'right bottom' }}
            className="max-w-[260px] rounded-[22px] rounded-br-lg bg-surface px-3.5 py-2.5 text-[14px] leading-snug text-text shadow-md"
          >
            <b>{preview.who}:</b> <span className="line-clamp-2">{preview.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => void navigate({ to: '/chat', search: {} })}
        aria-label={label}
        className="pointer-events-auto flex h-[52px] items-center gap-2 rounded-full bg-text px-4 text-[15px] font-extrabold text-bg shadow-md"
      >
        <MessageCircle aria-hidden className="h-5 w-5" strokeWidth={2.75} />
        Chat
        {unread > 0 && (
          <span aria-hidden className="grid h-6 min-w-6 place-items-center rounded-full bg-accent-2 px-[7px] text-[12px] font-extrabold text-on-accent2-fill">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </motion.button>
    </div>
  );
}
