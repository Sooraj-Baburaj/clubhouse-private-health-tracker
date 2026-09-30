import { cn } from '@/lib/cn';
import { WEEKDAY_LETTERS, WEEKDAY_SHORT } from '@/lib/format';

export type DayState = 'done' | 'planned' | 'none' | 'missed';

const STATE_CLS: Record<DayState, string> = {
  done: 'bg-accent text-white',
  planned: 'bg-accent-tint text-accent-dark',
  missed: 'bg-under-bg text-under-fg',
  none: 'bg-bg text-muted',
};
const STATE_WORD: Record<DayState, string> = { done: 'done', planned: 'planned', missed: 'missed', none: 'no plan' };

/** Read-only 28 px day chips (design: activity plans). Index 0 = Monday. */
export function DayChips({ days, className }: { days: { weekday: number; state: DayState }[]; className?: string }) {
  const label = days.map((d) => `${WEEKDAY_SHORT[d.weekday]} ${STATE_WORD[d.state]}`).join(', ');
  return (
    <div role="img" aria-label={label} className={cn('flex gap-1', className)}>
      {days.map((d) => (
        <span key={d.weekday} title={`${WEEKDAY_SHORT[d.weekday]}: ${STATE_WORD[d.state]}`} className={cn('grid h-7 w-7 place-items-center rounded-[8px] text-[11px] font-semibold', STATE_CLS[d.state])}>
          {WEEKDAY_LETTERS[d.weekday]}
        </span>
      ))}
    </div>
  );
}

/** Interactive day picker (toggle buttons). */
export function DayPicker({ value, onChange, label, disabled }: { value: number[]; onChange: (v: number[]) => void; label: string; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {WEEKDAY_LETTERS.map((l, i) => {
        const on = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAY_SHORT[i]}
            title={WEEKDAY_SHORT[i]}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort((a, b) => a - b))}
            className={cn('grid h-8 w-8 place-items-center rounded-[8px] text-[12px] font-semibold transition-colors disabled:opacity-50', on ? 'bg-accent text-white' : 'border border-border bg-white text-muted hover:border-accent hover:text-ink')}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
