import { ChevronDown, ChevronLeft, Pin } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { ChatMessageDto } from '@clubhouse/contracts';
import { IconButton } from '@/ui/atoms/IconButton';

export function ChatHeader({ title, members, teamStreak, onBack }: { title: string; members: number | null; teamStreak: number | null; onBack?: () => void }) {
  const sub = [members != null ? `${members} member${members === 1 ? '' : 's'}` : null, teamStreak != null ? `team streak ${teamStreak}` : null].filter(Boolean).join(' · ');
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2.5 bg-bg px-4 pb-2.5 pt-1.5">
      {onBack && (
        <IconButton label="Back to Team" onClick={onBack}>
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </IconButton>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-heading text-[22px] leading-tight">{title}</h1>
        <span className="text-[12px] text-neutral-700">{sub || ' '}</span>
      </div>
    </header>
  );
}

/** Pinned announcements (newest first); tap to jump to the message. */
export function PinnedBanner({ pinned, onOpen }: { pinned: ChatMessageDto[]; onOpen: (m: ChatMessageDto) => void }) {
  const [all, setAll] = useState(false);
  if (!pinned.length) return null;
  const list = all ? pinned : pinned.slice(0, 1);
  return (
    <div className="flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {list.map((m) => (
          <motion.button
            key={m.id}
            type="button"
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            onClick={() => onOpen(m)}
            className="flex items-start gap-2 rounded-[22px] border-0 bg-accent-200 px-3.5 py-2.5 text-left text-[13px] text-accent-800"
          >
            <Pin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
            <span className="line-clamp-3">
              <b>Pinned · {m.author?.name.split(' ')[0] ?? 'Clubhouse'}:</b> {m.body || 'Attachment'}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
      {pinned.length > 1 && (
        <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className="inline-flex min-h-8 items-center gap-1 self-start border-0 bg-transparent px-2 text-[12px] font-bold text-accent-700">
          {all ? 'Show less' : `${pinned.length - 1} more pinned`}
          <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${all ? 'rotate-180' : ''}`} strokeWidth={2.75} />
        </button>
      )}
    </div>
  );
}
