import { DEFAULT_STREAK_SETTINGS, type HabitCellState, type HabitKind, type HabitSchedule } from '@clubhouse/contracts';
import { computeDailyStreak, type DailyStreakInput } from './streaks';
import { addDays, dateRange, weekdayOf, weekStartOf } from './time';

/** What the habit rules need to know about a habit (a subset of the admin definition). */
export interface HabitRule {
  id: string;
  kind: HabitKind;
  target: number;
  schedule: HabitSchedule;
  required: boolean;
  startsOn: string;
  endsOn: string | null;
}

/** Check-in values per habit, per local date. A missing date means nothing was logged. */
export type HabitValues = Map<string, Map<string, number>>;

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function isHabitActiveOn(h: Pick<HabitRule, 'startsOn' | 'endsOn'>, date: string): boolean {
  return h.startsOn <= date && (!h.endsOn || date <= h.endsOn);
}

/** Daily and weekday habits are due on their days; weekly ones may be done on any day of the week. */
export function isHabitScheduledOn(h: Pick<HabitRule, 'schedule' | 'startsOn' | 'endsOn'>, date: string): boolean {
  if (!isHabitActiveOn(h, date)) return false;
  if (h.schedule.type === 'days') return h.schedule.days.includes(weekdayOf(date));
  return true;
}

/** Tick: any value; count and duration: reach the target; scale: any rating 1–5. */
export function isHabitComplete(kind: HabitKind, value: number, target: number): boolean {
  if (kind === 'check' || kind === 'scale') return value > 0;
  return value >= Math.max(1, target);
}

/** The value after one tap on a tile: tick toggles, +1 glass, +10 minutes, rating 1→5; past the end wraps to 0. */
export function habitTapValue(kind: HabitKind, value: number, target: number): number {
  if (kind === 'check') return value > 0 ? 0 : 1;
  if (kind === 'count') return value >= target ? 0 : value + 1;
  if (kind === 'duration') return value >= target ? 0 : Math.min(target, value + 10);
  return value >= 5 ? 0 : value + 1;
}

/** 0–1 progress of a value toward done, for tile bars. */
export function habitFill(kind: HabitKind, value: number, target: number): number {
  if (kind === 'check') return value > 0 ? 1 : 0;
  if (kind === 'scale') return Math.min(1, value / 5);
  return Math.min(1, value / Math.max(1, target));
}

export function habitScheduleLabel(s: HabitSchedule): string {
  if (s.type === 'daily') return 'Every day';
  if (s.type === 'weekly') return `${s.perWeek}× a week`;
  if (!s.days.length) return 'No days';
  if (s.days.length === 7) return 'Every day';
  return [...s.days].sort((a, b) => a - b).map((d) => WEEKDAY_SHORT[d]).join(' · ');
}

function valueOn(values: HabitValues, habitId: string, date: string): number {
  return values.get(habitId)?.get(date) ?? 0;
}

function doneOn(h: HabitRule, values: HabitValues, date: string): boolean {
  return isHabitComplete(h.kind, valueOn(values, h.id, date), h.target);
}

/** Days in the Monday-start week of `date`, up to and including `upTo`, on which a weekly habit was completed. */
export function weeklyDoneCount(h: HabitRule, values: HabitValues, date: string, upTo = addDays(weekStartOf(date), 6)): number {
  const start = weekStartOf(date);
  let n = 0;
  for (const d of dateRange(start, addDays(start, 6))) if (d <= upTo && isHabitActiveOn(h, d) && doneOn(h, values, d)) n++;
  return n;
}

/**
 * Whether a habit belongs on the member's list for `date`. A weekly habit stays on the list until this week's target
 * is met, and on the days it was done.
 */
export function isHabitShownOn(h: HabitRule, values: HabitValues, date: string): boolean {
  if (!isHabitScheduledOn(h, date)) return false;
  if (h.schedule.type !== 'weekly') return true;
  if (doneOn(h, values, date)) return true;
  return weeklyDoneCount(h, values, date, addDays(date, -1)) < h.schedule.perWeek;
}

/**
 * The habits streak (separate from the logging streak): days on which every required daily/weekday habit due that day
 * was done. Weekly required habits are judged on Sunday. Days with nothing required, and vacation days, are neutral.
 * Runs on the shared momentum engine, so a missed day spends grace or pauses instead of wiping the count.
 */
export function habitsStreak(
  habits: HabitRule[],
  values: HabitValues,
  today: string,
  opts: { isVacation?: (date: string) => boolean; settings?: DailyStreakInput['settings']; lookbackDays?: number } = {},
): { current: number; best: number } {
  const required = habits.filter((h) => h.required);
  if (!required.length) return { current: 0, best: 0 };
  const earliest = required.reduce((m, h) => (h.startsOn < m ? h.startsOn : m), today);
  const floor = addDays(today, -(opts.lookbackDays ?? 400));
  const from = earliest > floor ? earliest : floor;
  if (from > today) return { current: 0, best: 0 };

  // 'ok' counts, 'miss' is a missed day, 'skip' is neutral.
  const verdict = (date: string): 'ok' | 'miss' | 'skip' => {
    if (opts.isVacation?.(date)) return 'skip';
    let any = false;
    for (const h of required) {
      if (h.schedule.type === 'weekly') {
        // Judged on the last day of the week (or the habit's last day); the current week is never judged early.
        const weekEnd = addDays(weekStartOf(date), 6);
        const end = h.endsOn && h.endsOn < weekEnd ? h.endsOn : weekEnd;
        if (date !== end || date >= today || !isHabitActiveOn(h, date)) continue;
        any = true;
        if (weeklyDoneCount(h, values, date) < h.schedule.perWeek) return 'miss';
        continue;
      }
      if (!isHabitScheduledOn(h, date)) continue;
      any = true;
      if (!doneOn(h, values, date)) return 'miss';
    }
    return any ? 'ok' : 'skip';
  };

  const facts = dateRange(from, today).map((date) => {
    const v = verdict(date);
    return { date, qualifies: v === 'ok', vacation: v === 'skip' && date !== today };
  });
  const r = computeDailyStreak({ facts, from, today, todayCounts: true, settings: opts.settings ?? DEFAULT_STREAK_SETTINGS });
  return { current: r.current, best: r.best };
}

/** One habit's streak: scheduled days done in a row (weekly habits: weeks on target in a row). */
export function habitStreak(h: HabitRule, values: HabitValues, today: string): { current: number; best: number } {
  const from = h.startsOn > addDays(today, -400) ? h.startsOn : addDays(today, -400);
  if (from > today) return { current: 0, best: 0 };
  let best = 0;
  let run = 0;
  if (h.schedule.type === 'weekly') {
    for (let w = weekStartOf(from); w <= today; w = addDays(w, 7)) {
      const met = weeklyDoneCount(h, values, w) >= h.schedule.perWeek;
      if (met) best = Math.max(best, ++run);
      else if (addDays(w, 6) < today) run = 0;
    }
    return { current: run, best };
  }
  for (const d of dateRange(from, today)) {
    if (!isHabitScheduledOn(h, d)) continue;
    if (doneOn(h, values, d)) best = Math.max(best, ++run);
    else if (d < today) run = 0;
  }
  return { current: run, best };
}

/**
 * Kept vs scheduled over [from, to]: each scheduled day of a daily/weekday habit counts once; each week of a weekly
 * habit that ends inside the window counts `perWeek` times, kept up to the days done.
 */
export function habitAdherence(h: HabitRule, values: HabitValues, from: string, to: string): { kept: number; scheduled: number } {
  let kept = 0;
  let scheduled = 0;
  if (h.schedule.type === 'weekly') {
    for (let w = weekStartOf(from); w <= to; w = addDays(w, 7)) {
      const end = addDays(w, 6);
      if (end < from || end > to || !isHabitActiveOn(h, end)) continue;
      scheduled += h.schedule.perWeek;
      kept += Math.min(h.schedule.perWeek, weeklyDoneCount(h, values, w));
    }
    return { kept, scheduled };
  }
  for (const d of dateRange(from, to)) {
    if (!isHabitScheduledOn(h, d)) continue;
    scheduled++;
    if (doneOn(h, values, d)) kept++;
  }
  return { kept, scheduled };
}

export const adherencePct = (a: { kept: number; scheduled: number }): number | null => (a.scheduled ? Math.round((a.kept / a.scheduled) * 100) : null);

/** Five Monday-start weeks ending with the current one, for the habit detail dot grid. */
export function habitCells(h: HabitRule, values: HabitValues, today: string): { date: string; state: HabitCellState; value: number }[] {
  const start = addDays(weekStartOf(today), -28);
  return dateRange(start, addDays(start, 34)).map((date) => {
    const value = valueOn(values, h.id, date);
    if (date > today) return { date, state: 'future', value };
    const done = isHabitComplete(h.kind, value, h.target);
    if (h.schedule.type === 'weekly') return { date, state: done ? 'done' : date === today ? 'today' : 'off', value };
    if (!isHabitScheduledOn(h, date)) return { date, state: 'off', value };
    return { date, state: done ? 'done' : date === today ? 'today' : 'miss', value };
  });
}

/**
 * "Kept" over the last 7 days ending today: done on every scheduled day so far (today counts only once done); a
 * weekly habit is kept while it's on pace for this week.
 */
export function habitKeptThisWeek(h: HabitRule, values: HabitValues, today: string): boolean | null {
  if (h.schedule.type === 'weekly') {
    if (!isHabitActiveOn(h, today)) return null;
    const pace = Math.floor((h.schedule.perWeek * (weekdayOf(today) + 1)) / 7);
    return weeklyDoneCount(h, values, today, today) >= pace;
  }
  let any = false;
  for (const d of dateRange(addDays(today, -6), today)) {
    if (!isHabitScheduledOn(h, d)) continue;
    const done = doneOn(h, values, d);
    if (d === today && !done) continue;
    any = true;
    if (!done) return false;
  }
  return any ? true : null;
}
