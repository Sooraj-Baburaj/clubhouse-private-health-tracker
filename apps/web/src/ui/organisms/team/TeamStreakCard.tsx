import type { TeamSummaryResponse } from '@clubhouse/contracts';
import { AnimatedNumber } from '@clubhouse/ui';
import { RingAvatar } from './BoardPieces';

function streakLine(d: TeamSummaryResponse): string {
  const waiting = d.members.filter((m) => !m.logged);
  if (!waiting.length) return 'Everyone’s logged today — the streak grows tonight.';
  if (waiting.length === 1) return waiting[0]!.isMe ? 'Just you left to log today — keep it going.' : `Just ${waiting[0]!.person.name.split(' ')[0]} left to log today.`;
  if (waiting.length <= 3) return `${waiting.map((m) => (m.isMe ? 'you' : m.person.name.split(' ')[0])).join(', ').replace(/, ([^,]*)$/, ' and $1')} still to log today.`;
  return `${waiting.length} of you still to log today.`;
}

/** The dark team streak card: days with everyone logging, the best run, and who is still to log today. */
export function TeamStreakCard({ d }: { d: TeamSummaryResponse }) {
  if (!d.teamStreakEnabled) return null;
  return (
    <section aria-label={`Team streak: ${d.teamStreak} days together. Best together: ${d.teamStreakBest}`} className="flex flex-col gap-2.5 rounded-[32px] bg-text px-5 py-[18px] text-bg">
      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-accent-400">Team streak</span>
      <div className="flex items-baseline gap-2" aria-hidden>
        <span className="font-heading text-[48px] leading-none tabular">
          <AnimatedNumber value={d.teamStreak} />
        </span>
        <span className="font-heading text-[20px]">{d.teamStreak === 1 ? 'day together' : 'days together'}</span>
      </div>
      <span className="text-[13px] font-bold text-neutral-300">Best together: {Math.max(d.teamStreakBest, d.teamStreak)}</span>
      <div className="flex flex-wrap gap-3.5 px-1 py-1" aria-hidden>
        {d.members.slice(0, 10).map((m) => (
          <RingAvatar key={m.person.id} person={m.person} size={34} gap="var(--color-text)" ring={m.logged ? 'var(--color-accent)' : 'var(--color-neutral-600)'} tone={m.logged ? 'accent' : 'dark'} />
        ))}
      </div>
      <span className="text-[14px] leading-normal">{streakLine(d)}</span>
    </section>
  );
}
