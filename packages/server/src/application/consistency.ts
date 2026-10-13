import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import type { ConsistencyDto, ConsistencyPoint, ConsistencyResponse } from '@clubhouse/contracts';
import {
  addDays,
  classifyProtein,
  consistencyScore,
  dateRange,
  dayCalorieClass,
  daysLeftInWeek,
  dayTallies,
  habitTally,
  isOnVacation,
  localDateOf,
  planWeekTally,
  weekStartOf,
  type ConsistencyDay,
  type ConsistencyResult,
  type HabitValues,
  type Tally,
} from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { habitRule, loadValues, memberHabits } from './habits';
import { activePlanItems, attributeLogs } from './plans';
import { currentTargets, dayAggregates, dayTargets, thresholdsFor } from './progress';
import { getTeam } from './team';

/* Consistency (SYS-CALC-33 v2; the rules live in domain/consistency.ts): weekly and monthly scores, their history. */

const WEEKS = 12;
const MONTHS = 6;

export interface Window {
  start: string;
  end: string;
}

export interface WindowConsistency extends ConsistencyResult, Window {
  /** Activity sessions logged in the window (any length), for the team pulse and recaps. */
  sessions: number;
}

export const monthStartOf = (date: string) => `${date.slice(0, 7)}-01`;
const nextMonth = (monthStart: string) => {
  const [y, m] = monthStart.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
export const monthEndOf = (date: string) => addDays(nextMonth(monthStartOf(date)), -1);

/**
 * Consistency for each window (a week or a month) of one member. Windows before they joined come back with a null
 * score; nothing after `today` is judged.
 */
export async function consistencyFor(c: Container, userId: string, windows: Window[], today: string): Promise<WindowConsistency[]> {
  if (!windows.length) return [];
  const [user, profile] = await Promise.all([c.db.query.users.findFirst({ where: eq(s.users.id, userId) }), c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) })]);
  if (!user || !profile) return [];
  const team = await getTeam(c, user.teamId);
  const tz = user.timezone || team.timezone;
  const joined = localDateOf(user.createdAt, tz);
  const firstDay = windows.reduce((m, w) => (w.start < m ? w.start : m), windows[0]!.start);
  // Whole weeks around the range: a month's first and last weeks are judged as weeks.
  const from = weekStartOf(firstDay);
  const lastDay = windows.reduce((m, w) => (w.end > m ? w.end : m), windows[0]!.end);
  const to = lastDay < today ? lastDay : today;
  const [aggs, targets, plan, acts, rest, habits] = await Promise.all([
    dayAggregates(c, userId, from, to),
    dayTargets(c, userId, from, to),
    activePlanItems(c, userId),
    c.db
      .select({ id: s.activityLogs.id, typeId: s.activityLogs.typeId, planItemId: s.activityLogs.planItemId, date: s.activityLogs.date })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, userId), gte(s.activityLogs.date, from), lte(s.activityLogs.date, to), isNull(s.activityLogs.deletedAt))),
    c.db.query.restWeeks.findMany({ where: and(eq(s.restWeeks.userId, userId), gte(s.restWeeks.weekStart, from)) }),
    memberHabits(c, userId, user.teamId),
  ]);
  const { byUser } = await loadValues(c, [userId], habits.map((h) => h.id), from, to);
  const values: HabitValues = byUser.get(userId) ?? new Map();
  const rules = habits.map(habitRule);
  const thresholds = thresholdsFor(team, profile);
  const cur = currentTargets(profile);
  const excluded = (d: string) => d < joined || isOnVacation(profile.vacationRanges, d);
  const items = plan.items.map((i) => ({ id: i.id, typeId: i.typeId, target: i.perWeek ?? Math.ceil((i.perMonth ?? 0) / 4), since: localDateOf(i.createdAt, tz) })).filter((i) => i.target > 0);

  const day = (date: string): ConsistencyDay => {
    const a = aggs.get(date);
    const t = targets.get(date) ?? cur;
    const logged = !!a && a.foodLogs > 0;
    const kcalTarget = t?.kcal ?? 0;
    return {
      date,
      foodLogged: logged,
      caloriesInRange: logged && kcalTarget > 0 && dayCalorieClass(a.eaten.kcal, kcalTarget + (profile.eatBackExercise ? a.burned : 0), thresholds) === 'in',
      proteinOnTrack: t && t.protein > 0 ? logged && classifyProtein(a.eaten.protein, t.protein, thresholds) === 'on' : null,
      excluded: excluded(date),
    };
  };

  /** One week of the plan: items set by its Monday, sessions in any order, nothing due on a break or in the joining week. */
  const planWeek = (w: string): Tally | null => {
    const its = items.filter((i) => i.since <= w);
    if (!its.length || w > today) return null;
    const days = dateRange(w, addDays(w, 6));
    const restWeek = rest.some((r) => r.weekStart === w && (r.status === 'approved' || r.status === 'admin'));
    if (restWeek || days.filter(excluded).length >= 3) return null;
    const counts = attributeLogs(its, acts.filter((l) => l.date >= w && l.date <= days[6]!));
    return planWeekTally(its.map((i) => ({ target: i.target, done: counts.get(i.id) ?? 0 })), daysLeftInWeek(w, today));
  };

  return windows.map((win) => {
    const end = win.end < today ? win.end : today;
    const sessions = acts.filter((l) => l.date >= win.start && l.date <= end).length;
    if (win.start > today || win.end < joined) return { ...consistencyScore({ logging: null, calories: null, protein: null, activity: null, habits: null }), ...win, sessions };
    const days = dateRange(win.start, end).map(day);
    // Each week counts for the share of its days inside the window (all of it for a week).
    const weeks: Tally[] = [];
    for (let w = weekStartOf(win.start); w <= end; w = addDays(w, 7)) {
      const t = planWeek(w);
      const share = dateRange(w, addDays(w, 6)).filter((d) => d >= win.start && d <= win.end).length / 7;
      if (t) weeks.push({ done: t.done * share, due: t.due * share });
    }
    const activity = weeks.length ? weeks.reduce((a, t) => ({ done: a.done + t.done, due: a.due + t.due })) : null;
    const r = consistencyScore({ ...dayTallies(days, today), activity, habits: habitTally(rules, values, win.start, win.end, today, excluded) });
    return { ...r, ...win, sessions };
  });
}

/** Weekly (Monday-start) consistency, for recaps and the team pulse. */
export function consistencyWeeks(c: Container, userId: string, weekStarts: string[], today: string) {
  return consistencyFor(c, userId, weekStarts.map((w) => ({ start: w, end: addDays(w, 6) })), today);
}

export function toDto(r: WindowConsistency, period: ConsistencyDto['period']): ConsistencyDto {
  const parts = {} as ConsistencyDto['parts'];
  for (const [k, p] of Object.entries(r.parts) as [keyof ConsistencyDto['parts'], ConsistencyResult['parts'][keyof ConsistencyResult['parts']]][]) {
    parts[k] = p ? { pct: p.pct, done: Math.round(p.done), due: Math.round(p.due), weight: p.weight } : null;
  }
  return { period, start: r.start, end: r.end, score: r.score, word: r.word, parts };
}

function windowsTo(today: string) {
  const week = weekStartOf(today);
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(week, -7 * (WEEKS - 1 - i))).map((w) => ({ start: w, end: addDays(w, 6) }));
  const months: Window[] = [];
  for (let m = monthStartOf(today), i = 0; i < MONTHS; i++) {
    months.unshift({ start: m, end: monthEndOf(m) });
    m = monthStartOf(addDays(m, -1));
  }
  return { weeks, months };
}

/**
 * A member's consistency: this week and month in full, and their history. With `viewer` (someone else looking), each
 * history point also carries the viewer's own score for the same week or month, judged on the viewer's today.
 */
export async function consistencyBundle(c: Container, member: { id: string; today: string }, viewer?: { id: string; today: string }): Promise<ConsistencyResponse> {
  const { weeks, months } = windowsTo(member.today);
  const [mine, theirs] = await Promise.all([
    consistencyFor(c, member.id, [...weeks, ...months], member.today),
    viewer ? consistencyFor(c, viewer.id, [...weeks, ...months], viewer.today) : Promise.resolve(null),
  ]);
  const point = (i: number): ConsistencyPoint => {
    const r = mine[i];
    return { start: (i < weeks.length ? weeks[i] : months[i - weeks.length])!.start, score: r?.score ?? null, ...(theirs ? { viewer: theirs[i]?.score ?? null } : {}) };
  };
  const empty = (w: Window): WindowConsistency => ({ ...consistencyScore({ logging: null, calories: null, protein: null, activity: null, habits: null }), ...w, sessions: 0 });
  return {
    week: toDto(mine[weeks.length - 1] ?? empty(weeks.at(-1)!), 'week'),
    month: toDto(mine.at(-1) ?? empty(months.at(-1)!), 'month'),
    weeks: weeks.map((_, i) => point(i)),
    months: months.map((_, i) => point(weeks.length + i)),
  };
}

/** Progress tab: your own consistency. */
export function consistencyProgress(c: Container, user: AuthUser): Promise<ConsistencyResponse> {
  return consistencyBundle(c, { id: user.id, today: memberClock(c, user.timezone).today });
}
