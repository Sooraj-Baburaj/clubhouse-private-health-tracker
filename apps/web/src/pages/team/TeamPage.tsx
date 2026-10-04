import { CircleHelp } from 'lucide-react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useState } from 'react';
import { addDays, weekdayOf } from '@clubhouse/domain';
import { useScrollTopOnReselect } from '@/app/pane';
import { useBoard } from '@/features/board';
import { useMeData } from '@/features/me';
import { memberNow } from '@/features/summary';
import { useTeamSummary } from '@/features/team';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { CrewToday } from '@/ui/organisms/team/CrewToday';
import { Leaderboard, type BoardView } from '@/ui/organisms/team/Leaderboard';
import { MemberCardSheet } from '@/ui/organisms/team/MemberCardSheet';
import { PointsSheet } from '@/ui/organisms/team/PointsSheet';
import { TeamStreakCard } from '@/ui/organisms/team/TeamStreakCard';
import { AwardsStrip, LastWeekSheet, WeekResultsCard } from '@/ui/organisms/team/WeekResults';
import { YourWeekCard } from '@/ui/organisms/team/YourWeekCard';
import { useListMotion } from '@/ui/organisms/today/motion';

const DISMISS_KEY = (week: string) => `ch:week-results-seen:${week}`;
const readDismissed = (week: string) => {
  try {
    return localStorage.getItem(DISMISS_KEY(week)) === '1';
  } catch {
    return false;
  }
};

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true" aria-label="Loading the board">
      <Skeleton h={200} r={36} />
      <div className="flex flex-col gap-3.5 rounded-[32px] bg-surface p-4">
        <Skeleton h={44} w="62%" r={999} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton h={36} w={36} r={999} />
            <Skeleton h={14} w="auto" r={999} className="flex-1" />
            <Skeleton h={14} w={40} r={999} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Team tab: your week, the crew leaderboard (design 5a, podium), last week's awards, Crew today and the team streak.
 * Chat is one tap away on the pill (rendered by the app shell so it floats above the tab bar).
 */
export function TeamPage() {
  const me = useMeData();
  useScrollTopOnReselect('team');
  const boardOn = me.team.featureFlags.leaderboard;
  const board = useBoard(undefined);
  const team = useTeamSummary();
  const [view, setView] = useState<BoardView>('week');
  const [card, setCard] = useState<{ id: string; week?: string } | null>(null);
  const [points, setPoints] = useState(false);
  const [lastWeek, setLastWeek] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const m = useListMotion(0.05);
  const b = board.data;
  const today = memberNow(me).date;

  // Monday's results card: the week just closed, on Monday and Tuesday, until dismissed.
  const results = b?.enabled && b.lastWeek && b.week.isCurrent && b.lastWeek.weekStart === addDays(b.week.start, -7) && weekdayOf(today) <= 1 ? b.lastWeek : null;
  const showResults = !!results && !dismissed[results.weekStart] && !readDismissed(results.weekStart);
  const dismissResults = () => {
    if (!results) return;
    try {
      localStorage.setItem(DISMISS_KEY(results.weekStart), '1');
    } catch {
      /* private mode: dismissed for this visit only */
    }
    setDismissed((d) => ({ ...d, [results.weekStart]: true }));
  };
  const memberCount = team.data?.members.length ?? me.team.memberCount;
  const sub = [`${memberCount} member${memberCount === 1 ? '' : 's'}`, b?.enabled ? `Week ${b.week.number}` : null].filter(Boolean).join(' · ');

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-4 px-5 pb-24 pt-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate font-heading text-[24px] leading-[1.15]">{me.team.name}</h1>
            <span className="text-[13px] text-neutral-700">{sub}</span>
          </div>
          {boardOn && (
            <IconButton label="How points work" onClick={() => setPoints(true)}>
              <CircleHelp className="h-[18px] w-[18px]" strokeWidth={2.75} />
            </IconButton>
          )}
        </div>

        <AnimatePresence initial={false}>{showResults && results && <WeekResultsCard key={results.weekStart} results={results} onDismiss={dismissResults} />}</AnimatePresence>

        {boardOn && !b && (board.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-[32px] bg-surface p-[22px]">
            <span className="font-heading text-[22px]">Couldn’t load the board</span>
            <span className="text-[14px] leading-normal text-neutral-700">Your logs are safe. Check your connection and give it another go.</span>
            <Button className="mt-1.5" onClick={() => void board.refetch()} loading={board.isFetching}>
              Try again
            </Button>
          </div>
        ) : (
          <BoardSkeleton />
        ))}

        {b && !b.enabled && (
          <div className="flex flex-col gap-1.5 rounded-[32px] bg-accent-2-200 px-5 py-[18px] text-accent-2-900">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-accent-2-800">Leaderboard is off</span>
            <span className="text-[15px] leading-normal">{b.offBy ?? 'Your admin'} turned off points for {me.team.name}. Crew, streaks and chat carry on as usual.</span>
          </div>
        )}

        {b?.enabled && (
          <motion.div variants={m.container} initial="hidden" animate="show" className="flex flex-col gap-4">
            <motion.div variants={m.item}>
              <YourWeekCard board={b} />
            </motion.div>
            <motion.div variants={m.item}>
              <Leaderboard board={b} view={view} onView={setView} stale={board.dataUpdatedAt || null} onOpenMember={(id) => setCard({ id })} onLastWeek={() => setLastWeek(true)} onPoints={() => setPoints(true)} />
            </motion.div>
            {b.lastWeek && !showResults && (
              <motion.div variants={m.item}>
                <AwardsStrip results={b.lastWeek} />
              </motion.div>
            )}
          </motion.div>
        )}

        <CrewToday q={team} />
        {team.data && <TeamStreakCard d={team.data} />}
      </div>
      <PointsSheet open={points} onClose={() => setPoints(false)} rules={b?.rules ?? null} />
      <MemberCardSheet memberId={card?.id ?? null} week={card?.week} onClose={() => setCard(null)} />
      <LastWeekSheet
        open={lastWeek}
        results={b?.lastWeek ?? null}
        onClose={() => setLastWeek(false)}
        onOpenMember={(id) => {
          setLastWeek(false);
          setCard({ id, week: b?.lastWeek?.weekStart });
        }}
      />
    </MotionConfig>
  );
}
