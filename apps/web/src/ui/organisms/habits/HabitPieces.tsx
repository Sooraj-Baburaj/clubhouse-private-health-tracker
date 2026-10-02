import { ChevronRight, Info } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { HabitDayItem, HabitDayResponse, HabitGroup, HabitWeekResponse } from '@clubhouse/contracts';
import { habitFill } from '@clubhouse/domain';
import { cn } from '@/lib/cn';

/** Group chip colours (design HGC): Morning accent, Home sage, Self-care sage-light, Evening neutral. */
export const GROUP_TONE: Record<HabitGroup, { bg: string; fg: string }> = {
  Morning: { bg: 'var(--color-accent-200)', fg: 'var(--color-accent-800)' },
  Home: { bg: 'var(--color-accent-2-200)', fg: 'var(--color-accent-2-800)' },
  'Self-care': { bg: 'var(--color-accent-2-100)', fg: 'var(--color-accent-2-900)' },
  Evening: { bg: 'var(--color-neutral-300)', fg: 'var(--color-neutral-900)' },
};

/** "Next: Read · 8 min to go" (or "All done. Nice."): the first open habit in list order. */
export function nextLine(items: HabitDayItem[]): string {
  const nx = items.find((i) => !i.done);
  if (!nx) return items.length ? 'All done. Nice.' : 'Nothing due';
  if (nx.kind === 'count') return `Next: ${nx.name} · ${Math.max(0, nx.target - nx.value)} ${nx.unit} to go`;
  if (nx.kind === 'duration') return `Next: ${nx.name} · ${Math.max(0, nx.target - nx.value)} min to go`;
  return `Next: ${nx.name}${nx.reminderTime ? ` · ${nx.reminderTime}` : ''}`;
}

/** The status line under a tile's name: what one tap does, or what's done. */
export function tileStatus(i: HabitDayItem): string {
  const v = i.value;
  if (i.done) {
    if (i.kind === 'count') return `${v} ${i.unit} · done`;
    if (i.kind === 'duration') return `${v} min · done`;
    if (i.kind === 'scale') return `Rated ${v} · tap to change`;
    return 'Done · tap to undo';
  }
  if (i.kind === 'count') return `${v} of ${i.target} · tap +1`;
  if (i.kind === 'duration') return `${v} of ${i.target} min · tap +10`;
  if (i.kind === 'scale') return 'Tap to rate';
  if (i.week) return `${i.week.done} of ${i.week.target} this week · tap to tick`;
  return 'Tap to tick';
}

export function HabitChip({ icon, group, done, size = 36, className }: { icon: string; group: HabitGroup; done?: boolean; size?: number; className?: string }) {
  const tone = GROUP_TONE[group] ?? GROUP_TONE.Evening;
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full transition-colors duration-200', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.47), background: done ? 'var(--color-bg)' : tone.bg, color: done ? 'var(--color-text)' : tone.fg }}
    >
      {icon}
    </span>
  );
}

/**
 * 4b tap tile: one tap ticks, adds a glass, adds 10 minutes or steps the rating. The info button opens the habit.
 * `layoutId` lets a tile glide between the open grid and the Done row.
 */
export function HabitTile({ item, onTap, onInfo, disabled }: { item: HabitDayItem; onTap: () => void; onInfo: () => void; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const fill = habitFill(item.kind, item.value, item.target);
  const done = item.done;
  return (
    <motion.div
      layoutId={reduce ? undefined : `habit-tile-${item.id}`}
      layout={reduce ? false : 'position'}
      animate={done && !reduce ? { scale: [1, 1.035, 1] } : { scale: 1 }}
      transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn('relative flex min-h-[148px] flex-col gap-1.5 rounded-[30px] pb-3.5 pl-3.5 pr-3 pt-3 transition-colors duration-[250ms]', done ? 'bg-accent text-on-accent' : 'bg-surface text-text')}
    >
      <motion.button
        type="button"
        whileTap={reduce || disabled ? undefined : { scale: 0.97 }}
        onClick={onTap}
        disabled={disabled}
        aria-label={`${item.name}: ${tileStatus(item)}`}
        aria-pressed={item.kind === 'check' ? done : undefined}
        className="absolute inset-0 rounded-[30px] disabled:cursor-default"
      />
      <div className="pointer-events-none relative flex items-start justify-between">
        <HabitChip icon={item.icon} group={item.group} done={done} />
      </div>
      <button type="button" onClick={onInfo} aria-label={`${item.name} details`} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-current">
        <Info className="h-[18px] w-[18px]" strokeWidth={2.75} aria-hidden />
      </button>
      <span className="pointer-events-none relative mt-auto font-heading text-[17px] leading-[1.15]">{item.name}</span>
      <span className={cn('pointer-events-none relative text-[12px] font-semibold', done ? 'text-on-accent-sub' : 'text-neutral-700')}>
        {tileStatus(item)}
        {item.addedLate && ' · added later'}
      </span>
      <div className={cn('pointer-events-none relative h-1.5 overflow-hidden rounded-full', done ? 'bg-transparent' : 'bg-neutral-300')}>
        <div className={cn('h-full rounded-full transition-[width] duration-[350ms]', done ? 'bg-on-accent' : 'bg-accent')} style={{ width: `${fill * 100}%` }} />
      </div>
    </motion.div>
  );
}

const RING = 138.2; // 2π × 22

/** Today card: ring with done/total and the next habit. */
export function HabitsTodayCard({ day, onOpen }: { day: HabitDayResponse; onOpen: () => void }) {
  const frac = day.total ? day.done / day.total : 0;
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-[28px] bg-surface px-4 py-3.5 text-left text-text">
      <span className="relative h-14 w-14 shrink-0">
        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90" aria-hidden>
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--color-neutral-300)" strokeWidth="7" />
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--color-accent-2)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(frac * RING).toFixed(1)} ${RING}`} className="transition-[stroke-dasharray] duration-[400ms]" />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[14px] font-extrabold tabular">
          {day.done}/{day.total}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-heading text-[17px]">Habits</span>
        <span className="truncate text-[13px] text-neutral-700">{nextLine(day.items)}</span>
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.75} aria-hidden />
    </motion.button>
  );
}

/** Momentum card: the habits streak, kept apart from the logging streak. */
export function HabitsStreakCard({ current, onOpen }: { current: number; onOpen: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-[28px] bg-accent-2-200 p-4 text-left text-accent-2-900">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[12px] font-bold text-accent-2-800">Habits streak · separate from logging</span>
        <span className="font-heading text-[32px] leading-tight tabular">{current}</span>
        <span className="text-[12px] text-accent-2-800">Days with every required habit done. Weekly ones are judged on Sunday.</span>
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0" strokeWidth={2.75} aria-hidden />
    </motion.button>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dowOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return DOW[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]!;
};

/** Progress card: "5 of 7 habits kept" with a bar per day of the last week. */
export function HabitsWeekCard({ week, onOpen }: { week: HabitWeekResponse; onOpen: () => void }) {
  const last = week.days.length - 1;
  return (
    <section className="flex flex-col gap-3 rounded-[30px] bg-surface p-4" aria-label="Habits this week">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-[20px]">
          {week.kept} of {week.total} habits kept
        </h2>
        <button type="button" onClick={onOpen} className="min-h-9 rounded-full bg-accent-2-200 px-3.5 text-[13px] font-bold text-accent-2-800">
          Habits
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {week.days.map((d, i) => {
          const frac = d.total ? d.done / d.total : 0;
          return (
            <div key={d.date} className="flex flex-col items-center gap-1" title={`${dowOf(d.date)}: ${d.done} of ${d.total}`}>
              <div className="flex h-14 w-full items-end overflow-hidden rounded-[14px] bg-neutral-300">
                <div
                  className="w-full transition-[height] duration-[350ms]"
                  style={{ height: `${frac * 100}%`, background: i === last ? 'var(--color-accent)' : d.total && d.done === d.total ? 'var(--color-accent-2)' : 'var(--color-accent-2-400)' }}
                />
              </div>
              <span className="text-[11px] font-bold">{dowOf(d.date)}</span>
              <span className="text-[10px] text-neutral-700 tabular">{d.total ? `${d.done}/${d.total}` : '—'}</span>
            </div>
          );
        })}
      </div>
      <span className="text-[12px] leading-normal text-neutral-700">
        Kept = done on every scheduled day so far.{week.slipping.length ? ` Slipping: ${week.slipping.join(', ')}.` : week.total ? ' Nothing slipping. Lovely.' : ''}
      </span>
    </section>
  );
}
