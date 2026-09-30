import { Bar, Sparkline } from '@clubhouse/ui';
import { AnimatedNumber } from '@clubhouse/ui';
import { useConsistency } from '@/features/progress';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ErrorCard, SectionHead } from './Kit';

const PARTS = [
  { key: 'logging', label: 'Logging', hint: 'days with food logged' },
  { key: 'inBand', label: 'In range', hint: 'days inside your calorie band' },
  { key: 'plan', label: 'Plan', hint: 'activity plan sessions' },
] as const;

export function ConsistencySection() {
  const q = useConsistency();
  const d = q.data;
  if (!d) {
    return (
      <>
        <SectionHead eyebrow="Consistency" />
        {q.isError ? <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your consistency" /> : <Skeleton h={190} r={30} />}
      </>
    );
  }
  const word = d.current.word.charAt(0).toUpperCase() + d.current.word.slice(1);
  const history = d.history.slice(-12).map((h) => h.score);
  return (
    <>
      <SectionHead eyebrow="Consistency · this week" />
      <div className="flex flex-col gap-3.5 rounded-[30px] bg-surface p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-heading text-[32px] leading-none">{word}</span>
            <span className="text-[13px] text-neutral-700">
              <b className="text-[15px] text-text tabular">
                <AnimatedNumber value={d.current.score} />
              </b>{' '}
              / 100
            </span>
          </div>
          <div className="flex flex-col items-end text-accent-700">
            <Sparkline values={history} width={130} height={40} color="var(--color-accent)" label={`Consistency over the last ${history.length} weeks: ${history.join(', ')}`} />
            <span className="text-[11px] text-neutral-700">last {history.length} weeks</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {PARTS.map((p) => {
            const v = d.current.components[p.key];
            return (
              <div key={p.key} className="flex flex-col gap-1">
                <div className="flex justify-between text-[13px]">
                  <span className="font-bold">{p.label}</span>
                  <span className="text-neutral-700 tabular">{v}%</span>
                </div>
                <Bar value={v / 100} height={8} className="bg-neutral-300" fillStyle={{ background: 'var(--color-accent-2)' }} label={`${p.label}: ${v} percent of ${p.hint}`} />
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
