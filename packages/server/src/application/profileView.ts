import { and, desc, eq } from 'drizzle-orm';
import { STREAK_KINDS, type AwardKey, type MemberProfileResponse, type PersonalRecord, type StreakDto } from '@clubhouse/contracts';
import { badgeFor, isOnVacation, localDateOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { boardView } from './board';
import { memberClock } from './clockCtx';
import { getHabitDay } from './habits';
import { imageUrlMap } from './images';
import { RECORD_LABELS } from './progress';
import { getTeam } from './team';
import { personRef } from './teamView';

/**
 * A teammate's profile: their streaks and bests, personal records, badges, how they're doing on the board, and their
 * habits streak. The same privacy as everywhere else: never weight, calories or foods; habit names only when they share
 * habits; nothing from the board when they've left themselves off it.
 */
export async function memberProfile(c: Container, viewer: AuthUser, memberId: string): Promise<MemberProfileResponse> {
  const [hit] = await c.db
    .select({ user: s.users, profile: s.profiles })
    .from(s.users)
    .innerJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(and(eq(s.users.id, memberId), eq(s.users.teamId, viewer.teamId), eq(s.users.status, 'active')))
    .limit(1);
  if (!hit) throw notFound('Member not found.');
  const { user: u, profile: p } = hit;
  const isMe = u.id === viewer.id;
  const team = await getTeam(c, viewer.teamId);
  const tz = u.timezone || team.timezone;
  const { today } = memberClock(c, tz);
  const onVacation = isOnVacation(p.vacationRanges, today);
  const sharesHabits = isMe || !!p.habitPrefs?.share;

  const [avatars, states, records, badges, habitDay, board] = await Promise.all([
    imageUrlMap(c, [u.avatarImageId]),
    c.db.query.streakStates.findMany({ where: eq(s.streakStates.userId, u.id) }),
    c.db.query.personalRecords.findMany({ where: eq(s.personalRecords.userId, u.id) }),
    c.db.query.userBadges.findMany({ where: eq(s.userBadges.userId, u.id), orderBy: (t, { asc }) => [asc(t.earnedAt)] }),
    getHabitDay(c, { id: u.id, teamId: u.teamId, timezone: tz }, today).catch(() => null),
    boardPart(c, viewer, u.id, isMe || p.privacy.showOnBoard !== false, team.settings.featureFlags.leaderboard),
  ]);

  return {
    person: personRef(u, avatars, 'full'),
    isMe,
    joinedOn: localDateOf(u.onboardedAt ?? u.createdAt, tz),
    onVacation,
    shares: { fullLogs: isMe || p.privacy.teammatesSee === 'full', habits: sharesHabits },
    streaks: STREAK_KINDS.map((kind) => {
      const st = states.find((x) => x.kind === kind);
      return { kind, current: st?.current ?? 0, best: st?.best ?? 0, status: onVacation ? 'vacation' : ((st?.status ?? 'active') as StreakDto['status']) };
    }),
    records: records
      .filter((r): r is typeof r & { record: PersonalRecord } => r.record in RECORD_LABELS)
      .map((r) => ({ record: r.record, label: RECORD_LABELS[r.record], value: r.value, unit: r.unit, date: r.achievedOn })),
    badges: badges.map((b) => {
      const meta = badgeFor(b.milestone);
      return { kind: b.kind, days: b.milestone, name: meta.name, emoji: meta.emoji, earnedAt: b.earnedAt.toISOString() };
    }),
    board,
    habits:
      habitDay && (habitDay.total > 0 || habitDay.streak.best > 0)
        ? { doneToday: habitDay.done, totalToday: habitDay.total, streak: habitDay.streak, keptToday: sharesHabits ? habitDay.items.filter((i) => i.done).map((i) => i.name) : null }
        : null,
  };
}

async function boardPart(c: Container, viewer: AuthUser, memberId: string, visible: boolean, enabled: boolean): Promise<MemberProfileResponse['board']> {
  if (!enabled) return null;
  if (!visible) return { hidden: true, week: null, crown: false, solid: null, weeksRanked: 0, bestWeek: null, wins: 0, podiums: 0, awards: [] };
  const [view, weeks, results] = await Promise.all([
    boardView(c, viewer),
    c.db.query.boardWeeks.findMany({ where: and(eq(s.boardWeeks.userId, memberId), eq(s.boardWeeks.final, true)), orderBy: [desc(s.boardWeeks.weekStart)] }),
    c.db.query.boardWeekResults.findMany({ where: eq(s.boardWeekResults.teamId, viewer.teamId) }),
  ]);
  const row = view.rows.find((r) => r.person.id === memberId);
  const solid = view.solid.find((r) => r.person.id === memberId);
  const ranked = weeks.filter((w) => w.status === 'ranked');
  const best = ranked.reduce<(typeof ranked)[number] | null>((b, w) => (!b || w.points > b.points ? w : b), null);
  const awards = new Map<AwardKey, number>();
  for (const r of results) for (const a of r.awards) if (a.userId === memberId) awards.set(a.key, (awards.get(a.key) ?? 0) + 1);
  return {
    hidden: false,
    week: row ? { number: view.week.number, rank: row.rank, points: row.points, status: row.status } : null,
    crown: !!row?.crown || !!solid?.crown,
    solid: solid ? { solidDays: solid.solidDays, eligibleDays: solid.eligibleDays } : null,
    weeksRanked: ranked.length,
    bestWeek: best && best.points > 0 ? { points: best.points, weekStart: best.weekStart } : null,
    wins: ranked.filter((w) => w.finalRank === 1).length,
    podiums: ranked.filter((w) => w.finalRank != null && w.finalRank <= 3).length,
    awards: [...awards.entries()].map(([key, count]) => ({ key, count })),
  };
}
