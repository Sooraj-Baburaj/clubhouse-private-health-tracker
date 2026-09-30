import { Scale } from 'lucide-react';
import { useState } from 'react';
import { kgToLb } from '@clubhouse/domain';
import type { ForecastDto } from '@clubhouse/contracts';
import { AnimatedNumber, Ring, useDebounced } from '@clubhouse/ui';
import { useUi } from '@/app/uiStore';
import { dateLabel, fmt, fmt1 } from '@/features/format';
import { useMeData } from '@/features/me';
import { useWeightProgress, useWhatIf, type WeightRange } from '@/features/progress';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { Segmented } from '@/ui/atoms/Segmented';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { WeightChart } from '@/ui/organisms/charts/WeightChart';
import { ErrorCard, SectionHead } from './Kit';

const RANGES: { value: WeightRange; label: string }[] = [
  { value: '4w', label: '4w' },
  { value: '3m', label: '3m' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' },
];
const RANGE_WORD: Record<WeightRange, string> = { '4w': 'last 4 weeks', '3m': 'last 3 months', '1y': 'last year', all: 'all time' };
const short = (d: string) => dateLabel(d, { day: 'numeric', month: 'short' });

export function useWeightUnits() {
  const me = useMeData();
  const imperial = me.profile.units === 'imperial';
  return { imperial, unit: imperial ? 'lb' : 'kg', show: (kg: number) => (imperial ? kgToLb(kg) : kg) };
}

export function WeightSection() {
  const me = useMeData();
  const openWeight = useUi((s) => s.openWeightSheet);
  const [range, setRange] = useState<WeightRange>('3m');
  const q = useWeightProgress(range);
  const { unit, show } = useWeightUnits();
  const d = q.data;

  const head = <SectionHead eyebrow={`Weight · ${RANGE_WORD[range]}`} right={<Segmented size="sm" label="Weight range" value={range} onChange={setRange} options={RANGES} />} />;

  if (!d) {
    return (
      <>
        {head}
        {q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your weight trend" />
        ) : (
          <>
            <Skeleton h={64} w={180} r={20} />
            <Skeleton h={200} r={32} />
            <div className="grid grid-cols-2 gap-2.5">
              <Skeleton h={96} r={28} />
              <Skeleton h={96} r={28} />
            </div>
          </>
        )}
      </>
    );
  }

  if (!d.points.length) {
    return (
      <>
        {head}
        <EmptyState
          illustration="chart"
          title="Your trend starts with one weigh-in"
          body="Step on the scale in the morning, log it here, and we’ll draw the line for you."
          action={
            <Button icon={<Scale className="h-4 w-4" strokeWidth={2.75} />} onClick={openWeight}>
              Log today’s weight
            </Button>
          }
        />
      </>
    );
  }

  const latest = d.latestKg ?? d.points[d.points.length - 1]!.kg;
  const f = d.forecast;
  const first = d.points[0]!;
  const last = d.points[d.points.length - 1]!;

  return (
    <>
      {head}
      <div className="flex items-baseline gap-2.5">
        <span className="font-heading text-[64px] leading-none tabular">
          <AnimatedNumber value={show(latest)} decimals={1} format={(n) => fmt1(n)} />
        </span>
        <span className="text-[16px] font-bold">{unit}</span>
        {d.deltaKg != null && Math.abs(d.deltaKg) >= 0.05 && (
          <span className="rounded-full bg-accent-2-200 px-2.5 py-[3px] text-[14px] font-extrabold text-accent-2-800" aria-label={`${d.deltaKg < 0 ? 'down' : 'up'} ${fmt1(Math.abs(show(d.deltaKg)))} ${unit} over the ${RANGE_WORD[range]}`}>
            {d.deltaKg < 0 ? '−' : '+'}
            {fmt1(Math.abs(show(d.deltaKg)))} {unit}
          </span>
        )}
      </div>
      <div className="rounded-[32px] bg-surface px-3 pb-2.5 pt-4">
        <WeightChart points={d.points} forecast={f.locked ? [] : f.series} goalKg={d.goalKg} goalEtaDate={f.locked ? null : (f.goalEta?.date ?? null)} show={show} unit={unit} animKey={range} />
        <div className="flex justify-between px-1.5 pt-1 text-[11px] text-neutral-700">
          <span>{short(first.date)}</span>
          <span>{short(last.date)}</span>
          {d.goalKg != null && (
            <span>
              Goal {fmt1(show(d.goalKg))} {unit}
            </span>
          )}
          {!f.locked && f.series.length > 0 && <span>{short(f.series[f.series.length - 1]!.date)}</span>}
        </div>
      </div>

      {f.locked ? (
        <ForecastLocked f={f} />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          <ForecastTile f={f} goalKg={d.goalKg} show={show} unit={unit} />
          <PaceTile weekly={f.weeklyChangeKg} show={show} unit={unit} tdee={f.tdee} />
        </div>
      )}

      <Button variant="secondary" size="lg" block icon={<Scale className="h-5 w-5" strokeWidth={2.75} />} onClick={openWeight} className="text-[16px]">
        Log today’s weight
      </Button>

      {d.narrative.text && (
        <div className="rounded-[28px] bg-text px-[18px] py-4 text-[14px] leading-[1.55] text-bg">
          {d.narrative.ai && me.ai.teamOn && <AIBadge tone="dark" className="mr-1.5" />}
          {d.narrative.text}
        </div>
      )}

      {!f.locked && d.goalKg != null && <WhatIfCard base={f} goalKg={d.goalKg} show={show} unit={unit} />}
    </>
  );
}

function ForecastLocked({ f }: { f: ForecastDto }) {
  const left = Math.max(0, 7 - f.loggedDays);
  return (
    <div className="flex items-center gap-4 rounded-[28px] bg-surface p-4">
      <Ring value={f.loggedDays / 7} size={68} stroke={9} label={`${f.loggedDays} of 7 days logged`}>
        <span className="font-heading text-[18px] tabular">{f.loggedDays}/7</span>
      </Ring>
      <div className="flex min-w-0 flex-col">
        <span className="font-heading text-[19px] leading-tight">Log 7 days to unlock your forecast</span>
        <span className="text-[13px] text-neutral-700">
          {left === 0 ? 'Crunching your first forecast…' : `${left} more day${left === 1 ? '' : 's'} of meals and we can see where you’re heading.`}
        </span>
      </div>
    </div>
  );
}

function ForecastTile({ f, goalKg, show, unit }: { f: ForecastDto; goalKg: number | null; show: (kg: number) => number; unit: string }) {
  let big: string;
  let sub: string;
  if (f.goalEta && goalKg != null) {
    big = `${fmt1(show(goalKg))} ${unit}`;
    sub = `by ${short(f.goalEta.date)} at this pace`;
  } else if (f.etaBeyondYear) {
    big = 'A year+';
    sub = 'at this pace — small tweaks add up';
  } else if (f.projectedAtGoalDate) {
    big = `${fmt1(show(f.projectedAtGoalDate.kg))} ${unit}`;
    sub = `by ${short(f.projectedAtGoalDate.date)}, your goal date`;
  } else {
    big = 'Holding';
    sub = f.sentence;
  }
  return (
    <div className="flex flex-col rounded-[28px] bg-accent p-4 text-on-accent" aria-label={`Forecast: ${big} ${sub}`}>
      <span className="text-[12px] font-bold text-on-accent-sub">At this pace</span>
      <span className="font-heading text-[24px] leading-tight">{big}</span>
      <span className="text-[12px] text-on-accent-sub">{sub}</span>
    </div>
  );
}

function PaceTile({ weekly, show, unit, tdee }: { weekly: number; show: (kg: number) => number; unit: string; tdee: number | null }) {
  const a = Math.abs(weekly);
  const word = a < 0.1 ? 'holding steady' : a <= 1 ? 'safe range' : 'on the quick side';
  const v = Math.round(Math.abs(show(weekly)) * 100) / 100;
  return (
    <div className="flex flex-col rounded-[28px] bg-surface p-4">
      <span className="text-[12px] font-bold text-neutral-700">Pace</span>
      <span className="font-heading text-[24px] leading-tight tabular">
        {weekly < 0 ? '−' : weekly > 0 ? '+' : ''}
        {v.toFixed(2)} {unit}
      </span>
      <span className="text-[12px] text-neutral-700">
        per week · {word}
        {tdee ? ` · burn ≈ ${fmt(Math.round(tdee / 10) * 10)} kcal/day` : ''}
      </span>
    </div>
  );
}

function WhatIfCard({ base, goalKg, show, unit }: { base: ForecastDto; goalKg: number; show: (kg: number) => number; unit: string }) {
  const [delta, setDelta] = useState(0);
  const debounced = useDebounced(delta, 400);
  const q = useWhatIf(debounced);
  const r = debounced === 0 ? base : q.data;
  const outcome = !r ? '…' : r.goalEta ? `${fmt1(show(goalKg))} ${unit} by ${short(r.goalEta.date)}` : r.etaBeyondYear ? 'more than a year out' : r.projectedAtGoalDate ? `${fmt1(show(r.projectedAtGoalDate.kg))} ${unit} by ${short(r.projectedAtGoalDate.date)}` : r.sentence;
  const change = delta === 0 ? 'As you are now' : `${Math.abs(delta)} kcal ${delta < 0 ? 'less' : 'more'} a day`;
  return (
    <div className="flex flex-col gap-2 rounded-[28px] bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">What if</span>
        <span className="text-[13px] font-bold tabular">{change}</span>
      </div>
      <span className="font-heading text-[20px] leading-tight" aria-live="polite">
        {q.isFetching && debounced !== 0 ? <span className="opacity-60">{outcome}</span> : outcome}
      </span>
      <input
        type="range"
        min={-200}
        max={200}
        step={25}
        value={delta}
        onChange={(e) => setDelta(Number(e.target.value))}
        aria-label="Daily calorie change"
        aria-valuetext={change}
        className="h-11 w-full cursor-pointer"
        style={{ accentColor: 'var(--color-accent)' }}
      />
      <div className="flex justify-between text-[11px] font-bold text-neutral-700">
        <span>−200 kcal</span>
        <span>0</span>
        <span>+200 kcal</span>
      </div>
    </div>
  );
}
