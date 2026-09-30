import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { AnimatedNumber } from '@clubhouse/ui';
import { dateLabel, fmt, fmt1 } from '@/features/format';
import { useCaloriesProgress, type CaloriesRange } from '@/features/progress';
import { Segmented } from '@/ui/atoms/Segmented';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { StatTile } from '@/ui/molecules/StatTile';
import { CalorieBars, CalorieLegend } from '@/ui/organisms/charts/CalorieBars';
import { ErrorCard, SectionHead } from './Kit';
import { useWeightUnits } from './WeightSection';

const RANGES: { value: CaloriesRange; label: string }[] = [
  { value: '1w', label: '1w' },
  { value: '4w', label: '4w' },
  { value: '3m', label: '3m' },
];
const WORD: Record<CaloriesRange, string> = { '1w': 'This week', '4w': 'Last 4 weeks', '3m': 'Last 3 months' };

export function CaloriesSection() {
  const [range, setRange] = useState<CaloriesRange>('1w');
  const q = useCaloriesProgress(range);
  const navigate = useNavigate();
  const { unit, show } = useWeightUnits();
  const d = q.data;
  const title = !d ? ' ' : d.daysLogged === 0 ? 'Nothing logged yet' : `${d.daysInRange} of ${d.daysLogged} days in range`;
  const best = d?.days.filter((x) => x.cls === 'in' && x.logged && !x.isToday).sort((a, b) => b.burned - a.burned || b.eaten - a.eaten)[0];

  return (
    <>
      <SectionHead eyebrow={`Calories · ${WORD[range]}`} title={d ? title : undefined} right={<Segmented size="sm" label="Calorie range" value={range} onChange={setRange} options={RANGES} />} />
      {!d ? (
        q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your calories" />
        ) : (
          <>
            <Skeleton h={250} r={32} />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton h={72} r={24} />
              <Skeleton h={72} r={24} />
              <Skeleton h={72} r={24} />
            </div>
          </>
        )
      ) : (
        <>
          <div className="flex flex-col gap-2.5 rounded-[32px] bg-surface px-3.5 pb-3 pt-[18px]">
            <CalorieBars key={range} days={d.days} onSelect={(date) => void navigate({ to: '/', search: { date } })} />
          </div>
          <CalorieLegend />
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="Avg in" value={<AnimatedNumber value={d.avgIn} />} sub="kcal a day" />
            <StatTile label="Burned" value={<AnimatedNumber value={d.totalBurned} />} sub="kcal total" />
            <StatTile label="Weight" value={d.weightChangeKg == null ? '—' : `${d.weightChangeKg < 0 ? '−' : d.weightChangeKg > 0 ? '+' : ''}${fmt1(Math.abs(show(d.weightChangeKg)))}`} sub={d.weightChangeKg == null ? 'no weigh-ins' : unit} />
          </div>
          {best && (
            <div className="rounded-[28px] bg-text px-[18px] py-4 text-[14px] leading-[1.55] text-bg">
              Best day: {dateLabel(best.date, { weekday: 'long' })} — {fmt(best.eaten)} in{best.burned ? `, ${fmt(best.burned)} burned` : ''}. Tap any bar to open that day.
            </div>
          )}
        </>
      )}
    </>
  );
}
