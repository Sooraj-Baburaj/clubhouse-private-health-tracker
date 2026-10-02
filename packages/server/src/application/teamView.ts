import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { MemberDayResponse, PersonRef, TeamMemberSummary, TeamSummaryResponse } from '@clubhouse/contracts';
import { localDateOf, localTimeOf, weekStartOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { initials } from '../lib/crypto';
import { notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { getHabitDay } from './habits';
import { imageUrlMap, pick, type ImageUrls } from './images';
import { logsForDate } from './logs';
import { consistencyWeeks, currentTargets, dayAggregates, dayKcalBand, dayTargets, thresholdsFor, type DayAgg } from './progress';
import { getTeam } from './team';

type UserRow = typeof s.users.$inferSelect;
type ProfileRow = typeof s.profiles.$inferSelect;

function personRef(u: UserRow, avatars: Map<string, ImageUrls>): PersonRef {
  const img = pick(avatars, u.avatarImageId);
  return { id: u.id, name: u.displayName, initials: initials(u.displayName), avatarUrl: img.thumbUrl ?? img.url };
}

interface MemberDayFacts {
  agg: DayAgg | undefined;
  logged: boolean;
  target: number | null;
  band: ReturnType<typeof dayKcalBand>;
  streak: number;
}

/** One member's day as teammates may see it: totals, band and counts only — never weight. */
async function memberDayFacts(c: Container, u: UserRow, p: ProfileRow, date: string, teamTz: string): Promise<MemberDayFacts> {
  const team = await getTeam(c, u.teamId);
  const tz = u.timezone || teamTz;
  const now = c.clock.now();
  const clock = { today: localDateOf(now, tz), localTime: localTimeOf(now, tz) };
  const [aggs, targets, weight, streak] = await Promise.all([
    dayAggregates(c, u.id, date, date),
    dayTargets(c, u.id, date, date),
    c.db.select({ n: sql<number>`count(*)::int` }).from(s.weightEntries).where(and(eq(s.weightEntries.userId, u.id), eq(s.weightEntries.date, date), isNull(s.weightEntries.deletedAt))),
    c.db.query.streakStates.findFirst({ where: and(eq(s.streakStates.userId, u.id), eq(s.streakStates.kind, 'logging')) }),
  ]);
  const agg = aggs.get(date);
  const target = targets.get(date)?.kcal ?? currentTargets(p)?.kcal ?? null;
  const band = dayKcalBand(agg, target, p.eatBackExercise, thresholdsFor(team, p), clock);
  return { agg, logged: (agg?.foodLogs ?? 0) > 0 || (agg?.sessions ?? 0) > 0 || (weight[0]?.n ?? 0) > 0, target, band, streak: streak?.current ?? 0 };
}

/** Team tab (APP-PROG-07/08): per-member day rows; the consistency pulse only for members who opted in. */
export async function teamSummary(c: Container, user: AuthUser, dateParam?: string): Promise<TeamSummaryResponse> {
  const team = await getTeam(c, user.teamId);
  const { today } = memberClock(c, user.timezone);
  const date = dateParam ?? today;
  const rows = await c.db
    .select({ user: s.users, profile: s.profiles })
    .from(s.users)
    .innerJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(and(eq(s.users.teamId, user.teamId), eq(s.users.status, 'active')))
    .orderBy(asc(s.users.displayName));
  const visible = rows.filter((r) => r.user.onboardedAt || r.user.id === user.id);
  const avatars = await imageUrlMap(c, visible.map((r) => r.user.avatarImageId));
  const pulseOn = team.settings.featureFlags.teamPulse;
  const me = visible.find((r) => r.user.id === user.id);
  const myPulseOptIn = !!me?.profile.privacy.teamPulseOptIn;
  const weekStart = weekStartOf(date);

  const members: TeamMemberSummary[] = [];
  const anonymous: { score: number; sessions: number }[] = [];
  for (const { user: u, profile: p } of visible) {
    const f = await memberDayFacts(c, u, p, date, team.timezone);
    const isMe = u.id === user.id;
    let pulse: TeamMemberSummary['pulse'] = null;
    if (pulseOn) {
      const memberToday = localDateOf(c.clock.now(), u.timezone || team.timezone);
      const [w] = await consistencyWeeks(c, u.id, [weekStart], memberToday < date ? memberToday : date);
      const stat = { consistencyWord: w?.word ?? 'rough week', consistencyScore: w?.score ?? 0, sessions: w?.sessions ?? 0 };
      if (p.privacy.teamPulseOptIn) pulse = stat;
      else if (!isMe) anonymous.push({ score: stat.consistencyScore, sessions: stat.sessions });
    }
    members.push({
      person: personRef(u, avatars),
      isMe,
      logged: f.logged,
      mealsLogged: f.agg?.slots.length ?? 0,
      bandLabel: f.band?.label ?? null,
      band: f.band?.band ?? null,
      streak: f.streak,
      pulse,
      canViewFull: isMe || p.privacy.teammatesSee === 'full',
    });
  }
  members.sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));
  const teamStreak = team.settings.streaks.teamStreakEnabled ? ((await c.db.query.teamStreaks.findFirst({ where: eq(s.teamStreaks.teamId, user.teamId) }))?.current ?? 0) : 0;
  // Averages over fewer than two people would identify them, so they are withheld.
  const anonymisedPulse =
    anonymous.length >= 2
      ? { avgConsistency: Math.round(anonymous.reduce((a, x) => a + x.score, 0) / anonymous.length), sessions: Math.round((anonymous.reduce((a, x) => a + x.sessions, 0) / anonymous.length) * 10) / 10 }
      : null;
  return { date, members, anonymisedCount: pulseOn ? anonymous.length : 0, anonymisedPulse, teamStreak, myPulseOptIn };
}

/** Member sheet (APP-PROG-08): the summary always; the full timeline only when that member shares full logs. */
export async function memberDay(c: Container, user: AuthUser, memberId: string, dateParam?: string): Promise<MemberDayResponse> {
  const team = await getTeam(c, user.teamId);
  const row = await c.db
    .select({ user: s.users, profile: s.profiles })
    .from(s.users)
    .innerJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(and(eq(s.users.id, memberId), eq(s.users.teamId, user.teamId), eq(s.users.status, 'active')))
    .limit(1);
  const hit = row[0];
  if (!hit) throw notFound('Member not found.');
  const { user: u, profile: p } = hit;
  const date = dateParam ?? memberClock(c, user.timezone).today;
  const f = await memberDayFacts(c, u, p, date, team.timezone);
  const acts = await c.db
    .select({ name: s.activityTypes.name, minutes: s.activityLogs.durationMin })
    .from(s.activityLogs)
    .innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityLogs.typeId))
    .where(and(eq(s.activityLogs.userId, u.id), eq(s.activityLogs.date, date), isNull(s.activityLogs.deletedAt)))
    .orderBy(asc(s.activityLogs.loggedAt));
  const avatars = await imageUrlMap(c, [u.avatarImageId]);
  const isMe = u.id === user.id;
  let full: MemberDayResponse['full'] = null;
  if (isMe || p.privacy.teammatesSee === 'full') {
    const logs = await logsForDate(c, user, u.id, date);
    full = { foodLogs: logs.foodLogs, activityLogs: logs.activityLogs };
  }
  return {
    person: personRef(u, avatars),
    date,
    summary: {
      eaten: Math.round(f.agg?.eaten.kcal ?? 0),
      targetKcal: f.target,
      bandLabel: f.band?.label ?? null,
      band: f.band?.band ?? null,
      mealsLogged: f.agg?.slots.length ?? 0,
      burned: Math.round(f.agg?.burned ?? 0),
      activities: acts.map((a) => ({ typeName: a.name, durationMin: Math.round(a.minutes) })),
      streak: f.streak,
    },
    full,
    habits: await teammateHabits(c, { id: u.id, teamId: u.teamId, timezone: u.timezone || team.timezone }, date, isMe || !!p.habitPrefs?.share),
  };
}

/** Privacy: teammates see how many habits were kept; which ones only when the member shares them. */
async function teammateHabits(c: Container, member: { id: string; teamId: string; timezone: string }, date: string, showNames: boolean): Promise<MemberDayResponse['habits']> {
  const day = await getHabitDay(c, member, date).catch(() => null);
  if (!day || !day.total) return null;
  return { done: day.done, total: day.total, doneNames: showNames ? day.items.filter((i) => i.done).map((i) => i.name) : null };
}

