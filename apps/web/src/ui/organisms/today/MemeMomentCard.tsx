import { MessageCircle, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { MemeMomentDto } from '@clubhouse/contracts';
import { useMoments, useMomentActions } from '@/features/moments';
import { cn } from '@/lib/cn';
import { Tag } from '@/ui/atoms/Badges';

const TONE = { roast: { label: 'Roast', tone: 'accent' as const }, celebrate: { label: 'Celebrate', tone: 'accent2' as const }, neutral: { label: 'Moment', tone: 'neutral' as const } };

/** A private meme moment under the log that triggered it: image, caption, quick reaction, share, dismiss. */
export function MemeMomentCard({ moment }: { moment: MemeMomentDto }) {
  const { react, dismiss, share, noRoasts } = useMomentActions();
  const reactedLocally = useMoments((s) => s.reacted.includes(moment.fireId));
  const top = moment.reactions[0];
  const mine = !!top?.mine || reactedLocally;
  const count = moment.reactions.reduce((s, r) => s + r.count, 0) + (reactedLocally && !top?.mine ? 1 : 0);
  const emoji = top?.emoji ?? '🔥';
  const tone = TONE[moment.tone];
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="mt-2 overflow-hidden rounded-[26px] bg-surface"
      aria-label={`${tone.label}: ${moment.caption}`}
    >
      {moment.memeUrl && <img src={moment.memeUrl} alt={moment.caption} className="max-h-[240px] w-full object-cover" loading="lazy" />}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag tone={tone.tone}>{tone.label}</Tag>
          <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-700">{moment.triggerName}</span>
          <button
            type="button"
            onClick={() => dismiss.mutate({ moment, markRoastSeen: moment.tone === 'roast' && moment.canRoastOptOut })}
            aria-label="Dismiss this moment"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-neutral-700 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
          >
            <X className="h-4 w-4" strokeWidth={2.75} />
          </button>
        </div>
        <p className="m-0 text-[15px] font-bold leading-snug">{moment.caption}</p>
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => !mine && react.mutate(moment.fireId)}
            aria-pressed={mine}
            aria-label={`React ${emoji}${count ? `, ${count} so far` : ''}`}
            className={cn('flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-bold transition-colors', mine ? 'bg-accent text-on-accent-fill' : 'bg-bg text-text')}
          >
            <motion.span key={String(mine)} initial={mine ? { scale: 1.6 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }} aria-hidden>
              {emoji}
            </motion.span>
            {count > 0 && <span className="tabular">{count}</span>}
          </motion.button>
          <button type="button" onClick={() => share.mutate(moment.fireId)} disabled={share.isPending || share.isSuccess} className="flex min-h-10 items-center gap-1.5 rounded-full bg-bg px-3 text-[13px] font-bold disabled:opacity-60">
            <MessageCircle className="h-4 w-4" strokeWidth={2.75} aria-hidden />
            {share.isSuccess ? 'Shared' : 'Share to chat'}
          </button>
        </div>
        {moment.tone === 'roast' && moment.canRoastOptOut && (
          <button type="button" onClick={() => noRoasts(moment)} className="min-h-10 self-start text-[13px] font-bold text-accent-700 underline underline-offset-2">
            No roasts for me
          </button>
        )}
      </div>
    </motion.article>
  );
}
