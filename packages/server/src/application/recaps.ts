import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { addDays, dayCalorieClass, fmtInt, pluralize } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { postSystemMessage } from './chat';
import { notifyUser } from './notify';
import { consistencyWeeks, currentTargets, dayAggregates, dayTargets, thresholdsFor } from './progress';
import { getTeam } from './team';

type RecapRow = typeof s.weeklyRecaps.$inferSelect;

/** Team-wide numbers for the week (one short, non-identifying line shared by every member's recap). */
export async function teamWeekFact(c: Container, teamId: string, weekStart: string): Promise<{ text: string; meals: number; sessions: number; loggers: number }> {
  const end = addDays(weekStart, 6);
  const [f] = await c.db
    .select({ meals: sql<number>`count(*)::int`, loggers: sql<number>`count(distinct ${s.foodLogs.userId})::int` })
    .from(s.foodLogs)
    .where(and(eq(s.foodLogs.teamId, teamId), gte(s.foodLogs.date, weekStart), lte(s.foodLogs.date, end), isNull(s.foodLogs.deletedAt)));
  const [a] = await c.db
    .select({ sessions: sql<number>`count(*)::int`, minutes: sql<number>`coalesce(sum(${s.activityLogs.durationMin}), 0)::float8` })
    .from(s.activityLogs)
    .where(and(eq(s.activityLogs.teamId, teamId), gte(s.activityLogs.date, weekStart), lte(s.activityLogs.date, end), isNull(s.activityLogs.deletedAt)));
  const meals = f?.meals ?? 0;
  const sessions = a?.sessions ?? 0;
  const loggers = f?.loggers ?? 0;
  const text =
    meals === 0 && sessions === 0
      ? 'A quiet week for the crew. Next week is a fresh page.'
      : `The crew logged ${pluralize(meals, 'meal')} and ${pluralize(sessions, 'workout')}${a?.minutes ? ` (${fmtInt(a.minutes)} active minutes)` : ''} this week.`;
  return { text, meals, sessions, loggers };
}

/**
 * Templated weekly recap for one member (SYS-NOTIF weekly recap, APP-PROG-09). Pure logic-engine numbers, warm copy,
 * never judgemental. Idempotent: an existing recap for the week is returned as is.
 */
export async function buildWeeklyRecap(c: Container, user: AuthUser, weekStart: string, today: string, teamFact: string): Promise<{ row: RecapRow; created: boolean }> {
  const existing = await c.db.query.weeklyRecaps.findFirst({ where: and(eq(s.weeklyRecaps.userId, user.id), eq(s.weeklyRecaps.weekStart, weekStart)) });
  if (existing) return { row: existing, created: false };
  const end = addDays(weekStart, 6);
  const [profile, team] = await Promise.all([c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) }), getTeam(c, user.teamId)]);
  const [aggs, targets, weights, streak, consistency] = await Promise.all([
    dayAggregates(c, user.id, weekStart, end),
    dayTargets(c, user.id, weekStart, end),
    c.db.query.weightEntries.findMany({ where: and(eq(s.weightEntries.userId, user.id), gte(s.weightEntries.date, weekStart), lte(s.weightEntries.date, end), isNull(s.weightEntries.deletedAt)), orderBy: (t, { asc }) => [asc(t.date)] }),
    c.db.query.streakStates.findFirst({ where: and(eq(s.streakStates.userId, user.id), eq(s.streakStates.kind, 'logging')) }),
    consistencyWeeks(c, user.id, [weekStart], today < end ? today : end),
  ]);
  const thresholds = thresholdsFor(team, profile);
  const cur = profile ? currentTargets(profile) : null;
  const days = [...aggs.values()];
  const foodDays = days.filter((d) => d.foodLogs > 0);
  const inRange = foodDays.filter((d) => {
    const t = targets.get(d.date)?.kcal ?? cur?.kcal ?? 0;
    return t > 0 && dayCalorieClass(d.eaten.kcal, t + (profile?.eatBackExercise ? d.burned : 0), thresholds) === 'in';
  }).length;
  const avgKcal = foodDays.length ? Math.round(foodDays.reduce((a, d) => a + d.eaten.kcal, 0) / foodDays.length) : 0;
  const proteinLow = foodDays.filter((d) => {
    const t = targets.get(d.date)?.protein ?? cur?.protein ?? 0;
    return t > 0 && d.eaten.protein < t * 0.8;
  }).length;
  const fibreLow = foodDays.filter((d) => {
    const t = targets.get(d.date)?.fibre ?? cur?.fibre ?? 0;
    return t > 0 && d.eaten.fibre < t * 0.7;
  }).length;
  const sessions = days.reduce((a, d) => a + d.sessions, 0);
  const minutes = Math.round(days.reduce((a, d) => a + d.minutes, 0));
  const weightChange = weights.length >= 2 ? Math.round((weights.at(-1)!.weightKg - weights[0]!.weightKg) * 10) / 10 : null;
  const score = consistency[0]?.score ?? 0;
  const word = consistency[0]?.word ?? 'rough week';

  let highlight: string;
  if (foodDays.length === 7) highlight = 'You logged all seven days this week. That’s the whole game.';
  else if (inRange >= 4) highlight = `${pluralize(inRange, 'day')} in your calorie range this week. Nicely steady.`;
  else if (sessions >= 3) highlight = `${pluralize(sessions, 'workout')} and ${fmtInt(minutes)} active minutes this week.`;
  else if ((streak?.current ?? 0) >= 3) highlight = `Your logging momentum is at ${streak!.current} days and counting.`;
  else if (foodDays.length > 0) highlight = `You showed up on ${pluralize(foodDays.length, 'day')} this week. Every log counts.`;
  else highlight = 'A quiet week. A single log tomorrow gets things moving again.';

  let tryNext: string;
  if (foodDays.length < 5) tryNext = 'Try logging something every day next week, even just breakfast.';
  else if (proteinLow >= 3) tryNext = 'Add a protein to breakfast: eggs, paneer, curd or a dal.';
  else if (fibreLow >= 3) tryNext = 'Add a fruit or a bowl of sabzi to one meal a day for more fibre.';
  else if (inRange < 4) tryNext = 'Aim for four days in range next week; the Diet tab shows what fits.';
  else if (sessions < 2) tryNext = 'Fit in two short walks or workouts next week.';
  else tryNext = 'Keep the rhythm going. Same again next week?';

  const stats: Record<string, number | string> = {
    daysLogged: foodDays.length,
    daysInRange: inRange,
    avgKcal,
    sessions,
    activeMinutes: minutes,
    consistencyScore: score,
    consistencyWord: word,
    streak: streak?.current ?? 0,
  };
  if (weightChange != null) stats.weightChangeKg = weightChange;
  const [row] = await c.db.insert(s.weeklyRecaps).values({ userId: user.id, weekStart, highlight, tryNext, teamFact, stats }).onConflictDoNothing().returning();
  if (!row) {
    const again = await c.db.query.weeklyRecaps.findFirst({ where: and(eq(s.weeklyRecaps.userId, user.id), eq(s.weeklyRecaps.weekStart, weekStart)) });
    return { row: again!, created: false };
  }
  return { row, created: true };
}

/** Deliver a freshly built recap: inbox + push (respecting the member's weekly_recap preference). */
export async function notifyRecap(c: Container, user: AuthUser, row: RecapRow) {
  await notifyUser(c, user.id, {
    type: 'weekly_recap',
    title: 'Your week in Clubhouse',
    body: row.highlight,
    url: '/progress?section=recaps',
    tag: 'weekly-recap',
    dedupeKey: `recap:${user.id}:${row.weekStart}`,
  });
}

/** One team-level recap post in chat per week (never names anyone's numbers). */
export async function postTeamRecap(c: Container, teamId: string, weekStart: string, fact: string) {
  await postSystemMessage(c, teamId, { systemKind: 'weekly_recap', body: `Week wrap 🧾 ${fact} Your personal recap is in Progress.`, meta: { weekStart } });
}
