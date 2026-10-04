import type { BoardDayState, BoardSettings, BoardStatus, MealSlot, Thresholds } from '@clubhouse/contracts';
import { bandFor } from './bands';
import { addDays, dateRange } from './time';

/*
 * Crew points (the Team tab leaderboard). A pure, versioned function of day facts: no event ledger, so edits, deletes
 * and late fixes recompute cleanly. Everything is judged against the member's own targets and plan, so different goals
 * and body sizes compete fairly; the board never sees calories, grams, foods or weight.
 */

export const BOARD_RULES = {
  version: 1,
  /** Each meal slot logged on time, up to `mealCap` a day. */
  meal: 10,
  mealCap: 3,
  /** A snapped meal still waiting for its foods (inside the cap); topped up to `meal` once finished. */
  snapMeal: 5,
  /** Calories on track (green) / a bit over or a bit low (yellow, from the floor up). Counted once the day settles. */
  kcal: { on: 25, near: 10, floorPct: 70 },
  /** Protein on track or plenty / a bit low (from the floor up). */
  protein: { on: 15, near: 5, floorPct: 60 },
  workout: 40,
  planDone: 40,
  weighIn: 10,
  /** 2+ meals logged every eligible day of the week. */
  fullWeek: 50,
  fullWeekMinMeals: 2,
  solidMinMeals: 2,
  /** Away for the week (not ranked, no awards) from this many vacation or pre-join days. */
  awayDays: 4,
  solidWindow: 28,
  /** Ranked on Solid days from this many eligible days ("warming up" before). */
  rankFrom: 7,
  /** The 👑 needs this many eligible days. */
  crownFrom: 14,
  /** Awards need this many ranked members. */
  minRanked: 3,
  comebackMin: 100,
} as const;

/** How calories or protein landed for the board: on track, close (above the floor), or off. */
export type BoardClass = 'on' | 'near' | 'off';

/** Calories vs the day's budget: green → on; yellow → near (under the floor → off); red → off. */
export function classifyKcal(eaten: number, budget: number, thresholds: Thresholds): BoardClass | null {
  if (!(budget > 0)) return null;
  const b = bandFor('kcal', eaten, budget, thresholds, true);
  if (b.band === 'green') return 'on';
  if (b.band === 'yellow') return b.direction === 'under' && b.pct < BOARD_RULES.kcal.floorPct ? 'off' : 'near';
  return b.band === 'red' ? 'off' : null;
}

/** Protein vs target: on track or plenty → on; a bit low → near (under the floor → off). */
export function classifyProtein(eaten: number, target: number, thresholds: Thresholds): BoardClass | null {
  if (!(target > 0)) return null;
  const b = bandFor('protein', eaten, target, thresholds, true);
  if (b.band === 'green') return 'on';
  if (b.band === 'yellow') return b.direction === 'over' ? 'on' : b.pct < BOARD_RULES.protein.floorPct ? 'off' : 'near';
  return b.band === 'red' ? 'off' : null;
}

/** One member-day as the board sees it (on-time logs only). */
export interface BoardDayFacts {
  /** Meal slots with an on-time log that has foods. */
  mealsOnTime: number;
  /** Meal slots with only an on-time photo-only log ("finish later"). */
  snapOnly: number;
  kcal: BoardClass | null;
  protein: BoardClass | null;
  /** Qualifying workouts that day (planned, or long enough). */
  workouts: number;
  weighedIn: boolean;
  /** The day has ended and settled (03:00 the next morning): calories and protein count from then. */
  settled: boolean;
}

export const EMPTY_DAY: BoardDayFacts = { mealsOnTime: 0, snapOnly: 0, kcal: null, protein: null, workouts: 0, weighedIn: false, settled: false };

export interface DayPoints {
  meals: number;
  snap: number;
  kcal: number;
  protein: number;
  total: number;
}

export function dayPoints(f: BoardDayFacts): DayPoints {
  const R = BOARD_RULES;
  const full = Math.min(Math.max(0, f.mealsOnTime), R.mealCap);
  const snap = Math.min(Math.max(0, f.snapOnly), R.mealCap - full);
  const meals = full * R.meal;
  const snapPts = snap * R.snapMeal;
  const kcal = f.settled ? (f.kcal === 'on' ? R.kcal.on : f.kcal === 'near' ? R.kcal.near : 0) : 0;
  const protein = f.settled ? (f.protein === 'on' ? R.protein.on : f.protein === 'near' ? R.protein.near : 0) : 0;
  return { meals, snap: snapPts, kcal, protein, total: meals + snapPts + kcal + protein };
}

/** A solid day: settled, 2+ meals logged, and one good call — calories on track or close, protein on track, or a workout. */
export function isSolidDay(f: BoardDayFacts): boolean {
  if (!f.settled) return false;
  if (f.mealsOnTime + f.snapOnly < BOARD_RULES.solidMinMeals) return false;
  return f.kcal === 'on' || f.kcal === 'near' || f.protein === 'on' || f.workouts > 0;
}

export interface WeekDayInput {
  date: string;
  facts: BoardDayFacts | null;
  vacation: boolean;
  /** Before the member joined. */
  beforeJoin: boolean;
}

export interface WeekInput {
  weekStart: string;
  /** The member's local today (days after it are still to come). */
  today: string;
  /** Monday to Sunday. */
  days: WeekDayInput[];
  /** Dates of qualifying on-time workouts, one per workout. */
  workoutDates: string[];
  /** `plan`: done on `doneOn` (or not yet); `rest`: an approved rest week or 3+ vacation days (the bonus is credited); `none`: no weekly plan. */
  plan: { kind: 'plan' | 'rest' | 'none'; doneOn: string | null };
  rules: Pick<BoardSettings, 'workoutCap' | 'noPlanTarget'>;
  /** The week is over and settled: the full-week bonus is decided. */
  closed: boolean;
}

export interface WeekDayParts {
  meals: number;
  snap: number;
  kcal: number;
  protein: number;
  workouts: number;
  workoutCount: number;
  weighIn: number;
  plan: number;
  away: number;
  fullWeek: number;
}

export interface WeekDayResult {
  date: string;
  state: BoardDayState;
  points: number;
  parts: WeekDayParts;
  /** Calories and protein are in (the day has settled). */
  settled: boolean;
}

export interface WeekStanding {
  points: number;
  parts: { meals: number; calories: number; protein: number; workouts: number; bonus: number; away: number };
  days: WeekDayResult[];
  status: BoardStatus;
  /** Qualifying workouts this week (before the cap) and those that earned points. */
  workouts: number;
  workoutsCounted: number;
  fullDays: number;
  awayDays: number;
  solidDays: number;
  proteinDays: number;
  planDone: boolean;
  weighedIn: boolean;
  /** Calorie and protein points that can still land on days that haven't settled. */
  pending: number;
}

const zeroParts = (): WeekDayParts => ({ meals: 0, snap: 0, kcal: 0, protein: 0, workouts: 0, workoutCount: 0, weighIn: 0, plan: 0, away: 0, fullWeek: 0 });
const sumParts = (p: WeekDayParts) => p.meals + p.snap + p.kcal + p.protein + p.workouts + p.weighIn + p.plan + p.away + p.fullWeek;

/**
 * One member's week. Vacation and pre-join days are credited with the average of the week's settled, eligible days;
 * four or more of them make the member away (or new) — shown, not ranked. Workouts earn points up to the weekly cap;
 * the plan bonus lands on the day the plan was done; the full-week bonus is decided when the week closes.
 */
export function weekStanding(input: WeekInput): WeekStanding {
  const R = BOARD_RULES;
  const days = input.days.map((d) => ({ input: d, parts: zeroParts(), state: 'none' as BoardDayState, eligible: !d.vacation && !d.beforeJoin }));
  const settledTotals: number[] = [];
  let pending = 0;
  let solidDays = 0;
  let proteinDays = 0;

  for (const d of days) {
    const { date, facts } = d.input;
    if (date > input.today) {
      d.state = 'future';
      continue;
    }
    if (!d.eligible) {
      d.state = 'away';
      continue;
    }
    const f = facts ?? EMPTY_DAY;
    const p = dayPoints(f);
    d.parts.meals = p.meals;
    d.parts.snap = p.snap;
    d.parts.kcal = p.kcal;
    d.parts.protein = p.protein;
    const logged = f.mealsOnTime + f.snapOnly > 0 || f.workouts > 0;
    if (f.settled) {
      settledTotals.push(p.total);
      if (isSolidDay(f)) solidDays++;
      if (f.protein === 'on') proteinDays++;
    } else if (f.mealsOnTime > 0) {
      pending += R.kcal.on + R.protein.on;
    }
    d.state = date === input.today ? 'today' : f.settled && isSolidDay(f) ? 'full' : logged ? 'partial' : 'none';
  }

  // Away days: the average settled eligible day (whole points), once there is one to average.
  const avg = settledTotals.length ? Math.round(settledTotals.reduce((a, x) => a + x, 0) / settledTotals.length) : 0;
  const awayDays = days.filter((d) => !d.eligible).length;
  for (const d of days) if (!d.eligible && d.input.date <= input.today) d.parts.away = avg;

  // Workouts in date order, up to the cap.
  const sortedWorkouts = [...input.workoutDates].filter((w) => w >= input.weekStart && w <= addDays(input.weekStart, 6)).sort();
  let counted = 0;
  for (const w of sortedWorkouts) {
    const d = days.find((x) => x.input.date === w);
    if (!d) continue;
    d.parts.workoutCount++;
    if (counted < input.rules.workoutCap) {
      d.parts.workouts += R.workout;
      counted++;
    }
  }

  // Plan done: a rest week keeps the bonus; no plan → the team's workout target.
  let planDoneOn: string | null = null;
  if (input.plan.kind === 'rest') planDoneOn = input.weekStart <= input.today ? input.weekStart : null;
  else if (input.plan.kind === 'plan') planDoneOn = input.plan.doneOn;
  else if (sortedWorkouts.length >= input.rules.noPlanTarget) planDoneOn = sortedWorkouts[input.rules.noPlanTarget - 1]!;
  if (planDoneOn) {
    const d = days.find((x) => x.input.date === planDoneOn) ?? days[0]!;
    d.parts.plan = R.planDone;
  }

  // One weigh-in a week.
  const weighDay = days.find((d) => d.input.date <= input.today && d.input.facts?.weighedIn);
  if (weighDay) weighDay.parts.weighIn = R.weighIn;

  // Full week: every eligible day with two or more meals, decided at the close.
  const eligible = days.filter((d) => d.eligible);
  const fullDays = eligible.filter((d) => (d.input.facts?.mealsOnTime ?? 0) + (d.input.facts?.snapOnly ?? 0) >= R.fullWeekMinMeals).length;
  if (input.closed && eligible.length > 0 && fullDays === eligible.length) days[days.length - 1]!.parts.fullWeek = R.fullWeek;

  const out: WeekDayResult[] = days.map((d) => ({ date: d.input.date, state: d.state, points: sumParts(d.parts), parts: d.parts, settled: !!d.input.facts?.settled }));
  const sum = (k: keyof WeekDayParts) => days.reduce((a, d) => a + d.parts[k], 0);
  const parts = {
    meals: sum('meals') + sum('snap'),
    calories: sum('kcal'),
    protein: sum('protein'),
    workouts: sum('workouts'),
    bonus: sum('plan') + sum('weighIn') + sum('fullWeek'),
    away: sum('away'),
  };
  const beforeJoin = input.days.filter((d) => d.beforeJoin).length;
  const status: BoardStatus = awayDays >= R.awayDays ? (beforeJoin >= R.awayDays ? 'new' : 'away') : 'ranked';
  return {
    points: out.reduce((a, d) => a + d.points, 0),
    parts,
    days: out,
    status,
    workouts: sortedWorkouts.length,
    workoutsCounted: counted,
    fullDays,
    awayDays,
    solidDays,
    proteinDays,
    planDone: !!planDoneOn,
    weighedIn: !!weighDay,
    pending,
  };
}

/** "How you earned it" lines for one day. */
export function dayItems(p: WeekDayParts, f: BoardDayFacts | null): { label: string; points: number }[] {
  const out: { label: string; points: number }[] = [];
  const meals = Math.min(f?.mealsOnTime ?? 0, BOARD_RULES.mealCap);
  if (p.meals) out.push({ label: `${meals} meal${meals === 1 ? '' : 's'}`, points: p.meals });
  if (p.snap) out.push({ label: 'Snapped meal, foods to add', points: p.snap });
  if (p.kcal) out.push({ label: f?.kcal === 'on' ? 'Calories on track' : 'Calories close', points: p.kcal });
  if (p.protein) out.push({ label: f?.protein === 'on' ? 'Protein on track' : 'Protein a bit low', points: p.protein });
  if (p.workouts) out.push({ label: p.workouts / BOARD_RULES.workout > 1 ? `${p.workouts / BOARD_RULES.workout} workouts` : 'Workout', points: p.workouts });
  if (p.plan) out.push({ label: 'Weekly plan done', points: p.plan });
  if (p.weighIn) out.push({ label: 'Weigh-in', points: p.weighIn });
  if (p.away) out.push({ label: 'Away · your average day', points: p.away });
  if (p.fullWeek) out.push({ label: 'Full week of logging', points: p.fullWeek });
  return out;
}

/** Competition ranking (1, 2, 2, 4) by points; `order` breaks display ties without splitting the shared rank. */
export function rankByPoints<T extends { points: number }>(rows: T[], order: (a: T, b: T) => number = () => 0): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || order(a, b));
  return sorted.map((r) => ({ ...r, rank: 1 + sorted.filter((x) => x.points > r.points).length }));
}

export interface SolidDayInput {
  date: string;
  solid: boolean;
  logged: boolean;
  vacation: boolean;
  beforeJoin: boolean;
}

export type SolidState = 'solid' | 'logged' | 'none' | 'away' | 'pre';

/** Solid-day rate over the last `solidWindow` settled days, ending `through` (vacation and pre-join days don't count). */
export function solidDayRate(days: SolidDayInput[], through: string): { solid: number; eligible: number; strip: SolidState[]; ranked: boolean; crownEligible: boolean } {
  const from = addDays(through, -(BOARD_RULES.solidWindow - 1));
  const byDate = new Map(days.map((d) => [d.date, d]));
  let solid = 0;
  let eligible = 0;
  const strip: SolidState[] = dateRange(from, through).map((date) => {
    const d = byDate.get(date);
    if (!d || d.beforeJoin) return 'pre';
    if (d.vacation) return 'away';
    eligible++;
    if (d.solid) {
      solid++;
      return 'solid';
    }
    return d.logged ? 'logged' : 'none';
  });
  return { solid, eligible, strip, ranked: eligible >= BOARD_RULES.rankFrom, crownEligible: eligible >= BOARD_RULES.crownFrom };
}

/** Compare two solid-day rates exactly (a/b vs c/d without floating point). */
export const compareRate = (a: { solid: number; eligible: number }, b: { solid: number; eligible: number }) => a.solid * b.eligible - b.solid * a.eligible;

/**
 * The 👑 Most consistent: the best solid-day rate among members with enough eligible days. The holder keeps it on a
 * tie; otherwise ties go to the longer logging streak, then the best streak.
 */
export function crownHolder(rows: { id: string; solid: number; eligible: number; streak: number; best: number }[], holder: string | null): string | null {
  const candidates = rows.filter((r) => r.eligible >= BOARD_RULES.crownFrom && r.solid > 0);
  if (!candidates.length) return null;
  const top = candidates.reduce((best, r) => (compareRate(r, best) > 0 ? r : best));
  const leaders = candidates.filter((r) => compareRate(r, top) === 0);
  if (holder && leaders.some((r) => r.id === holder)) return holder;
  leaders.sort((a, b) => b.streak - a.streak || b.best - a.best || a.id.localeCompare(b.id));
  return leaders[0]!.id;
}

export interface AwardCandidate {
  id: string;
  points: number;
  /** Final points of the week before (null when not ranked then). */
  prevPoints: number | null;
  streak: number;
  workouts: number;
  planDone: boolean;
  hasPlan: boolean;
  proteinDays: number;
  /** Earlier weeks' best total, for "a personal best". */
  bestBefore: number | null;
}

export type AwardKind = 'winner' | 'consistent' | 'streak' | 'plan' | 'protein' | 'comeback';

export interface Award {
  key: AwardKind;
  id: string;
  /** What the award is for; the caller adds names. */
  detail: { points?: number; best?: boolean; shared?: boolean; solid?: number; eligible?: number; days?: number; workouts?: number; planned?: boolean; gain?: number };
}

/**
 * Weekly awards from the ranked members (needs `minRanked`). `rows` come in board order, which breaks every tie the
 * same way the board does — except Week winner, which everyone level on the most points shares. The crown holder (with
 * their 28-day record) gets Most consistent.
 */
export function weeklyAwards(rows: AwardCandidate[], crown: { id: string; solid: number; eligible: number } | null): Award[] {
  if (rows.length < BOARD_RULES.minRanked) return [];
  const out: Award[] = [];
  const pickMax = (score: (r: AwardCandidate) => number, min: number) => {
    let best: AwardCandidate | null = null;
    for (const r of rows) if (score(r) >= min && (!best || score(r) > score(best))) best = r;
    return best;
  };
  const top = pickMax((r) => r.points, 1);
  const winners = top ? rows.filter((r) => r.points === top.points) : [];
  for (const w of winners) out.push({ key: 'winner', id: w.id, detail: { points: w.points, best: w.bestBefore != null && w.points > w.bestBefore, shared: winners.length > 1 } });
  if (crown && rows.some((r) => r.id === crown.id)) out.push({ key: 'consistent', id: crown.id, detail: { solid: crown.solid, eligible: crown.eligible } });
  const streak = pickMax((r) => r.streak, 7);
  if (streak) out.push({ key: 'streak', id: streak.id, detail: { days: streak.streak } });
  const keepers = rows.filter((r) => r.planDone);
  let plan: AwardCandidate | null = null;
  for (const r of keepers) if (!plan || r.workouts > plan.workouts) plan = r;
  if (plan && plan.workouts > 0) out.push({ key: 'plan', id: plan.id, detail: { workouts: plan.workouts, planned: plan.hasPlan } });
  const protein = pickMax((r) => r.proteinDays, 3);
  if (protein) out.push({ key: 'protein', id: protein.id, detail: { days: protein.proteinDays } });
  const comeback = pickMax((r) => (r.prevPoints == null ? -Infinity : r.points - r.prevPoints), BOARD_RULES.comebackMin);
  if (comeback) out.push({ key: 'comeback', id: comeback.id, detail: { gain: comeback.points - (comeback.prevPoints ?? 0) } });
  return out;
}

export interface NextActionInput {
  /** Meal slots with a full log today, and with a photo-only log still to finish. */
  slotsLogged: MealSlot[];
  snapPending: { slot: MealSlot; logId: string } | null;
  /** The slot to suggest next (by time of day), if any is left. */
  nextSlot: MealSlot | null;
  workoutsCounted: number;
  weighedIn: boolean;
  rules: Pick<BoardSettings, 'workoutCap'>;
  /** Today is an eligible day (not on vacation). */
  eligibleToday: boolean;
}

export type NextAction = { kind: 'finish'; slot: MealSlot; logId: string; points: number } | { kind: 'meal'; slot: MealSlot; points: number } | { kind: 'workout'; points: number } | { kind: 'weigh_in'; points: number };

/** The two or three quickest points still on offer this week (shown as chips under "Your week"). */
export function nextActions(i: NextActionInput, max = 3): NextAction[] {
  const R = BOARD_RULES;
  const out: NextAction[] = [];
  if (i.eligibleToday) {
    if (i.snapPending) out.push({ kind: 'finish', slot: i.snapPending.slot, logId: i.snapPending.logId, points: R.meal - R.snapMeal });
    if (i.slotsLogged.length < R.mealCap && i.nextSlot && !i.slotsLogged.includes(i.nextSlot)) out.push({ kind: 'meal', slot: i.nextSlot, points: R.meal });
  }
  if (i.workoutsCounted < i.rules.workoutCap) out.push({ kind: 'workout', points: R.workout });
  if (!i.weighedIn) out.push({ kind: 'weigh_in', points: R.weighIn });
  return out.slice(0, max);
}
