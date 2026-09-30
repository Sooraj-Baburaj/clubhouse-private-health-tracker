import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { StreakKind } from '@clubhouse/contracts';
import {
  addDays,
  badgeFor,
  computeDailyStreak,
  computeTeamStreak,
  computeWeeklyStreak,
  dateRange,
  isInRangeDay,
  isOnVacation,
  milestonesCrossed,
  startOfLocalDay,
  sumTotals,
  teamDayQualifies,
  weekStartOf,
  type NutrientTotals,
  type WeekFact,
} from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { attributeLogs, activePlanItems } from './plans';
import { effectiveTargets } from './targets';
import { getTeam } from './team';

const WINDOW_DAYS = 400;

/** SYS-STREAK / APP-HOME-42: a log counts for momentum unless it was added more than 48 h after its day ended. */
export function isAddedLate(date: string, tz: string, createdAt: Date): boolean {
  const dayEnd = startOfLocalDay(addDays(date, 1), tz);
  return createdAt.getTime() - dayEnd.getTime() > 48 * 3600_000;
}

/** Materialise one member-day: logged (counting logs only), totals, burn and whether calories ended in range. */
export async function computeDayFacts(c: Container, userId: string, date: string) {
  const [foods, acts, weights, profile, team] = await Promise.all([
    c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, userId), eq(s.foodLogs.date, date), isNull(s.foodLogs.deletedAt)) }),
    c.db.query.activityLogs.findMany({ where: and(eq(s.activityLogs.userId, userId), eq(s.activityLogs.date, date), isNull(s.activityLogs.deletedAt)) }),
    c.db.query.weightEntries.findMany({ where: and(eq(s.weightEntries.userId, userId), eq(s.weightEntries.date, date), isNull(s.weightEntries.deletedAt)) }),
    c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) }),
    c.db.select({ teamId: s.users.teamId }).from(s.users).where(eq(s.users.id, userId)).then(async (r) => (r[0] ? getTeam(c, r[0].teamId) : null)),
  ]);
  const totals: NutrientTotals = sumTotals(foods.map((f) => f.totals));
  const burned = acts.reduce((a, x) => a + x.kcalBurned, 0);
  const countedFood = foods.some((f) => !f.addedLate);
  const logged = countedFood || acts.some((a) => !a.addedLate) || weights.some((w) => !w.addedLate);
  const existing = await c.db.query.dayFacts.findFirst({ where: and(eq(s.dayFacts.userId, userId), eq(s.dayFacts.date, date)) });
  const eff = profile ? effectiveTargets(profile) : null;
  const targets: NutrientTotals | null = existing?.targets ?? (eff ? { kcal: eff.kcal, protein: eff.protein, carbs: eff.carbs, fat: eff.fat, fibre: eff.fibre } : null);
  const thresholds = { ...(team?.settings.thresholds ?? {}), ...(profile?.thresholdsOverride ?? {}) } as NonNullable<typeof team>['settings']['thresholds'];
  const budget = targets ? targets.kcal + (profile?.eatBackExercise ? burned : 0) : 0;
  const inRange = !!targets && isInRangeDay(totals.kcal, budget, countedFood, thresholds);
  const row = { userId, date, logged, foodLogged: foods.length > 0, activityLogged: acts.length > 0, inRange, kcalEaten: totals.kcal, kcalBurned: burned, kcalTarget: targets?.kcal ?? null, totals, targets, computedAt: c.clock.now() };
  await c.db.insert(s.dayFacts).values(row).onConflictDoUpdate({ target: [s.dayFacts.userId, s.dayFacts.date], set: row });
  return row;
}

export interface StreakChange {
  kind: StreakKind;
  before: number;
  after: number;
  statusBefore: string;
  statusAfter: string;
  resumed: boolean;
  milestones: number[];
}

/**
 * Recompute all three streaks for a member from day facts (SYS-STREAK-10). `today` is the member-local date; the
 * nightly job passes the same date after rollover so both paths produce identical history for completed days.
 */
export async function recomputeMemberStreaks(c: Container, userId: string, today: string): Promise<StreakChange[]> {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) return [];
  const team = await getTeam(c, user.teamId);
  const settings = team.settings.streaks;
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const vacations = profile?.vacationRanges ?? [];
  const from = addDays(today, -WINDOW_DAYS);
  const facts = await c.db.query.dayFacts.findMany({ where: and(eq(s.dayFacts.userId, userId), gte(s.dayFacts.date, from), lte(s.dayFacts.date, today)) });
  const byDate = new Map(facts.map((f) => [f.date, f]));
  const states = await c.db.query.streakStates.findMany({ where: eq(s.streakStates.userId, userId) });
  const prev = new Map(states.map((st) => [st.kind, st]));
  const changes: StreakChange[] = [];

  const dates = dateRange(from, today);
  const daily = (kind: 'logging' | 'in_range') =>
    computeDailyStreak({
      facts: dates.map((d) => ({ date: d, qualifies: kind === 'logging' ? !!byDate.get(d)?.logged : !!byDate.get(d)?.inRange, vacation: isOnVacation(vacations, d) })),
      from,
      today,
      todayCounts: kind === 'logging',
      settings,
      previousBest: prev.get(kind)?.best ?? 0,
    });

  const save = async (kind: StreakKind, r: { current: number; best: number; status: string; graceLeft?: number; pausedSince?: string | null; lastCountedDate?: string | null; atRisk?: boolean; history: { date?: string; weekStart?: string; state: string }[] }) => {
    const p = prev.get(kind);
    const before = p?.current ?? 0;
    const values = {
      userId,
      kind,
      current: r.current,
      best: r.best,
      status: r.status,
      graceLeft: r.graceLeft ?? 0,
      pausedSince: r.pausedSince ?? null,
      lastCountedDate: r.lastCountedDate ?? null,
      atRisk: r.atRisk ?? false,
      history: r.history.slice(-90).map((h) => ({ date: h.date ?? h.weekStart!, state: h.state })),
      computedFor: today,
      updatedAt: c.clock.now(),
    };
    await c.db.insert(s.streakStates).values(values).onConflictDoUpdate({ target: [s.streakStates.userId, s.streakStates.kind], set: values });
    const milestones = kind === 'activity' ? [] : milestonesCrossed(before, r.current, settings.milestones);
    changes.push({ kind, before, after: r.current, statusBefore: p?.status ?? 'active', statusAfter: r.status, resumed: p?.status === 'paused' && r.status === 'active' && r.current > before, milestones });
    for (const m of milestones) {
      await c.db.insert(s.userBadges).values({ userId, kind, milestone: m }).onConflictDoNothing();
    }
  };

  await save('logging', daily('logging'));
  await save('in_range', daily('in_range'));

  // Weekly activity streak from the current plan (SYS-STREAK-06).
  const { plan, items } = await activePlanItems(c, userId);
  const weeklyItems = items.filter((i) => (i.perWeek ?? 0) > 0);
  if (plan && weeklyItems.length) {
    const currentWeek = weekStartOf(today);
    const firstWeek = weekStartOf(plan.createdAt.toISOString().slice(0, 10));
    const start = firstWeek > addDays(currentWeek, -7 * 52) ? firstWeek : addDays(currentWeek, -7 * 52);
    const logs = await c.db
      .select({ id: s.activityLogs.id, typeId: s.activityLogs.typeId, planItemId: s.activityLogs.planItemId, date: s.activityLogs.date })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, userId), gte(s.activityLogs.date, start), isNull(s.activityLogs.deletedAt)));
    const rest = await c.db.query.restWeeks.findMany({ where: and(eq(s.restWeeks.userId, userId), gte(s.restWeeks.weekStart, start)) });
    const weeks: WeekFact[] = [];
    for (let w = start; w <= currentWeek; w = addDays(w, 7)) {
      const wl = logs.filter((l) => l.date >= w && l.date <= addDays(w, 6));
      const counts = attributeLogs(weeklyItems, wl);
      const met = weeklyItems.every((i) => (counts.get(i.id) ?? 0) >= (i.perWeek ?? 0));
      const restWeek = rest.find((r) => r.weekStart === w && (r.status === 'approved' || r.status === 'admin' || (r.status === 'pending' && w === currentWeek)));
      const vacDays = dateRange(w, addDays(w, 6)).filter((d) => isOnVacation(vacations, d)).length;
      weeks.push({ weekStart: w, met, frozen: !!restWeek || vacDays >= 3 });
    }
    await save('activity', computeWeeklyStreak(weeks, currentWeek, prev.get('activity')?.best ?? 0));
  } else {
    await save('activity', { current: 0, best: prev.get('activity')?.best ?? 0, status: 'active', history: [] });
  }
  return changes;
}

/** SYS-STREAK-07: recompute the team streak (days where every active member not on vacation logged). */
export async function recomputeTeamStreak(c: Container, teamId: string, today: string) {
  const team = await getTeam(c, teamId);
  if (!team.settings.streaks.teamStreakEnabled) return null;
  const from = addDays(today, -180);
  const members = await c.db
    .select({ id: s.users.id, status: s.users.status, createdAt: s.users.createdAt, deactivatedAt: s.users.deactivatedAt, vacations: s.profiles.vacationRanges })
    .from(s.users)
    .innerJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .where(eq(s.users.teamId, teamId));
  const facts = await c.db
    .select({ userId: s.dayFacts.userId, date: s.dayFacts.date, logged: s.dayFacts.logged })
    .from(s.dayFacts)
    .innerJoin(s.users, eq(s.users.id, s.dayFacts.userId))
    .where(and(eq(s.users.teamId, teamId), gte(s.dayFacts.date, from), lte(s.dayFacts.date, today)));
  const logged = new Set(facts.filter((f) => f.logged).map((f) => `${f.userId}:${f.date}`));
  const days = dateRange(from, today).map((date) => ({
    date,
    qualifies: teamDayQualifies(
      members.map((m) => {
        const joined = m.createdAt.toISOString().slice(0, 10) <= date;
        const active = joined && (m.status === 'active' || (m.deactivatedAt != null && m.deactivatedAt.toISOString().slice(0, 10) > date));
        return { active, onVacation: isOnVacation(m.vacations, date), logged: logged.has(`${m.id}:${date}`) };
      }),
    ),
  }));
  const prev = await c.db.query.teamStreaks.findFirst({ where: eq(s.teamStreaks.teamId, teamId) });
  // Today only counts once everyone has logged; an incomplete today is pending, not a miss.
  const r = computeTeamStreak(days, from, today, team.settings.streaks, prev?.best ?? 0);
  const values = { teamId, current: r.current, best: r.best, status: r.status, computedFor: today, history: r.history.slice(-60).map((h) => ({ date: h.date, state: h.state })), updatedAt: c.clock.now() };
  await c.db.insert(s.teamStreaks).values(values).onConflictDoUpdate({ target: s.teamStreaks.teamId, set: values });
  return { before: prev?.current ?? 0, after: r.current, milestones: milestonesCrossed(prev?.current ?? 0, r.current, team.settings.streaks.teamMilestones), todayFull: days.at(-1)?.qualifies === true };
}

export async function teamAllLogged(c: Container, teamId: string, date: string): Promise<boolean> {
  const rows = await c.db
    .select({ id: s.users.id, vac: s.profiles.vacationRanges, logged: sql<boolean>`coalesce(${s.dayFacts.logged}, false)` })
    .from(s.users)
    .innerJoin(s.profiles, eq(s.profiles.userId, s.users.id))
    .leftJoin(s.dayFacts, and(eq(s.dayFacts.userId, s.users.id), eq(s.dayFacts.date, date)))
    .where(and(eq(s.users.teamId, teamId), eq(s.users.status, 'active')));
  return teamDayQualifies(rows.map((r) => ({ active: true, onVacation: isOnVacation(r.vac, date), logged: r.logged }))) === true;
}

export { badgeFor };
