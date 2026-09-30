import type { StreakSettings, StreakStatus } from '@clubhouse/contracts';
import { BADGES } from './constants';
import { addDays, dateRange } from './time';

export type DayState = 'ok' | 'grace' | 'miss' | 'vacation' | 'pending' | 'none';

export interface DailyFact {
  date: string;
  qualifies: boolean;
  vacation: boolean;
}

export interface DailyStreakInput {
  /** Facts keyed by date; dates without a fact count as not qualifying and not on vacation. */
  facts: DailyFact[];
  from: string;
  today: string;
  /** Whether a qualifying fact for today counts now (logging: yes; in-range: no, it waits for day end). */
  todayCounts: boolean;
  settings: Pick<StreakSettings, 'graceEarnedPer7' | 'graceBankMax' | 'pauseWindowDays' | 'resetAfterDays'>;
  /** Best streak recorded before the window, so it is never lost. */
  previousBest?: number;
}

export interface StreakResult {
  current: number;
  best: number;
  status: StreakStatus;
  graceLeft: number;
  pausedSince: string | null;
  lastCountedDate: string | null;
  missRun: number;
  atRisk: boolean;
  history: { date: string; state: DayState }[];
}

/**
 * Momentum rules (SYS-STREAK-01…05): a qualifying day adds one; a missed day first spends a grace day
 * (earned one per 7 counted days, banked up to the cap); with no grace left the streak pauses with its
 * count frozen; logging again within the pause window resumes at the frozen count; after `resetAfterDays`
 * missed days it resets to 0 and the best is kept. Vacation days freeze everything. Today never counts as missed.
 * Pure and deterministic: the nightly job and the on-log path call it with the same facts and get the same answer.
 */
export function computeDailyStreak(input: DailyStreakInput): StreakResult {
  const byDate = new Map(input.facts.map((f) => [f.date, f]));
  const s = input.settings;
  let current = 0;
  let best = input.previousBest ?? 0;
  let grace = 0;
  let status: StreakStatus = 'active';
  let missRun = 0;
  let sinceEarn = 0;
  let pausedSince: string | null = null;
  let lastCounted: string | null = null;
  let started = false;
  const history: StreakResult['history'] = [];

  for (const date of dateRange(input.from, input.today)) {
    const f = byDate.get(date);
    const isToday = date === input.today;
    if (f?.vacation) {
      history.push({ date, state: 'vacation' });
      continue;
    }
    const qualifies = !!f?.qualifies && (!isToday || input.todayCounts);
    if (qualifies) {
      if (status === 'paused' && missRun > s.pauseWindowDays) current = 0;
      status = 'active';
      current += 1;
      started = true;
      missRun = 0;
      pausedSince = null;
      lastCounted = date;
      sinceEarn += 1;
      if (sinceEarn >= 7) {
        sinceEarn = 0;
        grace = Math.min(s.graceBankMax, grace + s.graceEarnedPer7);
      }
      best = Math.max(best, current);
      history.push({ date, state: 'ok' });
      continue;
    }
    if (isToday) {
      history.push({ date, state: started ? 'pending' : 'none' });
      continue;
    }
    if (!started) {
      history.push({ date, state: 'none' });
      continue;
    }
    if (status === 'active' && grace > 0) {
      grace -= 1;
      history.push({ date, state: 'grace' });
      continue;
    }
    if (status === 'reset') {
      history.push({ date, state: 'miss' });
      continue;
    }
    missRun += 1;
    if (status === 'active') {
      status = 'paused';
      pausedSince = date;
    }
    if (missRun >= s.resetAfterDays) {
      current = 0;
      status = 'reset';
      pausedSince = null;
      sinceEarn = 0;
    }
    history.push({ date, state: 'miss' });
  }

  const todayFact = byDate.get(input.today);
  if (todayFact?.vacation) status = 'vacation';
  const todayDone = !!todayFact?.qualifies && input.todayCounts;
  const atRisk = status === 'active' && current > 0 && !todayDone && grace === 0;
  return { current, best, status, graceLeft: grace, pausedSince, lastCountedDate: lastCounted, missRun, atRisk, history };
}

export interface WeekFact {
  weekStart: string;
  /** Plan met for the week (sessions done ≥ planned for every item). */
  met: boolean;
  /** Approved rest week or mostly on vacation: frozen. */
  frozen: boolean;
}

export interface WeeklyStreakResult {
  current: number;
  best: number;
  status: StreakStatus;
  history: { weekStart: string; state: DayState }[];
}

/**
 * SYS-STREAK-06: the activity streak counts weeks. Meeting the plan by Sunday counts the week, whatever the days;
 * the current week shows progress and never counts as missed. A missed week pauses; two missed weeks in a row reset.
 */
export function computeWeeklyStreak(weeks: WeekFact[], currentWeekStart: string, previousBest = 0, resetAfterWeeks = 2): WeeklyStreakResult {
  const sorted = [...weeks].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  let current = 0;
  let best = previousBest;
  let status: StreakStatus = 'active';
  let missRun = 0;
  let started = false;
  const history: WeeklyStreakResult['history'] = [];
  for (const w of sorted) {
    const isCurrent = w.weekStart === currentWeekStart;
    if (w.frozen) {
      history.push({ weekStart: w.weekStart, state: 'vacation' });
      continue;
    }
    if (w.met) {
      status = 'active';
      current += 1;
      started = true;
      missRun = 0;
      best = Math.max(best, current);
      history.push({ weekStart: w.weekStart, state: 'ok' });
      continue;
    }
    if (isCurrent || !started) {
      history.push({ weekStart: w.weekStart, state: isCurrent ? 'pending' : 'none' });
      continue;
    }
    missRun += 1;
    status = 'paused';
    if (missRun >= resetAfterWeeks) {
      current = 0;
      status = 'reset';
    }
    history.push({ weekStart: w.weekStart, state: 'miss' });
  }
  const cur = sorted.find((w) => w.weekStart === currentWeekStart);
  if (cur?.frozen) status = 'vacation';
  return { current, best, status, history };
}

/** SYS-STREAK-07: a team day counts when every active member not on vacation logged. */
export function teamDayQualifies(members: { active: boolean; onVacation: boolean; logged: boolean }[]): boolean | null {
  const eligible = members.filter((m) => m.active && !m.onVacation);
  if (eligible.length === 0) return null; // frozen
  return eligible.every((m) => m.logged);
}

export function computeTeamStreak(
  days: { date: string; qualifies: boolean | null }[],
  from: string,
  today: string,
  settings: Pick<StreakSettings, 'pauseWindowDays' | 'resetAfterDays'>,
  previousBest = 0,
): StreakResult {
  return computeDailyStreak({
    facts: days.map((d) => ({ date: d.date, qualifies: d.qualifies === true, vacation: d.qualifies === null })),
    from,
    today,
    todayCounts: true,
    settings: { graceEarnedPer7: 0, graceBankMax: 0, pauseWindowDays: settings.pauseWindowDays, resetAfterDays: settings.resetAfterDays },
    previousBest,
  });
}

/** Milestones newly reached when going from `before` to `after` (SYS-STREAK-08). */
export function milestonesCrossed(before: number, after: number, milestones: number[]): number[] {
  return milestones.filter((m) => before < m && after >= m);
}

export function badgeFor(milestone: number): { name: string; emoji: string } {
  return BADGES[milestone] ?? { name: `${milestone} days`, emoji: '⭐' };
}

export function earnedBadges(best: number, milestones: number[]): { days: number; name: string; emoji: string }[] {
  return milestones.filter((m) => best >= m).map((m) => ({ days: m, ...badgeFor(m) }));
}

/** Vacation days used in the calendar quarter that contains `date` (SYS-STREAK-05: up to 21 a quarter). */
export function vacationDaysInQuarter(ranges: { from: string; to: string }[], date: string): number {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const qStart = `${y}-${String(qStartMonth).padStart(2, '0')}-01`;
  const qEndMonth = qStartMonth + 2;
  const qEnd = addDays(qEndMonth === 12 ? `${y + 1}-01-01` : `${y}-${String(qEndMonth + 1).padStart(2, '0')}-01`, -1);
  let n = 0;
  for (const r of ranges) {
    const a = r.from > qStart ? r.from : qStart;
    const b = r.to < qEnd ? r.to : qEnd;
    if (a <= b) n += dateRange(a, b).length;
  }
  return n;
}

export function isOnVacation(ranges: { from: string; to: string }[], date: string): boolean {
  return ranges.some((r) => r.from <= date && date <= r.to);
}
