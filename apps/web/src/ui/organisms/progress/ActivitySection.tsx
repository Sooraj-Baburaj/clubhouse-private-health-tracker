import { useNavigate } from '@tanstack/react-router';
import { Dumbbell, Trophy } from 'lucide-react';
import { AnimatedNumber } from '@clubhouse/ui';
import { dateLabel, fmt, fmt1 } from '@/features/format';
import { useActivityProgress } from '@/features/progress';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { StatTile } from '@/ui/molecules/StatTile';
import { PlanBars } from '@/ui/organisms/charts/PlanBars';
import { ErrorCard, SectionHead } from './Kit';

export function ActivitySection() {
  const q = useActivityProgress();
  const navigate = useNavigate();
  const d = q.data;
  if (!d) {
    return (
      <>
        <SectionHead eyebrow="Activity" />
        {q.isError ? <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your activity" /> : <Skeleton h={200} r={30} />}
      </>
    );
  }
  const thisWeek = d.weeks[d.weeks.length - 1];
  const any = d.weeks.some((w) => w.sessions > 0);
  const title = !thisWeek ? 'Moves' : d.hasPlan && thisWeek.planned ? `${thisWeek.sessions} of ${thisWeek.planned} sessions this week` : `${thisWeek.sessions} session${thisWeek.sessions === 1 ? '' : 's'} this week`;
  return (
    <>
      <SectionHead eyebrow="Activity" title={title} />
      {!any ? (
        <EmptyState
          illustration="rings"
          title="No sessions yet"
          body="A walk counts. Log your first one and your weeks start filling up."
          action={
            <Button icon={<Dumbbell className="h-4 w-4" strokeWidth={2.75} />} onClick={() => void navigate({ to: '/log/activity', search: {} })}>
              Log activity
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-[30px] bg-surface px-3.5 pb-3 pt-4">
            <PlanBars weeks={d.weeks} showPlan={d.hasPlan} />
            <span className="px-1 text-[12px] text-neutral-700">{d.hasPlan ? 'Bars are sessions; the dashed line is your plan.' : 'No activity plan yet — every session still counts.'}</span>
          </div>
          {thisWeek && (
            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Minutes this week" value={<AnimatedNumber value={thisWeek.minutes} />} sub="active minutes" />
              <StatTile label="Burned this week" value={<AnimatedNumber value={thisWeek.burn} />} sub="kcal" />
            </div>
          )}
        </>
      )}
      {d.records.length > 0 && (
        <ListGroup title="Personal records">
          {d.records.map((r) => (
            <ListRow
              key={r.record}
              title={
                <span className="flex items-center gap-2">
                  <Trophy aria-hidden className="h-4 w-4 text-accent-700" strokeWidth={2.75} />
                  {r.label}
                </span>
              }
              sub={dateLabel(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}
              right={
                <span className="font-heading text-[18px] tabular">
                  {Number.isInteger(r.value) ? fmt(r.value) : fmt1(r.value)} <span className="font-body text-[12px] text-neutral-700">{r.unit}</span>
                </span>
              }
            />
          ))}
        </ListGroup>
      )}
    </>
  );
}
