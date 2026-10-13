import { Info } from 'lucide-react';
import { useState } from 'react';
import type { ConsistencyDto, ConsistencyPart, ConsistencyResponse } from '@clubhouse/contracts';
import { AnimatedNumber, Bar } from '@clubhouse/ui';
import { dateLabel } from '@/features/format';
import { Segmented } from '@/ui/atoms/Segmented';
import { ConsistencyChart } from './ConsistencyChart';
import { ConsistencyHowSheet } from './ConsistencyHowSheet';

type Part = NonNullable<ConsistencyDto['parts'][ConsistencyPart]>;

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

const PARTS: { key: ConsistencyPart; label: string; detail: (p: Part) => string }[] = [
  { key: 'logging', label: 'Logging', detail: (p) => `${p.done} of ${days(p.due)} logged` },
  { key: 'calories', label: 'Calories in range', detail: (p) => `${p.done} of ${days(p.due)} in range` },
  { key: 'protein', label: 'Protein', detail: (p) => `${p.done} of ${days(p.due)} on target` },
  { key: 'activity', label: 'Activity plan', detail: (p) => `${p.done} planned session${p.done === 1 ? '' : 's'} done, ${p.due - p.done || 'none'} missed` },
  { key: 'habits', label: 'Habits', detail: (p) => `${p.done} of ${p.due} kept` },
];

/** "Solid", "Building", "Rough week" — or "Rough month" over a month. */
const wordFor = (d: ConsistencyDto) => (d.word === 'rough week' ? (d.period === 'month' ? 'Rough month' : 'Rough week') : d.word ? d.word.charAt(0).toUpperCase() + d.word.slice(1) : 'Not scored yet');

function rangeLabel(d: ConsistencyDto) {
  if (d.period === 'month') return dateLabel(d.start, { month: 'long' });
  return `${dateLabel(d.start, { day: 'numeric', month: 'short' })} – ${dateLabel(d.end, { day: 'numeric', month: 'short' })}`;
}

/**
 * Consistency this week or month: the score, its five parts and the history chart. `name` is whose it is ("You" on
 * your own); the history carries the viewer's scores when it's someone else's, and the chart compares the two.
 */
export function ConsistencyCard({ data, name }: { data: ConsistencyResponse; name: string }) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [how, setHow] = useState(false);
  const cur = data[period];
  const history = period === 'week' ? data.weeks : data.months;
  const compare = history.some((p) => p.viewer !== undefined);
  const yours = compare ? history.at(-1)?.viewer : undefined;
  return (
    <div className="flex flex-col gap-4 rounded-[30px] bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          size="sm"
          label="Consistency period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
        <button type="button" onClick={() => setHow(true)} className="flex min-h-11 items-center gap-1.5 rounded-full border-0 bg-transparent px-2 text-[13px] font-bold text-text underline-offset-2 hover:underline">
          <Info aria-hidden className="h-4 w-4" strokeWidth={2.75} />
          How it works
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[12px] font-bold text-neutral-700">
            {period === 'week' ? 'This week' : 'This month'} · {rangeLabel(cur)}
          </span>
          <span className="font-heading text-[32px] leading-tight">{wordFor(cur)}</span>
          <span className="text-[13px] text-neutral-700">
            {cur.score != null ? (
              <>
                <b className="text-[15px] text-text tabular">
                  <AnimatedNumber value={cur.score} />
                </b>{' '}
                / 100
              </>
            ) : (
              'Starts counting with the first log'
            )}
          </span>
        </div>
        {compare && (
          <div className="flex flex-col items-end text-right">
            <span className="text-[12px] font-bold text-neutral-700">You</span>
            <span className="font-heading text-[22px] leading-tight tabular">{yours ?? '—'}</span>
          </div>
        )}
      </div>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {PARTS.map(({ key, label, detail }) => {
          const p = cur.parts[key];
          return (
            <li key={key} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-[13px]">
                <span className={p ? 'font-bold' : 'font-bold text-neutral-700'}>{label}</span>
                <span className="text-neutral-700 tabular">{p ? `${p.pct}%` : 'Not counted'}</span>
              </div>
              {p ? (
                <>
                  <Bar value={p.pct / 100} height={8} className="bg-neutral-300" fillStyle={{ background: 'var(--color-accent-2)' }} label={`${label}: ${p.pct} percent, ${detail(p)}`} />
                  <span className="text-[12px] text-neutral-700">{detail(p)}</span>
                </>
              ) : (
                <span className="text-[12px] text-neutral-700">{key === 'activity' ? 'No plan, or nothing due yet' : key === 'habits' ? 'No required habits, or nothing due yet' : 'Nothing due yet'}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-bold text-neutral-700">{period === 'week' ? `Last ${history.length} weeks` : `Last ${history.length} months`}</span>
        <ConsistencyChart points={history} period={period} name={name} compare={compare} />
      </div>
      <ConsistencyHowSheet open={how} onClose={() => setHow(false)} />
    </div>
  );
}
