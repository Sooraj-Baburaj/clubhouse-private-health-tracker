import { useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import type { BoardResponse, NextActionDto } from '@clubhouse/contracts';
import { AnimatedNumber } from '@clubhouse/ui';
import { useUi } from '@/app/uiStore';

function gapLine(me: NonNullable<BoardResponse['me']>, everyoneAtZero: boolean): string {
  if (me.status === 'away') return 'Away this week — your spot’s waiting next week.';
  if (me.status === 'new') return 'You joined this week — points count now, ranks start next week.';
  if (everyoneAtZero) return 'Everyone’s level. Your first meal logged puts you on the board.';
  if (me.status === 'hidden') return me.wouldBeRank ? `You’d be #${me.wouldBeRank}. Only you can see this.` : 'You’re hidden from the board. Only you can see this.';
  const g = me.gap;
  if (!g) return 'You’re the only one ranked so far.';
  if (g.kind === 'level') return `Level with ${g.name}`;
  return g.kind === 'behind' ? `${g.points} behind ${g.name}` : `Leading ${g.name} by ${g.points}`;
}

/**
 * "Your week" (accent hero): rank, points, the gap to the next person, points still to land tonight, and the quickest
 * next moves as chips that open the right logging screen.
 */
export function YourWeekCard({ board }: { board: BoardResponse }) {
  const navigate = useNavigate();
  const openWeight = useUi((s) => s.openWeightSheet);
  const me = board.me;
  if (!me) return null;
  const everyoneAtZero = board.rows.every((r) => r.points === 0);
  const rankText = me.status === 'away' ? 'Away' : me.status === 'new' ? 'New' : everyoneAtZero ? '–' : (me.rank ?? me.wouldBeRank) != null ? `#${me.rank ?? me.wouldBeRank}` : '–';
  const go = (a: NextActionDto) => {
    if (a.kind === 'finish' && a.logId) void navigate({ to: '/log/food', search: { edit: a.logId } });
    else if (a.kind === 'meal') void navigate({ to: '/log/food', search: { slot: a.slot } });
    else if (a.kind === 'workout') void navigate({ to: '/log/activity', search: {} });
    else openWeight();
  };
  return (
    <section aria-label="Your week" className="flex flex-col gap-3 rounded-[36px] bg-accent p-5 text-on-accent" aria-live="polite">
      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">
        Your week · Week {board.week.number}
        {me.status === 'hidden' ? ' · hidden' : ''}
      </span>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-heading text-[68px] leading-[0.9] tabular">{rankText}</span>
        <span className="font-heading text-[28px] tabular">
          <AnimatedNumber value={me.points} /> pts
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[16px] font-extrabold">{gapLine(me, everyoneAtZero)}</span>
        {me.pending > 0 && <span className="text-[13px] font-semibold text-on-accent-sub">+{me.pending} more tonight if you stay on track</span>}
      </div>
      {me.nextActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {me.nextActions.map((a) => (
            <motion.button
              key={`${a.kind}:${a.slot ?? ''}`}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => go(a)}
              aria-label={`${a.label}, plus ${a.points} points`}
              className="flex min-h-11 items-center gap-2 rounded-full bg-bg px-4 text-[14px] font-bold text-text"
            >
              {a.label}
              <span className="font-extrabold text-accent-700">+{a.points}</span>
            </motion.button>
          ))}
        </div>
      )}
    </section>
  );
}
