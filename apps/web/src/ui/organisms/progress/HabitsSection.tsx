import { useNavigate } from '@tanstack/react-router';
import { useHabitWeek } from '@/features/habits';
import { HabitsWeekCard } from '@/ui/organisms/habits/HabitPieces';
import { CardSkeleton, SectionHead } from './Kit';

/** Progress › Habits: how many habits were kept over the last 7 days. Hidden until the member has habits. */
export function HabitsSection() {
  const navigate = useNavigate();
  const q = useHabitWeek();
  if (q.isPending) return <CardSkeleton h={170} />;
  const w = q.data;
  if (!w || (w.total === 0 && w.days.every((d) => d.total === 0))) return null;
  return (
    <>
      <SectionHead eyebrow="Habits" />
      <HabitsWeekCard week={w} onOpen={() => void navigate({ to: '/habits' })} />
    </>
  );
}
