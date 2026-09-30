import { motion, useReducedMotion } from 'motion/react';
import { fmtDate } from '@/lib/format';

/** 12-week done-vs-planned bars: tinted planned bar with the done bar grown inside it. */
export function WeeksChart({ weeks, height = 120 }: { weeks: { weekStart: string; done: number; planned: number }[]; height?: number }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.done, w.planned)));
  const totalDone = weeks.reduce((a, w) => a + w.done, 0);
  const totalPlanned = weeks.reduce((a, w) => a + w.planned, 0);
  const label = `Last ${weeks.length} weeks: ${totalDone} of ${totalPlanned} planned sessions done`;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div role="img" aria-label={label} className="flex items-end gap-[6px]" style={{ height }}>
        {weeks.map((w, i) => {
          const title = `Week of ${fmtDate(w.weekStart)}: ${w.done} done of ${w.planned} planned`;
          return (
            <div key={w.weekStart} title={title} className="relative flex h-full min-w-[6px] flex-1 items-end">
              <motion.div
                className="absolute inset-x-0 bottom-0 rounded-t-[4px] bg-accent-tint"
                style={{ height: `${(w.planned / max) * 100}%`, transformOrigin: 'bottom' }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.02, ease: [0.2, 0.8, 0.2, 1] }}
              />
              <motion.div
                className={w.planned > 0 && w.done >= w.planned ? 'absolute inset-x-[2px] bottom-0 rounded-t-[3px] bg-accent' : 'absolute inset-x-[2px] bottom-0 rounded-t-[3px] bg-accent/75'}
                style={{ height: `${(w.done / max) * 100}%`, transformOrigin: 'bottom' }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.45, delay: reduce ? 0 : 0.1 + i * 0.02, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted">
        <span>{weeks[0] ? fmtDate(weeks[0].weekStart) : ''}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-[2px] bg-accent" /> done
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-[2px] bg-accent-tint" /> planned
          </span>
        </span>
        <span>{weeks.length ? fmtDate(weeks[weeks.length - 1]!.weekStart) : ''}</span>
      </div>
    </div>
  );
}
