import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { Dialog } from '@clubhouse/ui';
import type { MealPhoto } from '@/features/mealDraft';
import { AIBadge } from '@/ui/atoms/Badges';
import { Spinner } from '@/ui/atoms/Spinner';

/** Design placeholder stripes for a photo frame, from tokens. */
export const STRIPES: CSSProperties = { background: 'repeating-linear-gradient(135deg, var(--color-neutral-300) 0 10px, var(--color-surface) 10px 20px)' };

function chipText(p: MealPhoto, photoAi: boolean) {
  if (p.ai) return `AI read ${p.aiCount} thing${p.aiCount === 1 ? '' : 's'}`;
  if (p.status === 'uploading' || p.status === 'local') return 'Uploading…';
  if (p.status === 'offline') return 'Waiting for a connection — it uploads by itself';
  if (p.status === 'failed') return 'The photo couldn’t attach — the meal saves without it';
  return photoAi ? 'Photo added' : 'Photo added · AI is off';
}

/** The meal's photo: what happened to it, and View / Retake / Remove on tap. */
export function PhotoCard({ photo, photoAi, onRetake, onRemove }: { photo: MealPhoto; photoAi: boolean; onRetake: () => void; onRemove: () => void }) {
  const [actions, setActions] = useState(false);
  const [viewing, setViewing] = useState(false);
  const busy = photo.status === 'uploading' || photo.status === 'local';
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setActions((a) => !a)}
        aria-expanded={actions}
        aria-label={`Meal photo: ${chipText(photo, photoAi)}. View, retake or remove`}
        className="relative h-[140px] shrink-0 overflow-hidden rounded-[28px] border-0 p-0"
        style={photo.previewUrl ? undefined : STRIPES}
      >
        {photo.previewUrl && <img src={photo.previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <span role="status" className="absolute left-3 top-3 flex max-w-[calc(100%-24px)] items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-left text-[12px] font-bold leading-snug text-text">
          {busy && <Spinner className="h-3.5 w-3.5 shrink-0" />}
          <span className={photo.status === 'failed' ? 'text-band-red-fg' : undefined}>{chipText(photo, photoAi)}</span>
          {photo.ai && <AIBadge className="shrink-0" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {actions && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex gap-2 overflow-hidden">
            {(
              [
                ['View', () => setViewing(true)],
                ['Retake', onRetake],
                ['Remove', onRemove],
              ] as const
            ).map(([label, go]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setActions(false);
                  go();
                }}
                disabled={label === 'View' && !photo.previewUrl}
                className="min-h-11 flex-1 rounded-full border border-divider bg-transparent text-[14px] font-bold text-text disabled:opacity-45"
              >
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={viewing && !!photo.previewUrl} onClose={() => setViewing(false)} label="Meal photo" className="relative overflow-hidden rounded-[28px] bg-bg" backdropClassName="bg-[rgba(10,8,6,0.75)]">
        {photo.previewUrl && <img src={photo.previewUrl} alt="Your meal" className="max-h-[80dvh] w-auto max-w-[min(92vw,520px)] object-contain" />}
        <button type="button" onClick={() => setViewing(false)} aria-label="Close photo" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border-0 bg-bg text-text">
          <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </button>
      </Dialog>
    </div>
  );
}
