import { and, eq, isNull } from 'drizzle-orm';
import { STREAK_KINDS, type MomentumResponse, type StreakDto, type StreakKind } from '@clubhouse/contracts';
import { badgeFor, isOnVacation } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { loadProfile, profileToDto } from './profile';
import { getTeam } from './team';
import { crewFor } from './today';

/** APP-PROG-07: streaks, grace, team streak, badges and vacation in one payload. */
export async function getMomentum(c: Container, user: AuthUser): Promise<MomentumResponse> {
  const clock = memberClock(c, user.timezone);
  const [team, profile, states, teamRow, badges, crew] = await Promise.all([
    getTeam(c, user.teamId),
    loadProfile(c, user.id),
    c.db.query.streakStates.findMany({ where: eq(s.streakStates.userId, user.id) }),
    c.db.query.teamStreaks.findFirst({ where: eq(s.teamStreaks.teamId, user.teamId) }),
    c.db.query.userBadges.findMany({ where: eq(s.userBadges.userId, user.id), orderBy: (t, { asc }) => [asc(t.earnedAt)] }),
    crewFor(c, user.teamId, clock.today),
  ]);
  const onVacation = isOnVacation(profile.vacationRanges, clock.today);
  const streaks = Object.fromEntries(
    STREAK_KINDS.map((kind) => {
      const st = states.find((x) => x.kind === kind);
      const dto: StreakDto = {
        kind,
        current: st?.current ?? 0,
        best: st?.best ?? 0,
        status: onVacation ? 'vacation' : ((st?.status ?? 'active') as StreakDto['status']),
        graceLeft: st?.graceLeft ?? 0,
        pausedSince: st?.pausedSince ?? null,
        atRisk: st?.atRisk ?? false,
        history: (st?.history ?? []).slice(kind === 'activity' ? -12 : -21),
      };
      return [kind, dto];
    }),
  ) as Record<StreakKind, StreakDto>;

  const logging = streaks.logging;
  const milestones = [...team.settings.streaks.milestones].sort((a, b) => a - b);
  const next = milestones.find((m) => m > logging.current);
  const vacation = profileToDto(profile, user.timezone, clock.today, team.settings.streaks.vacationDaysPerQuarter);
  const active = profile.vacationRanges.find((r) => r.from <= clock.today && r.to >= clock.today) ?? profile.vacationRanges.find((r) => r.from > clock.today) ?? null;

  return {
    today: clock.today,
    streaks,
    team: { current: teamRow?.current ?? 0, best: teamRow?.best ?? 0, status: teamRow?.status ?? 'active', enabled: team.settings.streaks.teamStreakEnabled },
    badges: badges.map((b) => {
      const meta = badgeFor(b.milestone);
      return { kind: b.kind, days: b.milestone, name: meta.name, emoji: meta.emoji, earnedAt: b.earnedAt.toISOString(), seen: !!b.seenAt };
    }),
    nextMilestone: next ? { days: next, name: badgeFor(next).name, emoji: badgeFor(next).emoji, inDays: next - logging.current } : null,
    graceBankMax: team.settings.streaks.graceBankMax,
    vacation: {
      active: onVacation,
      from: active?.from ?? null,
      until: active?.to ?? null,
      daysLeftThisQuarter: vacation.vacationDaysLeftThisQuarter,
      quota: team.settings.streaks.vacationDaysPerQuarter,
    },
    crew,
  };
}

export async function markBadgesSeen(c: Container, user: AuthUser) {
  await c.db.update(s.userBadges).set({ seenAt: c.clock.now() }).where(and(eq(s.userBadges.userId, user.id), isNull(s.userBadges.seenAt)));
}
