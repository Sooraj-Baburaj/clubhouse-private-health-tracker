import type { BoardDayState, PersonRef } from '@clubhouse/contracts';
import { weekdayOf } from '@clubhouse/domain';
import { DAY_STATE_LABEL } from '@/features/board';
import { cn } from '@/lib/cn';

/** Day initials under a week of dots. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const dayShort = (date: string) => WEEKDAY_SHORT[weekdayOf(date)]!;

/** ● full day ◐ partial ○ nothing logged 🏖 away ◎ today · still to come — colour is never the only cue (legend + labels). */
const DOT: Record<BoardDayState, { style: React.CSSProperties; mark: string }> = {
  full: { style: { background: 'var(--color-accent)' }, mark: '' },
  partial: { style: { background: 'linear-gradient(90deg, var(--color-accent) 50%, var(--color-neutral-300) 50%)' }, mark: '' },
  none: { style: { boxShadow: 'inset 0 0 0 1.5px var(--color-neutral-500)' }, mark: '' },
  away: { style: {}, mark: '🏖' },
  today: { style: { boxShadow: 'inset 0 0 0 2px var(--color-text)' }, mark: '' },
  future: { style: { background: 'var(--color-neutral-400)', transform: 'scale(0.45)' }, mark: '' },
};

export function DayDot({ state, size = 12, className }: { state: BoardDayState; size?: number; className?: string }) {
  const d = DOT[state];
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full leading-none', className)} style={{ width: size, height: size, fontSize: Math.round(size * 0.75), ...d.style }}>
      {d.mark}
    </span>
  );
}

/** Seven dots, Monday to Sunday; the row's aria-label carries the meaning. */
export function DayDots({ days }: { days: { date: string; state: BoardDayState }[] }) {
  return (
    <span aria-hidden className="flex items-center gap-1">
      {days.map((d) => (
        <DayDot key={d.date} state={d.state} />
      ))}
    </span>
  );
}

export const daysSpoken = (days: { date: string; state: BoardDayState }[]) =>
  days
    .filter((d) => d.state !== 'future')
    .map((d) => `${dayShort(d.date)} ${DAY_STATE_LABEL[d.state]}`)
    .join(', ');

export function DotLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-neutral-700">
      {(['full', 'partial', 'none', 'away', 'today'] as const).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <DayDot state={s} size={10} />
          {s === 'full' ? 'full day' : DAY_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

/** Avatar with the design's double ring (surface gap, then a coloured ring). */
export function RingAvatar({ person, size, ring = 'transparent', gap = 'var(--color-surface)', tone = 'neutral', className }: { person: PersonRef; size: number; ring?: string; gap?: string; tone?: 'neutral' | 'accent' | 'dark'; className?: string }) {
  const fill = { neutral: 'bg-neutral-300 text-neutral-900', accent: 'bg-accent text-on-accent', dark: 'bg-neutral-800 text-neutral-100' }[tone];
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-full font-extrabold', fill, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), boxShadow: `0 0 0 2px ${gap}, 0 0 0 4px ${ring}` }}
    >
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span aria-hidden>{person.initials}</span>}
    </span>
  );
}

/** ↑2 / ↓1 / – since yesterday morning's standings. */
export function Movement({ value, className }: { value: number | null; className?: string }) {
  if (value == null) return <span className={cn('w-7 text-right text-[12px] font-extrabold text-neutral-500', className)} aria-hidden />;
  const text = value > 0 ? `↑${value}` : value < 0 ? `↓${-value}` : '–';
  return (
    <span aria-hidden className={cn('w-7 text-right text-[12px] font-extrabold', value > 0 ? 'text-band-green-fg' : value < 0 ? 'text-neutral-600' : 'text-neutral-500', className)}>
      {text}
    </span>
  );
}

export const movementSpoken = (value: number | null) => (value == null || value === 0 ? '' : value > 0 ? `, up ${value} since yesterday` : `, down ${-value} since yesterday`);

export const firstOf = (p: PersonRef) => p.name.trim().split(/\s+/)[0] ?? p.name;
export const shownName = (p: PersonRef, isMe: boolean) => (isMe ? 'You' : firstOf(p));
