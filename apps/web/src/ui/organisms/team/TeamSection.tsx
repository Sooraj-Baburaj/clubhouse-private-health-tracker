import { useNavigate } from '@tanstack/react-router';
import { ChevronRight, Flame, Users } from 'lucide-react';
import { motion } from 'motion/react';
import type { TeamMemberSummary } from '@clubhouse/contracts';
import { fadeUp, stagger } from '@clubhouse/ui';
import { firstName } from '@/features/format';
import { useMeData } from '@/features/me';
import { useTeamPulseOptIn, useTeamSummary } from '@/features/team';
import { Avatar } from '@/ui/atoms/Avatar';
import { BandPill, Tag } from '@/ui/atoms/Badges';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Toggle } from '@/ui/atoms/Toggle';
import { ErrorCard, SectionHead } from '@/ui/organisms/progress/Kit';

const ICON = { green: 'check', yellow: 'dash', red: 'alert', neutral: 'progress' } as const;

/** Team section on Progress (APP-PROG-08): daily summaries for everyone, pulse comparison only for opt-ins. */
export function TeamSection() {
  const me = useMeData();
  const q = useTeamSummary();
  const optIn = useTeamPulseOptIn();
  const navigate = useNavigate();
  const d = q.data;
  const pulseOn = me.team.featureFlags.teamPulse;
  if (!d) {
    return (
      <>
        <SectionHead eyebrow="Team · today" />
        {q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="the team" />
        ) : (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={64} r={24} />
            ))}
          </div>
        )}
      </>
    );
  }
  const logged = d.members.filter((m) => m.logged).length;
  const members = [...d.members].sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(b.logged) - Number(a.logged) || b.streak - a.streak);
  return (
    <>
      <SectionHead eyebrow="Team · today" title={`${logged} of ${d.members.length} logged`} right={d.teamStreak > 0 ? <Tag tone="accent2"><Flame aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />team {d.teamStreak}</Tag> : undefined} />
      <motion.ul variants={stagger(0.03)} initial="hidden" animate="show" className="m-0 flex list-none flex-col rounded-[28px] bg-surface p-0 py-1">
        {members.map((m) => (
          <motion.li key={m.person.id} variants={fadeUp} layout>
            <TeamRow m={m} onOpen={() => (m.isMe ? void navigate({ to: '/', search: {} }) : void navigate({ to: '/team/$memberId', params: { memberId: m.person.id }, search: {} }))} />
          </motion.li>
        ))}
        {pulseOn && d.anonymisedCount > 0 && (
          <li className="flex min-h-14 items-center gap-3 px-4 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700">
              <Users aria-hidden className="h-5 w-5" strokeWidth={2.75} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">
                {d.anonymisedCount} teammate{d.anonymisedCount === 1 ? '' : 's'}
              </span>
              <span className="text-[12px] text-neutral-700">
                {d.anonymisedPulse ? `Avg consistency ${Math.round(d.anonymisedPulse.avgConsistency)} · ${d.anonymisedPulse.sessions} sessions this week` : 'Keeping their pulse private'}
              </span>
            </span>
          </li>
        )}
      </motion.ul>
      {pulseOn && (
        <div className="flex min-h-14 items-center gap-3 rounded-[28px] bg-surface px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-bold">Join team pulse</span>
            <span className="text-[12px] text-neutral-700">Compare consistency and sessions with teammates who also join. Weight is never shared.</span>
          </span>
          <Toggle label="Join team pulse" checked={d.myPulseOptIn} onChange={(v) => optIn.mutate(v)} disabled={optIn.isPending} />
        </div>
      )}
    </>
  );
}

function TeamRow({ m, onOpen }: { m: TeamMemberSummary; onOpen: () => void }) {
  const name = m.isMe ? 'You' : firstName(m.person.name);
  const spoken = `${m.person.name}${m.isMe ? ' (you)' : ''}: ${m.logged ? `${m.bandLabel ?? 'logging'}, ${m.mealsLogged} meal${m.mealsLogged === 1 ? '' : 's'} logged` : 'not logged yet'}, streak ${m.streak}${m.pulse ? `, consistency ${m.pulse.consistencyWord}` : ''}`;
  return (
    <button type="button" onClick={onOpen} aria-label={spoken} className="flex min-h-16 w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left active:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]">
      <Avatar name={m.person.name} initials={m.person.initials} url={m.person.avatarUrl} size={42} ring active={m.logged} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <span className="truncate">{name}</span>
          {m.streak > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-accent-700">
              <Flame aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
              {m.streak}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-neutral-700">
          <span>{m.logged ? `${m.mealsLogged} meal${m.mealsLogged === 1 ? '' : 's'} logged` : 'Not logged yet'}</span>
          {m.pulse && (
            <span>
              · {m.pulse.consistencyWord} {Math.round(m.pulse.consistencyScore)} · {m.pulse.sessions} sessions
            </span>
          )}
        </span>
      </span>
      {m.logged && m.band && m.bandLabel ? <BandPill band={{ band: m.band, label: m.bandLabel, icon: ICON[m.band] }} /> : <Tag>—</Tag>}
      <ChevronRight aria-hidden className="h-4 w-4 text-neutral-600" strokeWidth={2.75} />
    </button>
  );
}
