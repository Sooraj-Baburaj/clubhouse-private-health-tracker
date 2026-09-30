import { useNavigate, useRouter } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useOnline } from '@clubhouse/ui';
import { useMeData } from '@/features/me';
import { useMarkBadgesSeen, useMomentum } from '@/features/momentum';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { BadgesGrid, DotGrid, StreakHero, StreakTiles } from '@/ui/organisms/momentum/MomentumPieces';
import { VacationCard } from '@/ui/organisms/momentum/VacationCard';
import { useListMotion } from '@/ui/organisms/today/motion';

/** APP-PROG-07: streaks that pause instead of breaking, grace days, team streak, badges and breaks. */
export function MomentumPage() {
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const online = useOnline();
  const q = useMomentum();
  const seen = useMarkBadgesSeen();
  const m = useListMotion(0.05);
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/', search: {} }));

  // Mark new badges seen once they have been on screen (their pop plays from the unseen flag).
  const marked = useRef(false);
  const hasUnseen = !!q.data?.badges.some((b) => !b.seen);
  const markSeen = seen.mutate;
  useEffect(() => {
    if (!hasUnseen || marked.current) return;
    const t = setTimeout(() => {
      marked.current = true;
      markSeen();
    }, 1200);
    return () => clearTimeout(t);
  }, [hasUnseen, markSeen]);

  const d = q.data;
  return (
    <div className="flex flex-col gap-4 px-5 pb-10 pt-2">
      <StackHeader title="Momentum" onBack={back} />
      {!d && q.isPending && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading momentum">
          <Skeleton h={180} r={36} />
          <Skeleton h={220} r={30} />
          <div className="grid grid-cols-2 gap-2.5">
            <Skeleton h={110} r={28} />
            <Skeleton h={110} r={28} />
          </div>
        </div>
      )}
      {!d && q.isError && (
        <EmptyState
          illustration="rings"
          title={online ? 'Couldn’t load your momentum' : 'You’re offline'}
          body={online ? 'Give it another go in a moment.' : 'Your streaks load when you’re back online.'}
          action={
            <Button variant="dark" onClick={() => void q.refetch()} loading={q.isFetching}>
              Try again
            </Button>
          }
        />
      )}
      {d && (
        <motion.div variants={m.container} initial="hidden" animate="show" className="flex flex-col gap-4">
          <motion.div variants={m.item}>
            <StreakHero s={d.streaks.logging} vacationUntil={d.vacation.until} />
          </motion.div>
          <motion.div variants={m.item}>
            <DotGrid s={d.streaks.logging} today={d.today} />
          </motion.div>
          <motion.div variants={m.item}>
            <StreakTiles data={d} />
          </motion.div>
          <motion.div variants={m.item}>
            <VacationCard v={d.vacation} today={d.today} />
          </motion.div>
          <motion.div variants={m.item}>
            <BadgesGrid data={d} milestones={me.team.streaks.milestones} />
          </motion.div>
          {d.streaks.logging.current === 0 && d.streaks.logging.best === 0 && (
            <motion.p variants={m.item} className="m-0 text-center text-[13px] text-neutral-700">
              Log one meal today and your first streak starts. Grace days cover the odd miss.
            </motion.p>
          )}
        </motion.div>
      )}
    </div>
  );
}
