import { Link } from '@tanstack/react-router';
import { ChevronRight, Flame } from 'lucide-react';
import { motion } from 'motion/react';
import { useMomentumSummary } from '@/features/progress';
import { Skeleton } from '@/ui/atoms/Skeleton';

/** Momentum summary on Progress → /momentum. */
export function MomentumCard() {
  const q = useMomentumSummary();
  const d = q.data;
  if (!d) return q.isError ? null : <Skeleton h={112} r={32} />;
  const s = d.streaks.logging;
  const note = s.status === 'paused' ? 'Paused — log today to pick it back up' : s.status === 'vacation' ? 'On vacation — your streak is safe' : s.current >= s.best && s.current > 0 ? 'Your best run yet' : `Best ever: ${s.best}`;
  return (
    <motion.div whileTap={{ scale: 0.98 }}>
      <Link to="/momentum" className="flex items-center gap-4 rounded-[32px] bg-accent p-5 text-on-accent no-underline" aria-label={`Momentum: logging streak ${s.current} days. ${note}. Open Momentum`}>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">Momentum</span>
          <span className="flex items-baseline gap-2">
            <span className="font-heading text-[46px] leading-none tabular">{s.current}</span>
            <span className="font-heading text-[20px]">day{s.current === 1 ? '' : 's'}</span>
          </span>
          <span className="text-[13px] font-semibold text-on-accent-sub">{note}</span>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-on-accent text-accent">
          {s.current > 0 ? <Flame aria-hidden className="h-5 w-5" strokeWidth={2.75} /> : <ChevronRight aria-hidden className="h-5 w-5" strokeWidth={2.75} />}
        </span>
      </Link>
    </motion.div>
  );
}
