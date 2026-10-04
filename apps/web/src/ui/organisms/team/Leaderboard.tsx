import { motion } from 'motion/react';
import { useId } from 'react';
import type { BoardResponse, BoardRowDto, SolidDayState, SolidRowDto, WeekResultsDto } from '@clubhouse/contracts';
import { useOnline } from '@clubhouse/ui';
import { dateLabel, relativeTime } from '@/features/format';
import { cn } from '@/lib/cn';
import { DayDots, daysSpoken, DotLegend, firstOf, Movement, movementSpoken, RingAvatar, shownName } from './BoardPieces';

export type BoardView = 'week' | 'solid';

const PODIUM = [
  { place: 2, h: 92, cls: 'bg-accent-2-200 text-accent-2-900' },
  { place: 1, h: 118, cls: 'bg-accent text-on-accent' },
  { place: 3, h: 74, cls: 'bg-neutral-300 text-text' },
];

const rowSpoken = (r: BoardRowDto) =>
  `${r.isMe ? 'You' : r.person.name}${r.crown ? ', most consistent' : ''}: ${r.rank != null ? `rank ${r.rank}, ` : r.status === 'away' ? 'away this week, ' : r.status === 'new' ? 'new this week, ' : ''}${r.points} points${movementSpoken(r.movement)}. ${daysSpoken(r.days)}. Open their card`;

function Podium({ rows, onOpen }: { rows: BoardRowDto[]; onOpen: (r: BoardRowDto) => void }) {
  // Ties share a place: the podium shows the first three in board order on the 2 · 1 · 3 steps.
  const top = rows.slice(0, 3);
  return (
    <div className="grid grid-cols-3 items-end gap-2 px-0.5 pt-1.5">
      {PODIUM.map((p) => {
        const r = top[p.place - 1];
        if (!r) return <span key={p.place} />;
        return (
          <motion.button
            key={r.person.id}
            type="button"
            layout
            whileTap={{ scale: 0.97 }}
            onClick={() => onOpen(r)}
            aria-label={rowSpoken(r)}
            className="flex flex-col items-center gap-1.5 border-0 bg-transparent p-0 text-text"
          >
            <RingAvatar person={r.person} size={52} ring={r.isMe ? 'var(--color-accent-700)' : r.crown ? 'var(--color-accent-2)' : 'transparent'} tone={p.place === 1 ? 'accent' : 'neutral'} />
            <span className="mt-1 max-w-full truncate text-[14px] font-bold">
              {r.crown && <span aria-hidden>👑 </span>}
              {shownName(r.person, r.isMe)}
            </span>
            <motion.span
              initial={{ height: 0 }}
              animate={{ height: p.h }}
              transition={{ type: 'spring', stiffness: 260, damping: 26, delay: p.place === 1 ? 0.05 : 0.12 }}
              className={cn('flex w-full flex-col items-center gap-0.5 overflow-hidden rounded-t-[26px] rounded-b-[14px] pt-2.5', p.cls)}
            >
              <span className="font-heading text-[26px] leading-none">{r.rank}</span>
              <span className="text-[13px] font-extrabold tabular">{r.points}</span>
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}

function BoardRow({ r, onOpen }: { r: BoardRowDto; onOpen: (r: BoardRowDto) => void }) {
  const note = r.status === 'away' ? 'Away this week — not ranked' : r.status === 'new' ? 'New this week — ranked from next week' : null;
  return (
    <motion.button
      layout
      type="button"
      onClick={() => onOpen(r)}
      aria-label={rowSpoken(r)}
      whileTap={{ scale: 0.99 }}
      className={cn(
        'flex min-h-[60px] w-full items-center gap-2.5 rounded-[22px] border-2 px-2.5 py-2 text-left text-text',
        r.isMe ? 'border-accent bg-bg' : r.status !== 'ranked' ? 'border-dashed border-neutral-400 bg-transparent' : 'border-transparent bg-transparent',
      )}
    >
      <span className="w-[22px] text-center font-heading text-[17px] tabular">{r.rank ?? '–'}</span>
      <RingAvatar person={r.person} size={36} ring={r.crown ? 'var(--color-accent-2)' : 'transparent'} />
      <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="truncate text-[14px] font-bold">
          {r.crown && <span aria-hidden>👑 </span>}
          {shownName(r.person, r.isMe)}
        </span>
        <DayDots days={r.days} />
        {note && <span className="text-[11px] font-semibold text-neutral-700">{note}</span>}
      </span>
      <span className="text-[14px] font-extrabold tabular">{r.points}</span>
      <Movement value={r.movement} />
    </motion.button>
  );
}

const STRIP: Record<SolidDayState, string> = {
  solid: 'var(--color-accent)',
  logged: 'var(--color-accent-300)',
  none: 'var(--color-neutral-300)',
  away: 'var(--color-accent-2-300)',
  pre: 'transparent',
};

function SolidRow({ r, onOpen }: { r: SolidRowDto; onOpen: () => void }) {
  const pct = r.eligibleDays ? Math.round((r.solidDays / r.eligibleDays) * 100) : 0;
  const sub = r.status === 'warming_up' ? `Warming up — ${r.eligibleDays} of 7 days` : `${r.solidDays} of ${r.eligibleDays} days${r.crown ? ' · 👑 Most consistent' : ''}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${r.isMe ? 'You' : r.person.name}: ${r.status === 'warming_up' ? `warming up, ${r.eligibleDays} days so far` : `rank ${r.rank}, ${r.solidDays} solid days of ${r.eligibleDays}, ${pct} percent`}${r.crown ? ', most consistent' : ''}. Open their card`}
      className={cn('flex min-h-16 w-full items-center gap-2.5 rounded-[22px] border-0 px-2.5 py-2 text-left text-text', r.isMe ? 'bg-bg' : 'bg-transparent')}
    >
      <span className="w-[22px] text-center font-heading text-[17px] tabular">{r.rank ?? '–'}</span>
      <RingAvatar person={r.person} size={36} ring={r.crown ? 'var(--color-accent-2)' : 'transparent'} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-bold">{shownName(r.person, r.isMe)}</span>
        <span className={cn('text-[12px] font-bold', r.crown ? 'text-accent-2-800' : 'text-neutral-700')}>{sub}</span>
      </span>
      <span aria-hidden className="grid grid-cols-7 gap-[3px]">
        {r.strip.map((d, i) => (
          <span key={i} className="h-2 w-2 rounded-full" style={{ background: STRIP[d], boxShadow: d === 'pre' ? 'inset 0 0 0 1px var(--color-neutral-300)' : undefined }} />
        ))}
      </span>
      <span className="w-[46px] text-right font-heading text-[18px] tabular">{r.status === 'ranked' ? `${pct}%` : '–'}</span>
    </button>
  );
}

function ZeroState({ board, lastWeek, onOpen }: { board: BoardResponse; lastWeek: WeekResultsDto | null; onOpen: (r: BoardRowDto) => void }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <>
      <div className="flex flex-col gap-2.5 rounded-[26px] bg-bg p-4">
        <span className="font-heading text-[22px] leading-tight">Everyone’s at 0</span>
        <span className="text-[14px] leading-normal text-neutral-700">Fresh week, level start. Your first meal logged today puts you on the board.</span>
        {lastWeek && lastWeek.podium.length > 0 && (
          <>
            <span className="mt-1 text-[12px] font-bold uppercase tracking-[0.1em] text-accent-700">Last week’s top three</span>
            <div className="flex flex-wrap gap-2">
              {lastWeek.podium.map((p, i) => (
                <span key={p.person.id} className="flex min-h-10 items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3.5">
                  <RingAvatar person={p.person} size={32} gap="var(--color-surface)" />
                  <span className="text-[13px] font-bold">
                    {medals[i]} {shownName(p.person, p.isMe)} · {p.points}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col">
        {board.rows.map((r) => (
          <button key={r.person.id} type="button" onClick={() => onOpen(r)} aria-label={`${r.isMe ? 'You' : r.person.name}: 0 points. Open their card`} className="flex min-h-[52px] items-center gap-2.5 border-0 bg-transparent px-2.5 py-1.5 text-left text-text">
            <span className="w-[22px] text-center font-heading text-[17px] text-neutral-600">–</span>
            <RingAvatar person={r.person} size={36} />
            <span className="flex-1 text-[14px] font-bold">{shownName(r.person, r.isMe)}</span>
            <span className="text-[14px] font-extrabold text-neutral-700">0</span>
          </button>
        ))}
      </div>
    </>
  );
}

function weekLabel(b: BoardResponse) {
  const a = dateLabel(b.week.start, { day: 'numeric', month: 'short' });
  const z = dateLabel(b.week.end, { day: 'numeric', month: 'short' });
  return `Week ${b.week.number} · ${a} – ${z}`;
}

/**
 * The board card (design 5a Podium): This week (podium for the top three, rows for everyone else, the zero state on
 * a fresh Monday) or Solid days (28-day rate, the 👑). Small crews get rows only until three are ranked.
 */
export function Leaderboard({
  board,
  view,
  onView,
  stale,
  onOpenMember,
  onLastWeek,
  onPoints,
}: {
  board: BoardResponse;
  view: BoardView;
  onView: (v: BoardView) => void;
  stale: number | null;
  onOpenMember: (id: string) => void;
  onLastWeek: () => void;
  onPoints: () => void;
}) {
  const online = useOnline();
  const tabs = useId();
  const ranked = board.rows.filter((r) => r.rank != null);
  const others = board.rows.slice(board.rankedCount >= 3 ? 3 : 0);
  const zero = board.week.isCurrent && board.rows.length > 0 && board.rows.every((r) => r.points === 0);
  const open = (r: BoardRowDto) => onOpenMember(r.person.id);
  return (
    <section aria-label="Leaderboard" className="flex flex-col gap-2.5 rounded-[32px] bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Leaderboard view" className="flex gap-1 rounded-full bg-bg p-1">
          {(
            [
              ['week', 'This week'],
              ['solid', 'Solid days'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`${tabs}-${k}`}
              aria-selected={view === k}
              aria-controls={`${tabs}-panel`}
              onClick={() => onView(k)}
              className={cn('relative min-h-10 rounded-full border-0 px-4 text-[14px] font-bold transition-colors', view === k ? 'text-bg' : 'bg-transparent text-text')}
            >
              {view === k && <motion.span layoutId={`${tabs}-seg`} className="absolute inset-0 rounded-full bg-text" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        {!online && stale != null && <span className="rounded-full bg-neutral-300 px-2.5 py-1.5 text-[12px] font-bold text-neutral-900">Offline · updated {relativeTime(new Date(stale).toISOString())}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="eyebrow">{view === 'week' ? weekLabel(board) : 'Last 28 days'}</span>
        {board.lastWeek && (
          <button type="button" onClick={onLastWeek} className="min-h-11 border-0 bg-transparent p-0 text-[13px] font-bold text-accent-700">
            Last week’s results
          </button>
        )}
      </div>
      <div id={`${tabs}-panel`} role="tabpanel" aria-labelledby={`${tabs}-${view}`} className="flex flex-col gap-1">
        {view === 'week' ? (
          zero ? (
            <ZeroState board={board} lastWeek={board.lastWeek} onOpen={open} />
          ) : (
            <>
              {board.rankedCount >= 3 && <Podium rows={ranked} onOpen={open} />}
              <div className="flex flex-col gap-1">
                {others.map((r) => (
                  <BoardRow key={r.person.id} r={r} onOpen={open} />
                ))}
              </div>
              {board.rankedCount < 3 && <span className="px-1 text-[13px] leading-snug text-neutral-700">The podium and awards start once three of you are in.</span>}
              <DotLegend />
            </>
          )
        ) : (
          <>
            <span className="px-1 pb-1 text-[13px] leading-snug text-neutral-700">A solid day is two or more meals logged plus one good call.</span>
            {board.solid.map((r) => (
              <SolidRow key={r.person.id} r={r} onOpen={() => onOpenMember(r.person.id)} />
            ))}
          </>
        )}
      </div>
      <button type="button" onClick={onPoints} className="min-h-11 self-start border-0 bg-transparent px-1 text-[14px] font-bold text-accent-700">
        How points work →
      </button>
    </section>
  );
}

export { firstOf };
