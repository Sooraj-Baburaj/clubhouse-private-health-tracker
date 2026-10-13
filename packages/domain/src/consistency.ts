import { isHabitActiveOn, isHabitComplete, isHabitScheduledOn, weeklyDoneCount, type HabitRule, type HabitValues } from './habits';
import { addDays, dateRange, daysBetween, weekStartOf } from './time';

/*
 * Consistency (SYS-CALC-33, v2): how well a member follows their plan over a week or a month, out of 100. Five parts,
 * each a share of what was due; a part that doesn't apply (no activity plan, no required habits, nothing due yet) is
 * left out and the others share its weight. Nothing is held against a member before it could have happened: today's
 * calories wait for the day to end, and planned sessions can land on any day of the week.
 */

export type ConsistencyPart = 'logging' | 'calories' | 'protein' | 'activity' | 'habits';

export const CONSISTENCY_PARTS: ConsistencyPart[] = ['logging', 'calories', 'protein', 'activity', 'habits'];

export const CONSISTENCY_WEIGHTS: Record<ConsistencyPart, number> = { logging: 25, calories: 25, protein: 15, activity: 20, habits: 15 };

/** Done out of due. Activity can be fractional in a month (weeks that straddle it count in part). */
export interface Tally {
  done: number;
  due: number;
}

export type ConsistencyWord = 'solid' | 'building' | 'rough week';

export interface ConsistencyResult {
  /** Null while nothing is due yet (a Monday morning before the first log). */
  score: number | null;
  word: ConsistencyWord | null;
  parts: Record<ConsistencyPart, (Tally & { pct: number; weight: number }) | null>;
}

export function consistencyWord(score: number): ConsistencyWord {
  if (score >= 75) return 'solid';
  if (score >= 45) return 'building';
  return 'rough week';
}

/** Weighted average of the parts that have something due. */
export function consistencyScore(tallies: Record<ConsistencyPart, Tally | null>): ConsistencyResult {
  const parts = {} as ConsistencyResult['parts'];
  let sum = 0;
  let weights = 0;
  for (const k of CONSISTENCY_PARTS) {
    const t = tallies[k];
    if (!t || !(t.due > 0)) {
      parts[k] = null;
      continue;
    }
    const share = Math.min(1, Math.max(0, t.done / t.due));
    parts[k] = { done: t.done, due: t.due, pct: Math.round(share * 100), weight: CONSISTENCY_WEIGHTS[k] };
    sum += share * CONSISTENCY_WEIGHTS[k];
    weights += CONSISTENCY_WEIGHTS[k];
  }
  const score = weights ? Math.round((100 * sum) / weights) : null;
  return { score, word: score == null ? null : consistencyWord(score), parts };
}

/** One member-day as consistency sees it. */
export interface ConsistencyDay {
  date: string;
  foodLogged: boolean;
  caloriesInRange: boolean;
  /** Null without a protein target. */
  proteinOnTrack: boolean | null;
  /** Before joining, or on a break: neither counts for nor against. */
  excluded: boolean;
}

/**
 * Logging, calories and protein over some days. A finished day counts whether or not anything was logged (an unlogged
 * day can't be on plan); today counts for logging once something is logged, and for calories and protein not until
 * it's over.
 */
export function dayTallies(days: ConsistencyDay[], today: string): { logging: Tally; calories: Tally; protein: Tally | null } {
  const logging = { done: 0, due: 0 };
  const calories = { done: 0, due: 0 };
  const protein = { done: 0, due: 0 };
  let proteinTarget = false;
  for (const d of days) {
    if (d.excluded || d.date > today) continue;
    if (d.date === today) {
      if (d.foodLogged) {
        logging.done++;
        logging.due++;
      }
      continue;
    }
    logging.due++;
    calories.due++;
    if (d.foodLogged) logging.done++;
    if (d.caloriesInRange) calories.done++;
    if (d.proteinOnTrack != null) {
      proteinTarget = true;
      protein.due++;
      if (d.proteinOnTrack) protein.done++;
    }
  }
  return { logging, calories, protein: proteinTarget ? protein : null };
}

/**
 * Planned sessions in one week, for any mix of days: each item counts up to its target, and a session is only missed
 * once there aren't enough days left in the week to fit it in (one session per activity a day). `daysLeft` includes
 * today; 0 for a finished week.
 */
export function planWeekTally(items: { target: number; done: number }[], daysLeft: number): Tally {
  let done = 0;
  let missed = 0;
  for (const i of items) {
    const d = Math.min(i.done, i.target);
    done += d;
    missed += Math.max(0, i.target - d - Math.max(0, daysLeft));
  }
  return { done, due: done + missed };
}

/** Days left in the week of `weekStart`, today included (0 once it's over, 7 before it starts). */
export function daysLeftInWeek(weekStart: string, today: string): number {
  const end = addDays(weekStart, 6);
  if (today > end) return 0;
  if (today < weekStart) return 7;
  return daysBetween(today, end) + 1;
}

/**
 * Required habits over [from, to]: each scheduled day of a daily or weekday habit (today only once it's done), and
 * each week of a weekly habit that ends in the window — judged like planned sessions, on any days of the week.
 */
export function habitTally(habits: HabitRule[], values: HabitValues, from: string, to: string, today: string, isExcluded: (date: string) => boolean): Tally | null {
  const required = habits.filter((h) => h.required);
  if (!required.length) return null;
  let done = 0;
  let due = 0;
  for (const h of required) {
    if (h.schedule.type === 'weekly') {
      const perWeek = h.schedule.perWeek;
      for (let w = weekStartOf(from); w <= to && w <= today; w = addDays(w, 7)) {
        const end = addDays(w, 6);
        if (end < from || end > to || !isHabitActiveOn(h, end)) continue;
        if (dateRange(w, end).filter(isExcluded).length >= 3) continue;
        const t = planWeekTally([{ target: perWeek, done: weeklyDoneCount(h, values, w, today) }], daysLeftInWeek(w, today));
        done += t.done;
        due += t.due;
      }
      continue;
    }
    for (const d of dateRange(from, to < today ? to : today)) {
      if (isExcluded(d) || !isHabitScheduledOn(h, d)) continue;
      const kept = isHabitComplete(h.kind, values.get(h.id)?.get(d) ?? 0, h.target);
      if (d === today && !kept) continue;
      due++;
      if (kept) done++;
    }
  }
  return { done, due };
}
