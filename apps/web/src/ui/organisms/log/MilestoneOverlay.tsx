import confetti from 'canvas-confetti';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '@clubhouse/ui';
import { useMoments } from '@/features/moments';
import { Button } from '@/ui/atoms/Button';

/** canvas-confetti only understands hex, while palette tokens are oklch: resolve a token through a 1×1 canvas. */
function tokenHex(token: string): string | null {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!value || !ctx) return null;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return null;
  }
}

/** Milestone celebration after a save: badge pop plus a short confetti burst (skipped with reduced motion). */
export function MilestoneOverlay() {
  const current = useMoments((s) => s.celebrations[0]);
  const next = useMoments((s) => s.nextCelebration);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!current) return;
    haptic([10, 40, 10]);
    if (!reduce) {
      const colors = ['--color-accent', '--color-accent-2', '--color-accent-300', '--color-accent-2-300'].map(tokenHex).filter((c): c is string => !!c);
      void confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.45 }, ticks: 140, scalar: 0.9, colors: colors.length ? colors : undefined, disableForReducedMotion: true, zIndex: 1100 });
    }
    const t = setTimeout(next, 5000);
    return () => clearTimeout(t);
  }, [current, next, reduce]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {current && (
        <motion.div key={`${current.kind}-${current.days}`} className="fixed inset-0 z-[1050] grid place-items-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgba(10,8,6,0.55)]" onClick={next} aria-hidden />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="milestone-title"
            initial={reduce ? { opacity: 0 } : { scale: 0.7, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1, transition: reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 380, damping: 18 } }}
            exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.15 } }}
            className="relative flex w-[min(340px,100%)] flex-col items-center gap-2 rounded-[36px] bg-accent px-6 pb-6 pt-8 text-center text-on-accent"
          >
            <motion.span
              aria-hidden
              className="text-[72px] leading-none"
              initial={reduce ? false : { scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0, transition: reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 12, delay: 0.12 } }}
            >
              {current.emoji}
            </motion.span>
            <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">{current.kind === 'team' ? 'Team milestone' : 'New badge'}</div>
            <h2 id="milestone-title" className="font-heading text-[32px] leading-tight">
              {current.badge}
            </h2>
            <p className="m-0 text-[15px] font-semibold text-on-accent-sub">{current.kind === 'team' ? `${current.days} days in a row, together.` : `${current.days} days in a row. That’s momentum.`}</p>
            <Button variant="dark" className="mt-3" onClick={next} data-autofocus autoFocus>
              Keep it going
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
