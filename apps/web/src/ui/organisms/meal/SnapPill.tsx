import { Camera } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

/**
 * The Snap pill: dark, camera icon, "Snap". It works with AI on or off (off: the photo goes on the meal and you add
 * the foods). `compact` shrinks it to a circle when a wider pill sits next to it.
 */
export function SnapPill({ onClick, compact, className }: { onClick: () => void; compact?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      layout={!reduce}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-label="Snap a photo of your meal"
      className={cn('pointer-events-auto flex h-[52px] min-w-[52px] shrink-0 items-center justify-center gap-2 rounded-full bg-text text-[15px] font-extrabold text-bg shadow-md', compact ? 'px-0' : 'pl-4 pr-5', className)}
    >
      <Camera aria-hidden className="h-5 w-5" strokeWidth={2.75} />
      {!compact && <span>Snap</span>}
    </motion.button>
  );
}
