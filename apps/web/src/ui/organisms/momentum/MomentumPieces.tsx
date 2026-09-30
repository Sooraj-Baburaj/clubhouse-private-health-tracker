import { Lock } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { MomentumResponse, StreakDto } from '@clubhouse/contracts';
import { addDays, badgeFor } from '@clubhouse/domain';
import { AnimatedNumber } from '@clubhouse/ui';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/atoms/Avatar';
import { dayMonth, shortDay } from '@/ui/organisms/today/dates';
import { useListMotion } from '@/ui/organisms/today/motion';

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const word = (n: number) => WORDS[n] ?? String(n);

export function heroCopy(s: StreakDto, vacationUntil: string | null): string {
  if (s.status === 'vacation') return vacationUntil ? `On a break until ${dayMonth(vacationUntil)} — your streak is safe.` : 'On a break — your streak is safe.';
  if (s.status === 'paused') return 'Paused — log to resume. Nothing is lost yet.';
  if (s.status === 'reset' || s.current === 0) return s.best ? `Fresh start · best ${s.best}` : 'Log today and day one starts now.';
  if (s.current >= s.best) return 'Your best ever. Every day from here is a new record.';
  return `Best ever: ${s.best}. ${word(s.best - s.current)} more and you tie it.`;
}

/** Accent hero: the logging streak as a 96 px count-up. */
export function StreakHero({ s, vacationUntil }: { s: StreakDto; vacationUntil: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-[36px] bg-accent p-[22px] text-on-accent">
      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">Logging streak</span>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-[96px] leading-[0.9] tracking-[-0.03em] tabular" aria-hidden>
          <AnimatedNumber value={s.current} />
        </span>
        <span className="font-heading text-[24px]" aria-hidden>
          {s.current === 1 ? 'day' : 'days'}
        </span>
        <span className="sr-only">
          {s.current} day logging streak
        </span>
      </div>
      <span className="text-[14px] font-semibold text-on-accent-sub">{heroCopy(s, vacationUntil)}</span>
    </div>
  );
}

const DOT: Record<string, { cls: string; mark: string; label: string }> = {
  ok: { cls: 'bg-accent text-accent-800 border-transparent', mark: '', label: 'logged' },
  grace: { cls: 'bg-accent-200 text-accent-800 border-accent-400', mark: 'G', label: 'grace day — paused, not broken' },
  miss: { cls: 'bg-neutral-100 text-neutral-700 border-neutral-400', mark: '', label: 'not logged' },
  vacation: { cls: 'bg-accent-2-200 text-accent-2-800 border-transparent', mark: 'V', label: 'on a break' },
  pending: { cls: 'bg-text text-bg border-transparent', mark: '•', label: 'today, still open' },
  none: { cls: 'bg-neutral-100 text-neutral-700 border-transparent', mark: '', label: 'before you joined' },
};

/** Last 21 days as dots: logged, grace "G", missed, break, today. */
export function DotGrid({ s, today }: { s: StreakDto; today: string }) {
  const reduce = useReducedMotion();
  const map = new Map(s.history.map((h) => [h.date, h.state]));
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i - 20));
  return (
    <div className="flex flex-col gap-2.5 rounded-[30px] bg-surface p-4">
      <div className="flex justify-between gap-2 text-[13px]">
        <span className="font-bold">Last 21 days</span>
        <span className="text-neutral-700">
          {s.graceLeft} grace {s.graceLeft === 1 ? 'day' : 'days'} left
        </span>
      </div>
      <ol className="m-0 grid list-none grid-cols-7 gap-1.5 p-0" aria-label="Logging, last 21 days">
        {days.map((d, i) => {
          const state = d === today ? (map.get(d) === 'ok' ? 'ok' : 'pending') : (map.get(d) ?? 'none');
          const st = DOT[state] ?? DOT.none!;
          return (
            <motion.li
              key={d}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 22, delay: i * 0.018 }}
              title={`${shortDay(d)}: ${st.label}`}
              aria-label={`${shortDay(d)}: ${st.label}`}
              className={cn('grid aspect-square place-items-center rounded-full border-2 text-[10px] font-extrabold', st.cls)}
            >
              <span aria-hidden>{st.mark}</span>
            </motion.li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-neutral-700">
        <span>● logged</span>
        <span>G grace — streak paused, not broken</span>
        <span>V on a break</span>
      </div>
    </div>
  );
}

/** In-range and activity tiles plus the dark Team streak card with crew avatars. */
export function StreakTiles({ data }: { data: MomentumResponse }) {
  const inRange = data.streaks.in_range;
  const act = data.streaks.activity;
  const note = (s: StreakDto, unit: string) => (s.status === 'paused' ? 'paused — log to resume' : s.status === 'vacation' ? 'on a break' : unit);
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="flex flex-col gap-0.5 rounded-[28px] bg-surface p-4">
        <span className="text-[12px] font-bold text-neutral-700">In range</span>
        <span className="font-heading text-[32px] leading-tight tabular">
          <AnimatedNumber value={inRange.current} />
        </span>
        <span className="text-[12px] text-neutral-700">{note(inRange, inRange.current === 1 ? 'day on target' : 'days on target')}</span>
      </div>
      <div className="flex flex-col gap-0.5 rounded-[28px] bg-accent-2-200 p-4 text-accent-2-900">
        <span className="text-[12px] font-bold text-accent-2-800">Activity</span>
        <span className="font-heading text-[32px] leading-tight tabular">
          <AnimatedNumber value={act.current} />
        </span>
        <span className="text-[12px] text-accent-2-800">{note(act, act.current === 1 ? 'week on plan' : 'weeks on plan')}</span>
      </div>
      {data.team.enabled && (
        <div className="col-span-2 flex items-center gap-4 rounded-[28px] bg-text p-4 text-bg">
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="text-[12px] font-bold text-neutral-300">Team streak</span>
            <span className="font-heading text-[32px] leading-tight tabular">
              <AnimatedNumber value={data.team.current} /> <span className="font-body text-[14px]">days</span>
            </span>
            <span className="text-[12px] text-neutral-300">Best together: {data.team.best}</span>
          </div>
          <div className="flex" aria-label={`${data.crew.filter((c) => c.logged).length} of ${data.crew.length} logged today`}>
            {data.crew.slice(0, 7).map((c) => (
              <Avatar key={c.id} name={c.name} initials={c.initials} url={c.avatarUrl} size={28} active={c.logged} className="-mr-1.5 border-2 border-text" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Badges: earned (emoji + name, new ones pop) and the rest greyed with "in N days" on the next one. */
export function BadgesGrid({ data, milestones }: { data: MomentumResponse; milestones: number[] }) {
  const reduce = useReducedMotion();
  const m = useListMotion(0.04);
  const earned = new Map(data.badges.map((b) => [b.days, b]));
  const all = [...new Set([...milestones, ...data.badges.map((b) => b.days)])].sort((a, b) => a - b);
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="badges-title">
      <h2 id="badges-title" className="font-heading text-[20px]">
        Badges
      </h2>
      <motion.ul variants={m.container} initial="hidden" animate="show" className="m-0 grid list-none grid-cols-3 gap-2 p-0">
        {all.map((days) => {
          const b = earned.get(days);
          const meta = b ?? { ...badgeFor(days), days };
          const next = !b && data.nextMilestone?.days === days ? data.nextMilestone : null;
          const fresh = b && !b.seen;
          return (
            <motion.li
              key={days}
              variants={m.item}
              className={cn('relative flex flex-col items-center gap-1 rounded-[24px] px-2 py-3 text-center', b ? (fresh ? 'bg-accent-200 text-accent-900' : 'bg-surface') : 'bg-neutral-100 text-neutral-700')}
              aria-label={b ? `${meta.name}, earned` : `${meta.name}, ${next ? `in ${next.inDays} days` : `at ${days} days`}`}
            >
              <motion.span
                aria-hidden
                className={cn('text-[34px] leading-none', !b && 'opacity-35 grayscale')}
                initial={fresh && !reduce ? { scale: 0, rotate: -25 } : false}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 520, damping: 11, delay: 0.35 }}
              >
                {meta.emoji}
              </motion.span>
              <span className="text-[12px] font-bold leading-tight">{meta.name}</span>
              <span className="text-[11px]">{b ? (fresh ? 'New!' : `${days} days`) : next ? `in ${next.inDays} ${next.inDays === 1 ? 'day' : 'days'}` : `${days} days`}</span>
              {!b && <Lock className="absolute right-2.5 top-2.5 h-3 w-3 opacity-50" strokeWidth={2.75} aria-hidden />}
            </motion.li>
          );
        })}
      </motion.ul>
    </section>
  );
}
