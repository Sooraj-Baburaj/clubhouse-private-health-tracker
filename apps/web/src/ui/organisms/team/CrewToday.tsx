import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Flame, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { TeamMemberSummary, TeamSummaryResponse } from '@clubhouse/contracts';
import { useMeData } from '@/features/me';
import { useTeamPulseOptIn } from '@/features/team';
import { BandPill } from '@/ui/atoms/Badges';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Toggle } from '@/ui/atoms/Toggle';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { RingAvatar, shownName } from './BoardPieces';

/** Avatars in the folded Crew today (five and "+N" when there are more): what fits a 375 px phone. */
const COMPACT = 6;

const ICON = { green: 'check', yellow: 'dash', red: 'alert', neutral: 'progress' } as const;

const sorted = (members: TeamMemberSummary[]) => [...members].sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(b.logged) - Number(a.logged) || b.streak - a.streak);

function CrewRow({ m, onOpen }: { m: TeamMemberSummary; onOpen: () => void }) {
  const meals = m.logged ? `${m.mealsLogged} meal${m.mealsLogged === 1 ? '' : 's'} logged` : 'Not logged yet';
  const spoken = `${m.person.name}${m.isMe ? ' (you)' : ''}: ${m.logged ? `${m.bandLabel ?? 'logging'}, ${meals}` : 'not logged yet'}, streak ${m.streak}${m.pulse ? `, consistency ${m.pulse.consistencyWord}` : ''}`;
  return (
    <button type="button" onClick={onOpen} aria-label={spoken} className="flex min-h-[60px] w-full items-center gap-3 border-0 bg-transparent px-0.5 py-1.5 text-left text-text">
      <RingAvatar person={m.person} size={40} ring={m.logged ? 'var(--color-accent)' : 'var(--color-neutral-300)'} tone={m.logged ? 'accent' : 'neutral'} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold">{m.isMe ? 'You' : m.person.name.split(' ')[0]}</span>
        <span className="flex flex-wrap items-center gap-1 text-[12px] text-neutral-700">
          <Flame aria-hidden className="h-3.5 w-3.5 text-accent-700" strokeWidth={2.75} />
          {m.streak} · {meals}
          {m.pulse && (
            <span>
              · {m.pulse.consistencyWord} {Math.round(m.pulse.consistencyScore)} · {m.pulse.sessions} sessions
            </span>
          )}
        </span>
      </span>
      {m.logged && m.band && m.bandLabel && <BandPill band={{ band: m.band, label: m.bandLabel, icon: ICON[m.band] }} />}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-neutral-600" strokeWidth={2.75} />
    </button>
  );
}

/**
 * Crew today: who has logged, compact as a row of avatars, expanding to everyone's streak, meals and calorie band.
 * Teammates' rows open their day; the team pulse (opt-in comparison) shows here while the leaderboard is off.
 */
export function CrewToday({ q }: { q: { data?: TeamSummaryResponse; isError: boolean; error: unknown; refetch: () => unknown } }) {
  const me = useMeData();
  const navigate = useNavigate();
  const optIn = useTeamPulseOptIn();
  const [open, setOpen] = useState(false);
  const d = q.data;
  if (!d) {
    return q.isError ? <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="the crew" /> : <Skeleton h={150} r={32} />;
  }
  const members = sorted(d.members);
  const logged = d.members.filter((m) => m.logged).length;
  const go = (m: TeamMemberSummary) => (m.isMe ? void navigate({ to: '/', search: {} }) : void navigate({ to: '/team/$memberId', params: { memberId: m.person.id }, search: {} }));
  const pulseOn = me.team.featureFlags.teamPulse && !me.team.featureFlags.leaderboard;
  return (
    <section aria-labelledby="crew-title" className="flex flex-col gap-3 rounded-[32px] bg-surface p-4">
      <div className="flex items-baseline gap-2">
        <h2 id="crew-title" className="flex-1 font-heading text-[20px]">
          Crew today
        </h2>
        <span className="text-[13px] font-bold text-neutral-700">
          {logged} of {d.members.length} logged
        </span>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          <motion.button
            key="compact"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-label={`Crew today: ${logged} of ${d.members.length} logged. See everyone`}
            className="flex flex-col gap-2.5 border-0 bg-transparent p-0 text-text"
          >
            {/* As many as fit a phone (no scrolling inside the button), the rest as "+N". */}
            <span className="flex w-full justify-between gap-1 overflow-hidden px-1 pt-1">
              {(members.length > COMPACT ? members.slice(0, COMPACT - 1) : members).map((m) => (
                <span key={m.person.id} className="flex min-w-[46px] flex-1 flex-col items-center gap-1.5">
                  <RingAvatar person={m.person} size={42} ring={m.logged ? 'var(--color-accent)' : 'var(--color-neutral-300)'} tone={m.logged ? 'accent' : 'neutral'} />
                  <span className="max-w-full truncate text-[11px] font-semibold text-neutral-700">{shownName(m.person, m.isMe)}</span>
                </span>
              ))}
              {members.length > COMPACT && (
                <span className="flex min-w-[46px] flex-1 flex-col items-center gap-1.5">
                  <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-bg text-[13px] font-extrabold text-neutral-700">+{members.length - (COMPACT - 1)}</span>
                  <span className="text-[11px] font-semibold text-neutral-700">more</span>
                </span>
              )}
            </span>
            <span className="flex min-h-8 items-center gap-1 self-center text-[13px] font-bold text-accent-700">
              See everyone
              <ChevronDown aria-hidden className="h-4 w-4" strokeWidth={2.75} />
            </span>
          </motion.button>
        ) : (
          <motion.div key="full" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col overflow-hidden">
            <ul className="m-0 flex list-none flex-col p-0">
              {members.map((m) => (
                <li key={m.person.id}>
                  <CrewRow m={m} onOpen={() => go(m)} />
                </li>
              ))}
              {pulseOn && d.anonymisedCount > 0 && (
                <li className="flex min-h-14 items-center gap-3 px-0.5 py-2">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg text-neutral-700">
                    <Users aria-hidden className="h-5 w-5" strokeWidth={2.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-bold">
                      {d.anonymisedCount} teammate{d.anonymisedCount === 1 ? '' : 's'}
                    </span>
                    <span className="text-[12px] text-neutral-700">{d.anonymisedPulse ? `Avg consistency ${Math.round(d.anonymisedPulse.avgConsistency)} · ${d.anonymisedPulse.sessions} sessions this week` : 'Keeping their pulse private'}</span>
                  </span>
                </li>
              )}
            </ul>
            {pulseOn && (
              <div className="mt-1 flex min-h-14 items-center gap-3 rounded-[24px] bg-bg px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">Join team pulse</span>
                  <span className="text-[12px] text-neutral-700">Compare consistency and sessions with teammates who also join. Weight is never shared.</span>
                </span>
                <Toggle label="Join team pulse" checked={d.myPulseOptIn} onChange={(v) => optIn.mutate(v)} disabled={optIn.isPending} />
              </div>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-expanded className="min-h-11 self-center border-0 bg-transparent text-[13px] font-bold text-accent-700">
              Show less
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
