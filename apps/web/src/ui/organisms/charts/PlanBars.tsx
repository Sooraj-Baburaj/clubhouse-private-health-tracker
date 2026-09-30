import { motion, useReducedMotion } from 'motion/react';
import type { ActivityProgressResponse } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';
import { dateLabel } from '@/features/format';

type Week = ActivityProgressResponse['weeks'][number];

/** Sessions per week vs the plan (dashed tick), APP-PROG-05. */
export function PlanBars({ weeks, showPlan, height = 130 }: { weeks: Week[]; showPlan: boolean; height?: number }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.sessions, showPlan ? w.planned : 0))) * 1.15;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2" style={{ height }}>
        {weeks.map((w, i) => {
          const met = showPlan && w.planned > 0 && w.sessions >= w.planned;
          const label = `Week of ${dateLabel(w.weekStart, { day: 'numeric', month: 'short' })}: ${w.sessions} session${w.sessions === 1 ? '' : 's'}${showPlan ? ` of ${w.planned} planned` : ''}, ${w.minutes} minutes`;
          return (
            <div key={w.weekStart} role="img" aria-label={label} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-bold text-neutral-700 tabular">{showPlan ? `${w.sessions}/${w.planned}` : w.sessions}</span>
              <motion.span
                className={cn('block w-full rounded-[10px]', met ? 'bg-accent-2' : w.sessions ? 'bg-accent-2-300' : 'bg-neutral-300')}
                initial={reduce ? false : { height: '0%' }}
                animate={{ height: `${Math.max(4, (w.sessions / max) * 82)}%` }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 22, delay: i * 0.04 }}
              />
              {showPlan && w.planned > 0 && <span aria-hidden className="absolute inset-x-[-2px] border-t-2 border-dashed border-text opacity-60" style={{ bottom: `${(w.planned / max) * 82}%` }} />}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {weeks.map((w, i) => (
          <span key={w.weekStart} className="min-w-0 flex-1 whitespace-nowrap text-center text-[10px] font-bold text-neutral-700">
            {weeks.length <= 6 || (weeks.length - 1 - i) % 2 === 0 ? dateLabel(w.weekStart, { day: 'numeric', month: 'short' }) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
