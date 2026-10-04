import { ChevronRight, EyeOff, Flame } from 'lucide-react';
import { motion } from 'motion/react';
import { AWARD_META, type MemberProfileResponse, type StreakKind } from '@clubhouse/contracts';
import { fadeUp, stagger } from '@clubhouse/ui';
import { dateLabel, firstName, fmt } from '@/features/format';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { RingAvatar } from './BoardPieces';

type P = MemberProfileResponse;

const STREAK_COPY: Record<StreakKind, { label: string; unit: (n: number) => string }> = {
  logging: { label: 'Logging', unit: (n) => (n === 1 ? 'day' : 'days') },
  in_range: { label: 'In range', unit: (n) => (n === 1 ? 'day' : 'days') },
  activity: { label: 'Activity', unit: (n) => (n === 1 ? 'week' : 'weeks') },
};
const ORDER: StreakKind[] = ['logging', 'in_range', 'activity'];

/** Name, avatar, the 👑 and member-since. */
export function ProfileHero({ p }: { p: P }) {
  const crown = !!p.board?.crown;
  return (
    <div className="flex flex-col items-center gap-2.5 pt-1 text-center">
      <RingAvatar person={p.person} size={84} gap="var(--color-bg)" ring={crown ? 'var(--color-accent-2)' : 'var(--color-accent)'} tone="accent" />
      <h1 className="font-heading text-[30px] leading-[1.05]">{p.isMe ? `${p.person.name} (you)` : p.person.name}</h1>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[13px] font-bold">
        {crown && <span className="rounded-full bg-accent-2-200 px-3 py-1 text-accent-2-900">👑 Most consistent</span>}
        {p.onVacation && <span className="rounded-full bg-surface px-3 py-1 text-neutral-700">🏖 On a break</span>}
        {p.joinedOn && <span className="px-1 text-neutral-700">Member since {dateLabel(p.joinedOn, { month: 'short', year: 'numeric' })}</span>}
      </div>
    </div>
  );
}

/** This week on the board, or why it isn't shown. */
export function ProfileWeek({ p }: { p: P }) {
  const b = p.board;
  if (!b) return null;
  if (b.hidden) {
    return (
      <div className="flex items-center gap-3 rounded-[28px] bg-surface p-4 text-[14px] text-neutral-700">
        <EyeOff aria-hidden className="h-5 w-5 shrink-0" strokeWidth={2.75} />
        {firstName(p.person.name)} keeps their spot on the leaderboard private.
      </div>
    );
  }
  const w = b.week;
  const line = !w ? 'Not on the board this week' : w.status === 'away' ? 'Away this week — their average day counts' : w.status === 'new' ? 'New this week — ranked from next week' : w.rank ? `#${w.rank} this week` : 'Warming up';
  return (
    <div className="flex flex-col gap-1 rounded-[32px] bg-accent p-5 text-on-accent">
      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">{w ? `Week ${w.number}` : 'This week'}</span>
      <span className="flex items-baseline gap-2">
        <span className="font-heading text-[40px] leading-none tabular">{w ? fmt(w.points) : 0}</span>
        <span className="font-heading text-[18px]">pts</span>
      </span>
      <span className="text-[14px] font-bold text-on-accent-sub">{line}</span>
    </div>
  );
}

/** Logging, in-range and activity streaks, each with its best. */
export function ProfileStreaks({ p }: { p: P }) {
  return (
    <section aria-labelledby="streaks-title" className="flex flex-col gap-2.5">
      <h2 id="streaks-title" className="font-heading text-[20px]">
        Streaks
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((kind) => {
          const st = p.streaks.find((x) => x.kind === kind);
          if (!st) return null;
          const c = STREAK_COPY[kind];
          return (
            <div key={kind} className={kind === 'logging' ? 'flex flex-col gap-0.5 rounded-[24px] bg-accent-2-200 px-3 py-3.5 text-accent-2-900' : 'flex flex-col gap-0.5 rounded-[24px] bg-surface px-3 py-3.5'}>
              <span className="text-[11px] font-bold opacity-80">{c.label}</span>
              <span className="flex items-center gap-1 font-heading text-[24px] leading-tight tabular">
                {kind === 'logging' && st.current > 0 && <Flame aria-hidden className="h-4 w-4" strokeWidth={2.75} />}
                {st.current}
              </span>
              <span className="text-[12px] opacity-80">{st.status === 'paused' ? 'paused' : st.status === 'vacation' ? 'on a break' : c.unit(st.current)}</span>
              <span className="text-[11px] font-bold opacity-80">Best {st.best}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Board history: solid days, weeks ranked, wins and podiums, best week, and awards won. */
export function ProfileBoardRecord({ p }: { p: P }) {
  const b = p.board;
  if (!b || b.hidden) return null;
  const tiles: [string, string, string?][] = [
    ['Solid days', b.solid ? `${b.solid.solidDays}/${b.solid.eligibleDays}` : '—', 'last 28 days'],
    ['Wins', String(b.wins), b.wins === 1 ? 'week' : 'weeks'],
    ['Podiums', String(b.podiums), `of ${b.weeksRanked} ranked`],
  ];
  return (
    <section aria-labelledby="board-title" className="flex flex-col gap-2.5">
      <h2 id="board-title" className="font-heading text-[20px]">
        On the leaderboard
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-[24px] bg-surface px-3 py-3.5">
            <span className="text-[11px] font-bold text-neutral-700">{label}</span>
            <span className="font-heading text-[22px] leading-tight tabular">{value}</span>
            {sub && <span className="text-[12px] text-neutral-700">{sub}</span>}
          </div>
        ))}
      </div>
      {b.bestWeek && (
        <span className="px-1.5 text-[13px] text-neutral-700">
          Best week: <b className="text-text">{fmt(b.bestWeek.points)} pts</b> · week of {dateLabel(b.bestWeek.weekStart, { day: 'numeric', month: 'short' })}
        </span>
      )}
      {b.awards.length > 0 && (
        <ul aria-label="Awards won" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {b.awards.map((a) => (
            <li key={a.key} className="flex min-h-9 items-center gap-1.5 rounded-full bg-accent-2-200 px-3 text-[13px] font-bold text-accent-2-900">
              <span aria-hidden>{AWARD_META[a.key].emoji}</span>
              {AWARD_META[a.key].title}
              {a.count > 1 && <span className="tabular">×{a.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Personal records (longest run, most sessions in a week, longest streak…). */
export function ProfileRecords({ p }: { p: P }) {
  if (!p.records.length) return null;
  return (
    <ListGroup title="Personal records">
      {p.records.map((r) => (
        <ListRow key={r.record} title={r.label} sub={dateLabel(r.date, { day: 'numeric', month: 'short', year: 'numeric' })} right={<span className="text-[14px] font-extrabold tabular">{`${Math.round(r.value * 10) / 10} ${r.unit}`}</span>} />
      ))}
    </ListGroup>
  );
}

/** Streak badges earned. */
export function ProfileBadges({ p }: { p: P }) {
  if (!p.badges.length) return null;
  return (
    <section aria-labelledby="badges-title" className="flex flex-col gap-2.5">
      <h2 id="badges-title" className="font-heading text-[20px]">
        Badges
      </h2>
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
        {p.badges.map((b) => (
          <li key={`${b.kind}:${b.days}`} className="flex flex-col items-center gap-1 rounded-[24px] bg-surface px-2 py-3 text-center">
            <span aria-hidden className="text-[30px] leading-none">
              {b.emoji}
            </span>
            <span className="text-[12px] font-bold leading-tight">{b.name}</span>
            <span className="text-[11px] text-neutral-700">
              {b.days} days{b.kind in STREAK_COPY ? ` · ${STREAK_COPY[b.kind as StreakKind].label.toLowerCase()}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Habits streak and today's count; which ones only when they share habits. */
export function ProfileHabits({ p }: { p: P }) {
  const h = p.habits;
  if (!h) return null;
  return (
    <ListGroup title="Habits">
      <ListRow
        title={h.streak.current > 0 ? `${h.streak.current}-day habits streak` : 'No habits streak right now'}
        sub={h.streak.best > 0 ? `Best ${h.streak.best} days` : 'Every required habit kept starts one'}
        right={h.streak.current > 0 ? <Flame aria-hidden className="h-5 w-5 text-accent-700" strokeWidth={2.75} /> : undefined}
      />
      {h.totalToday > 0 && (
        <ListRow
          title={`${h.doneToday} of ${h.totalToday} kept today`}
          sub={h.keptToday ? (h.keptToday.length ? h.keptToday.join(', ') : 'None ticked yet') : `${firstName(p.person.name)} keeps which ones private`}
        />
      )}
    </ListGroup>
  );
}

/** "See their day": meals and moves when they share full logs, the day's summary otherwise. */
export function ProfileDayLink({ p, onOpen }: { p: P; onOpen: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.98 }} onClick={onOpen} className="flex min-h-16 w-full items-center gap-3 rounded-[26px] border-0 bg-surface px-4 py-3 text-left text-text">
      <span className="flex flex-1 flex-col">
        <span className="text-[15px] font-bold">{p.isMe ? 'Your day' : `${firstName(p.person.name)}’s day`}</span>
        <span className="text-[12px] text-neutral-700">{p.shares.fullLogs ? 'Meals with photos, moves and habits' : 'Their summary — they keep meal details private'}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0" strokeWidth={2.75} />
    </motion.button>
  );
}

export function ProfileSections({ p, onOpenDay }: { p: P; onOpenDay: () => void }) {
  return (
    <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="flex flex-col gap-5">
      {[
        <ProfileHero key="hero" p={p} />,
        <ProfileWeek key="week" p={p} />,
        <ProfileDayLink key="day" p={p} onOpen={onOpenDay} />,
        <ProfileStreaks key="streaks" p={p} />,
        <ProfileBoardRecord key="board" p={p} />,
        <ProfileHabits key="habits" p={p} />,
        <ProfileRecords key="records" p={p} />,
        <ProfileBadges key="badges" p={p} />,
      ].map((el) => (
        <motion.div key={el.key} variants={fadeUp} className="empty:hidden">
          {el}
        </motion.div>
      ))}
      <p className="m-0 text-center text-[12px] text-neutral-700">Weight is never shared with the crew.</p>
    </motion.div>
  );
}
