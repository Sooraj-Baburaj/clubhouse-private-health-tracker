import { motion, useReducedMotion } from 'motion/react';
import type { CaloriesProgressResponse } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';
import { dateLabel, fmt } from '@/features/format';

type Day = CaloriesProgressResponse['days'][number];
type Cls = Day['cls'] | 'today';

const BAR: Record<Cls, string> = {
  in: 'bg-accent-2 border-accent-2',
  over: 'bg-accent border-accent',
  under: 'bg-neutral-100 border-neutral-500',
  today: 'bg-neutral-100 border-neutral-500 border-dashed',
  none: 'bg-transparent border-neutral-300 border-dashed',
};
const LABEL: Record<Cls, { text: string; tone: string }> = {
  in: { text: 'In', tone: 'text-accent-2-700' },
  over: { text: 'Over', tone: 'text-accent-700' },
  under: { text: 'Under', tone: 'text-neutral-700' },
  today: { text: 'Today', tone: 'text-text' },
  none: { text: '—', tone: 'text-neutral-600' },
};
const SPOKEN: Record<Cls, string> = { in: 'in range', over: 'over target', under: 'under target', today: 'today, still going', none: 'not logged' };

const clsOf = (d: Day): Cls => (d.isToday ? 'today' : !d.logged ? 'none' : d.cls);

/** Eaten per day vs the day's budget (tick line), styled in / over / under / today (APP-PROG-03). */
export function CalorieBars({ days, onSelect, height = 180 }: { days: Day[]; onSelect?: (date: string) => void; height?: number }) {
  const reduce = useReducedMotion();
  const dense = days.length > 10;
  const max = Math.max(1, ...days.map((d) => Math.max(d.eaten, d.budget ?? d.target ?? 0))) * 1.08;
  return (
    <div className="flex flex-col gap-2">
      <div className={cn('relative flex items-end', dense ? 'gap-[2px]' : 'gap-2')} style={{ height }}>
        {days.map((d, i) => {
          const c = clsOf(d);
          const h = d.logged || d.isToday ? Math.max(4, (d.eaten / max) * 100) : 6;
          const target = d.budget ?? d.target;
          const t = target ? (target / max) * 100 : null;
          const label = `${dateLabel(d.date)}: ${fmt(d.eaten)} kcal eaten${target ? ` of ${fmt(target)}` : ''}, ${SPOKEN[c]}${d.burned ? `, ${fmt(d.burned)} burned` : ''}`;
          return (
            <button
              key={d.date}
              type="button"
              aria-label={label}
              title={label}
              onClick={onSelect ? () => onSelect(d.date) : undefined}
              className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 border-0 bg-transparent p-0"
            >
              {!dense && d.logged && <span className="text-[10px] font-bold text-neutral-700 tabular">{fmt(d.eaten)}</span>}
              <motion.span
                className={cn('block w-full border-2 group-active:brightness-95', BAR[c], dense ? 'rounded-[4px] border' : 'rounded-[14px]')}
                initial={reduce ? false : { height: '0%' }}
                animate={{ height: `${h * (dense ? 1 : 0.86)}%` }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 22, delay: i * (dense ? 0.008 : 0.04) }}
              />
              {t != null && (
                <span aria-hidden className="pointer-events-none absolute inset-x-[-1px] h-0 border-t-2 border-dashed border-text opacity-60" style={{ bottom: `${t * (dense ? 1 : 0.86)}%` }} />
              )}
            </button>
          );
        })}
      </div>
      {!dense && (
        <div className="flex gap-2">
          {days.map((d) => {
            const c = clsOf(d);
            return (
              <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                <span className="text-[12px] font-bold">{dateLabel(d.date, { weekday: 'short' }).slice(0, 3)}</span>
                <span className={cn('text-[10px] font-bold', LABEL[c].tone)}>{LABEL[c].text}</span>
              </div>
            );
          })}
        </div>
      )}
      {dense && days.length > 0 && (
        <div className="flex justify-between text-[11px] text-neutral-700">
          <span>{dateLabel(days[0]!.date, { day: 'numeric', month: 'short' })}</span>
          <span>{dateLabel(days[days.length - 1]!.date, { day: 'numeric', month: 'short' })}</span>
        </div>
      )}
    </div>
  );
}

export function CalorieLegend() {
  const item = (swatch: string, text: string) => (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn('h-3 w-3 rounded-full border-2', swatch)} />
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-neutral-700">
      {item('bg-accent-2 border-accent-2', 'In range')}
      {item('bg-accent border-accent', 'Over')}
      {item('bg-neutral-100 border-neutral-500', 'Under')}
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="w-3.5 border-t-2 border-dashed border-text opacity-60" />
        Target
      </span>
    </div>
  );
}
