import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { AWARD_META, type AwardDto, type WeekResultsDto } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { RingAvatar, shownName } from './BoardPieces';

const STEP = [
  { place: 2, h: 64, cls: 'bg-neutral-700 text-neutral-100' },
  { place: 1, h: 88, cls: 'bg-accent text-on-accent' },
  { place: 3, h: 48, cls: 'bg-neutral-800 text-neutral-200' },
];

function MiniPodium({ results, dark }: { results: WeekResultsDto; dark?: boolean }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2">
      {STEP.map((s) => {
        const p = results.podium.find((x) => x.rank === s.place) ?? results.podium[s.place - 1];
        if (!p) return <span key={s.place} />;
        return (
          <div key={s.place} className="flex flex-col items-center gap-1.5">
            <RingAvatar person={p.person} size={44} gap={dark ? 'var(--color-text)' : 'var(--color-bg)'} ring={p.isMe ? 'var(--color-accent)' : 'transparent'} tone={dark ? 'dark' : 'neutral'} />
            <span className="max-w-full truncate text-[13px] font-bold">{shownName(p.person, p.isMe)}</span>
            <span className={cn('flex w-full flex-col items-center rounded-t-[22px] rounded-b-[12px] pt-2', dark ? s.cls : s.place === 1 ? 'bg-accent text-on-accent' : 'bg-surface text-text')} style={{ height: s.h }}>
              <span className="font-heading text-[20px] leading-tight">{p.rank}</span>
              <span className="text-[12px] font-extrabold tabular">{p.points}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function resultLine(r: WeekResultsDto): string {
  if (r.me?.rank != null) {
    const joint = r.standings.filter((s) => s.rank === r.me!.rank).length > 1 ? 'joint ' : '';
    return `You finished ${joint}#${r.me.rank} — ${r.me.points} pts${r.me.best ? ', your best week yet' : ''}`;
  }
  // Ties share the win: "Asha & Ravi shared the week".
  const winners = r.podium.filter((p) => p.rank === 1);
  if (!winners.length) return 'The week is closed';
  const names = winners.map((w) => (w.isMe ? 'You' : w.person.name.split(' ')[0]));
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0];
  return `${who} ${winners.length > 1 ? 'shared' : 'took'} the week with ${winners[0]!.points} pts`;
}

/** Monday's dark results card: the podium, your finish, the awards, "back to 0". Shown until dismissed (Mon–Tue). */
export function WeekResultsCard({ results, onDismiss }: { results: WeekResultsDto; onDismiss: () => void }) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: -16 }}
      aria-label={`Week ${results.weekNumber} results`}
      className="flex flex-col gap-4 overflow-hidden rounded-[36px] bg-text p-5 text-bg"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[12px] font-bold uppercase tracking-[0.1em] text-accent-400">Week {results.weekNumber} results</span>
        <button type="button" onClick={onDismiss} aria-label="Dismiss results" className="-m-2.5 grid h-11 w-11 place-items-center rounded-full border-0 bg-transparent text-inherit">
          <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </button>
      </div>
      {results.podium.length >= 3 && <MiniPodium results={results} dark />}
      <span className="font-heading text-[21px] leading-[1.2]">{resultLine(results)}</span>
      {results.awards.length > 0 && (
        <div className="scroll-hidden -mx-5 flex gap-2 overflow-x-auto px-5">
          {results.awards.map((a) => (
            <span key={`${a.key}:${a.person.id}`} className="flex shrink-0 items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--color-bg)_14%,transparent)] py-1.5 pl-2 pr-3.5">
              <span aria-hidden className="text-[20px]">
                {AWARD_META[a.key].emoji}
              </span>
              <span className="flex flex-col">
                <span className="text-[12px] font-extrabold">{AWARD_META[a.key].title}</span>
                <span className="text-[11px] text-neutral-300">{shownName(a.person, a.isMe)}</span>
              </span>
            </span>
          ))}
        </div>
      )}
      <span className="text-[14px] font-bold text-neutral-300">New week — everyone’s back to 0.</span>
    </motion.section>
  );
}

function AwardCard({ a, onOpen }: { a: AwardDto; onOpen?: () => void }) {
  const meta = AWARD_META[a.key];
  return (
    <li className="w-[156px] shrink-0">
      <button type="button" onClick={onOpen} disabled={!onOpen} className="flex h-full w-full flex-col items-start gap-2 rounded-[28px] border-0 bg-surface p-3.5 text-left text-text">
      <span aria-hidden className="text-[30px] leading-none">
        {meta.emoji}
      </span>
      <span className="text-[14px] font-extrabold">{meta.title}</span>
      <span className="flex items-center gap-1.5">
        <RingAvatar person={a.person} size={26} gap="var(--color-surface)" />
        <span className="truncate text-[13px] font-bold">{shownName(a.person, a.isMe)}</span>
      </span>
      <span className="text-[12px] leading-snug text-neutral-700">{a.why}</span>
      </button>
    </li>
  );
}

/** Last week's awards, a horizontal strip. */
export function AwardsStrip({ results, onOpenMember }: { results: WeekResultsDto; onOpenMember?: (id: string) => void }) {
  if (!results.awards.length) return null;
  return (
    <section aria-labelledby="awards-title" className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <h2 id="awards-title" className="flex-1 font-heading text-[20px]">
          Last week’s awards
        </h2>
        <span className="text-[12px] font-bold text-neutral-700">Week {results.weekNumber}</span>
      </div>
      {/* It scrolls sideways, so it takes keyboard focus itself too. */}
      <ul tabIndex={0} aria-labelledby="awards-title" className="scroll-hidden snap-x-chips -mx-5 m-0 flex list-none gap-2.5 overflow-x-auto rounded-[28px] px-5 pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {results.awards.map((a) => (
          <AwardCard key={`${a.key}:${a.person.id}`} a={a} onOpen={onOpenMember && (() => onOpenMember(a.person.id))} />
        ))}
      </ul>
    </section>
  );
}

/** "Last week's results": the final standings and the awards. */
export function LastWeekSheet({ results, open, onClose, onOpenMember }: { results: WeekResultsDto | null; open: boolean; onClose: () => void; onOpenMember: (id: string) => void }) {
  return (
    <MemberSheet open={open && !!results} onClose={onClose} title={results ? `Week ${results.weekNumber} results` : undefined}>
      {results && (
        <div className="flex flex-col gap-4 pb-2">
          {results.podium.length >= 3 && <MiniPodium results={results} />}
          <span className="font-heading text-[18px] leading-snug">{resultLine(results)}</span>
          <ol className="m-0 flex list-none flex-col rounded-[26px] bg-surface p-1.5">
            {results.standings.map((s) => (
              <li key={s.person.id}>
                <button type="button" onClick={() => onOpenMember(s.person.id)} className="flex min-h-12 w-full items-center gap-2.5 rounded-[20px] border-0 bg-transparent px-2.5 text-left">
                  <span className="w-[22px] text-center font-heading text-[16px] tabular">{s.rank ?? '–'}</span>
                  <RingAvatar person={s.person} size={32} />
                  <span className="flex-1 truncate text-[14px] font-bold">
                    {shownName(s.person, s.isMe)}
                    {s.status !== 'ranked' && <span className="font-semibold text-neutral-700"> · {s.status === 'away' ? 'away' : 'new'}</span>}
                  </span>
                  <span className="text-[14px] font-extrabold tabular">{s.points}</span>
                </button>
              </li>
            ))}
          </ol>
          {results.awards.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="eyebrow">Awards</span>
              {results.awards.map((a) => (
                <div key={`${a.key}:${a.person.id}`} className="flex items-center gap-3 rounded-[22px] bg-surface px-3.5 py-2.5">
                  <span aria-hidden className="text-[24px]">
                    {AWARD_META[a.key].emoji}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-extrabold">
                      {AWARD_META[a.key].title} · {shownName(a.person, a.isMe)}
                    </span>
                    <span className="text-[12px] text-neutral-700">{a.why}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </MemberSheet>
  );
}
