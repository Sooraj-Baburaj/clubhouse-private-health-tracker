import { useNavigate } from '@tanstack/react-router';
import type { MemberPointsResponse } from '@clubhouse/contracts';
import { DAY_STATE_LABEL, useMemberPoints } from '@/features/board';
import { dateLabel } from '@/features/format';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { DayDot, dayShort, RingAvatar } from './BoardPieces';

const CATEGORY: [keyof MemberPointsResponse['parts'], string][] = [
  ['meals', 'Meals'],
  ['calories', 'Calories'],
  ['protein', 'Protein'],
  ['workouts', 'Workouts'],
  ['bonus', 'Bonus'],
  ['away', 'Away'],
];

function headline(d: MemberPointsResponse) {
  if (d.status === 'away') return `Away this week · ${d.points} pts`;
  if (d.status === 'new') return `New this week · ${d.points} pts`;
  return `${d.rank != null ? `#${d.rank} · ` : ''}${d.points} pts this week`;
}

/**
 * A member's week from a board row: points per day, points per category, streak and badges — never calories, foods
 * or weight. On your own card, how each day's points were earned.
 */
export function MemberCardSheet({ memberId, week, onClose }: { memberId: string | null; week?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useMemberPoints(memberId, week);
  const d = q.data;
  const first = d?.person.name.split(' ')[0] ?? '';
  return (
    <MemberSheet open={!!memberId} onClose={onClose} label={d ? `${d.isMe ? 'Your' : `${d.person.name}’s`} week` : 'Member week'}>
      {!d ? (
        q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="their week" />
        ) : (
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton h={64} r={32} />
            <Skeleton h={96} r={26} />
            <Skeleton h={44} r={999} />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3.5 pb-2">
          <div className="flex items-center gap-3.5">
            <RingAvatar person={d.person} size={64} gap="var(--color-bg)" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-heading text-[26px] leading-tight">{d.isMe ? 'You' : d.person.name}</span>
              <span className="text-[14px] font-bold text-neutral-700">{headline(d)}</span>
            </div>
          </div>
          <ol className="m-0 grid list-none grid-cols-7 gap-1 rounded-[26px] bg-surface px-2 py-3.5" aria-label="Points by day">
            {d.days.map((day) => (
              <li key={day.date} aria-label={`${dateLabel(day.date, { weekday: 'long' })}: ${DAY_STATE_LABEL[day.state]}, ${day.points} points`} className="flex flex-col items-center gap-1.5">
                <span className="text-[11px] font-bold text-neutral-700">{dayShort(day.date)}</span>
                <DayDot state={day.state} size={26} />
                <span className="text-[12px] font-extrabold tabular">{day.state === 'future' ? '' : day.points}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY.filter(([k]) => k !== 'away' || d.parts.away > 0).map(([k, label]) => (
              <span key={k} className="flex min-h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold">
                {label}
                <span className="font-extrabold text-accent-700 tabular">{d.parts[k]}</span>
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col rounded-[24px] bg-accent-200 p-3.5 text-accent-900">
              <span className="text-[12px] font-bold text-accent-800">Logging streak</span>
              <span className="font-heading text-[26px] tabular">
                {d.streak} {d.streak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div className="flex flex-col rounded-[24px] bg-accent-2-200 p-3.5 text-accent-2-900">
              <span className="text-[12px] font-bold text-accent-2-800">Badges</span>
              <span className="font-heading text-[26px] tabular">{d.badges}</span>
            </div>
          </div>
          {d.isMe && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">How you earned it</span>
              {d.days
                .filter((day) => day.items && day.items.length > 0)
                .map((day) => (
                  <div key={day.date} className="flex flex-col gap-1 rounded-[22px] bg-surface px-3.5 py-3">
                    <div className="flex justify-between">
                      <span className="text-[14px] font-extrabold">
                        {dateLabel(day.date, { weekday: 'short', day: 'numeric' })}
                        {day.state === 'today' ? ' · today' : ''}
                      </span>
                      <span className="text-[14px] font-extrabold text-accent-700 tabular">+{day.points}</span>
                    </div>
                    <span className="text-[13px] leading-normal text-neutral-700">{day.items!.map((i) => `${i.label} +${i.points}`).join(' · ')}</span>
                  </div>
                ))}
              {d.days.some((day) => day.state === 'today') && <span className="px-1 text-[12px] text-neutral-700">Calories and protein for today land overnight.</span>}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="lg"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                onClose();
                if (d.isMe) void navigate({ to: '/', search: {} });
                else void navigate({ to: '/team/$memberId', params: { memberId: d.person.id }, search: {} });
              }}
            >
              {d.isMe ? 'Today' : 'Their day'}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                onClose();
                void navigate({ to: '/member/$memberId', params: { memberId: d.person.id } });
              }}
            >
              {d.isMe ? 'Your profile' : `${first}’s profile`}
            </Button>
          </div>
        </div>
      )}
    </MemberSheet>
  );
}
