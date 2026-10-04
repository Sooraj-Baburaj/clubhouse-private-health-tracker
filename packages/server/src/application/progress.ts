import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type {
  ActivityProgressResponse,
  CaloriesProgressResponse,
  ConsistencyResponse,
  ForecastDto,
  MealSlot,
  Nutrient,
  NutrientGridResponse,
  PersonalRecord,
  RecapDto,
  Thresholds,
  WeightProgressResponse,
} from '@clubhouse/contracts';
import type { ProgressNarrativeInput } from '@clubhouse/ai-gateway';
import {
  addDays,
  bandFor,
  consistencyScore,
  dateRange,
  forecast,
  isDayClosed,
  dayCalorieClass,
  localDateOf,
  weekStartOf,
  weekdayOf,
  weightTrend,
  whatIf,
  ZERO_TOTALS,
  type ConsistencyResult,
  type ForecastInput,
  type ForecastResult,
  type NutrientTotals,
  type TrendPoint,
} from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { sha256 } from '../lib/crypto';
import { log } from '../lib/log';
import type { AuthUser } from '../interface/http/types';
import { memberClock, type MemberClock } from './clockCtx';
import { activePlanItems, attributeLogs } from './plans';
import { loadProfile } from './profile';
import { effectiveTargets } from './targets';
import { getTeam } from './team';

type ProfileRow = typeof s.profiles.$inferSelect;
type TeamRow = typeof s.teams.$inferSelect;

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ───────── Shared per-day aggregates (also used by team view and recaps) ───────── */

export interface DayAgg {
  date: string;
  eaten: NutrientTotals;
  foodLogs: number;
  slots: MealSlot[];
  burned: number;
  minutes: number;
  sessions: number;
}

const emptyAgg = (date: string): DayAgg => ({ date, eaten: { ...ZERO_TOTALS }, foodLogs: 0, slots: [], burned: 0, minutes: 0, sessions: 0 });

/** Food and activity totals per local date for one member, straight from the live logs. */
export async function dayAggregates(c: Container, userId: string, from: string, to: string): Promise<Map<string, DayAgg>> {
  const f = s.foodLogs;
  const a = s.activityLogs;
  const [foods, acts] = await Promise.all([
    c.db
      .select({
        date: f.date,
        kcal: sql<number>`coalesce(sum((${f.totals}->>'kcal')::float8), 0)::float8`,
        protein: sql<number>`coalesce(sum((${f.totals}->>'protein')::float8), 0)::float8`,
        carbs: sql<number>`coalesce(sum((${f.totals}->>'carbs')::float8), 0)::float8`,
        fat: sql<number>`coalesce(sum((${f.totals}->>'fat')::float8), 0)::float8`,
        fibre: sql<number>`coalesce(sum((${f.totals}->>'fibre')::float8), 0)::float8`,
        n: sql<number>`count(*)::int`,
        slots: sql<string[]>`array_agg(distinct ${f.mealSlot})`,
      })
      .from(f)
      .where(and(eq(f.userId, userId), gte(f.date, from), lte(f.date, to), isNull(f.deletedAt)))
      .groupBy(f.date),
    c.db
      .select({
        date: a.date,
        burned: sql<number>`coalesce(sum(${a.kcalBurned}), 0)::float8`,
        minutes: sql<number>`coalesce(sum(${a.durationMin}), 0)::float8`,
        n: sql<number>`count(*)::int`,
      })
      .from(a)
      .where(and(eq(a.userId, userId), gte(a.date, from), lte(a.date, to), isNull(a.deletedAt)))
      .groupBy(a.date),
  ]);
  const out = new Map<string, DayAgg>();
  const get = (d: string) => {
    let v = out.get(d);
    if (!v) out.set(d, (v = emptyAgg(d)));
    return v;
  };
  for (const r of foods) {
    const v = get(r.date);
    v.eaten = { kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat), fibre: Number(r.fibre) };
    v.foodLogs = Number(r.n);
    v.slots = (r.slots ?? []) as MealSlot[];
  }
  for (const r of acts) {
    const v = get(r.date);
    v.burned = Number(r.burned);
    v.minutes = Number(r.minutes);
    v.sessions = Number(r.n);
  }
  return out;
}

/** Targets frozen per day in day_facts (so past days keep the target they had), keyed by date. */
export async function dayTargets(c: Container, userId: string, from: string, to: string): Promise<Map<string, NutrientTotals>> {
  const rows = await c.db
    .select({ date: s.dayFacts.date, targets: s.dayFacts.targets })
    .from(s.dayFacts)
    .where(and(eq(s.dayFacts.userId, userId), gte(s.dayFacts.date, from), lte(s.dayFacts.date, to)));
  const out = new Map<string, NutrientTotals>();
  for (const r of rows) if (r.targets && r.targets.kcal > 0) out.set(r.date, r.targets);
  return out;
}

export function thresholdsFor(team: TeamRow, profile: ProfileRow | null | undefined): Thresholds {
  return { ...team.settings.thresholds, ...(profile?.thresholdsOverride ?? {}) } as Thresholds;
}

export function currentTargets(profile: ProfileRow): NutrientTotals | null {
  const eff = effectiveTargets(profile);
  return eff ? { kcal: eff.kcal, protein: eff.protein, carbs: eff.carbs, fat: eff.fat, fibre: eff.fibre } : null;
}

/** Calorie band for a day with the day-closed rule (SYS-CALC-21): today's "under" stays neutral until 20:00 or dinner. */
export function dayKcalBand(agg: DayAgg | undefined, target: number | null, eatBack: boolean, thresholds: Thresholds, clock: { today: string; localTime: string }) {
  if (!agg || agg.foodLogs === 0 || !target) return null;
  const budget = target + (eatBack ? agg.burned : 0);
  const closed = isDayClosed({ isToday: agg.date === clock.today, localTime: clock.localTime, loggedSlots: agg.slots });
  return bandFor('kcal', agg.eaten.kcal, budget, thresholds, closed);
}

interface Ctx {
  profile: ProfileRow;
  team: TeamRow;
  clock: MemberClock;
  targets: NutrientTotals | null;
  thresholds: Thresholds;
}

async function ctxFor(c: Container, user: AuthUser): Promise<Ctx> {
  const [profile, team] = await Promise.all([loadProfile(c, user.id), getTeam(c, user.teamId)]);
  return { profile, team, clock: memberClock(c, user.timezone), targets: currentTargets(profile), thresholds: thresholdsFor(team, profile) };
}

async function allWeights(c: Container, userId: string) {
  return c.db
    .select({ date: s.weightEntries.date, kg: s.weightEntries.weightKg })
    .from(s.weightEntries)
    .where(and(eq(s.weightEntries.userId, userId), isNull(s.weightEntries.deletedAt)))
    .orderBy(asc(s.weightEntries.date));
}

/* ───────── Weight, forecast, narrative ───────── */

const WEIGHT_RANGE_DAYS: Record<WeightProgressResponse['range'], number | null> = { '4w': 28, '3m': 91, '1y': 365, all: null };

interface ForecastBundle {
  input: ForecastInput | null;
  result: ForecastResult;
  aggs: Map<string, DayAgg>;
  loggedDates: string[];
}

function lockedForecast(sentence: string, loggedDays: number): ForecastResult {
  return { locked: true, loggedDays, avgNet: 0, sdNet: 0, weeklyChangeKg: 0, projectedAtGoalDate: null, goalEta: null, etaBeyondYear: false, series: [], sentence };
}

/** SYS-CALC-31: forecast from the weight trend and net calories of the last 21 completed, logged days. */
async function forecastBundle(c: Container, user: AuthUser, x: Ctx, trend: TrendPoint[], deltaKcal: number | null): Promise<ForecastBundle> {
  const to = addDays(x.clock.today, -1);
  const from = addDays(x.clock.today, -21);
  const aggs = await dayAggregates(c, user.id, from, to);
  const loggedDates = dateRange(from, to).filter((d) => (aggs.get(d)?.foodLogs ?? 0) > 0);
  const net = loggedDates.map((d) => {
    const a = aggs.get(d)!;
    return a.eaten.kcal - a.burned;
  });
  const trendKg = trend.at(-1)?.trend ?? x.profile.weightKg;
  const tdee = x.profile.tdee;
  if (trendKg == null || !tdee) {
    return { input: null, result: lockedForecast(trendKg == null ? 'Log your weight to unlock your forecast.' : 'Finish your profile to unlock your forecast.', loggedDates.length), aggs, loggedDates };
  }
  const input: ForecastInput = { trendKg, netKcalByDay: net, tdee, goalWeightKg: x.profile.targetWeightKg, goalDate: x.profile.targetDate, today: x.clock.today };
  const result = deltaKcal != null ? whatIf(input, deltaKcal) : forecast(input);
  return { input, result, aggs, loggedDates };
}

const toDto = (r: ForecastResult, tdee: number | null): ForecastDto => ({ ...r, tdee });

async function narrativeFor(c: Container, user: AuthUser, x: Ctx, fb: ForecastBundle): Promise<WeightProgressResponse['narrative']> {
  const templated = { text: fb.result.sentence, ai: false, aiCallId: null };
  if (fb.result.locked || !fb.input || c.ai.mode === 'off') return templated;
  try {
    const settings = await c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, user.teamId) });
    if (!settings?.globalOn || !settings.features['progress.narrative']?.on || x.profile.aiOptOuts.summary) return templated;
    const highestDays = [...fb.loggedDates]
      .sort((a, b) => fb.aggs.get(b)!.eaten.kcal - fb.aggs.get(a)!.eaten.kcal)
      .slice(0, 3)
      .map((d) => ({ date: d, weekday: WEEKDAY_NAMES[weekdayOf(d)]!, kcal: Math.round(fb.aggs.get(d)!.eaten.kcal) }));
    const activeDays = [...fb.aggs.values()].filter((a) => a.sessions > 0).length;
    const input: ProgressNarrativeInput = {
      firstName: user.displayName.split(' ')[0] ?? user.displayName,
      goal: (x.profile.goalType as ProgressNarrativeInput['goal']) ?? 'maintain',
      trendKg: round1(fb.input.trendKg),
      weeklyChangeKg: fb.result.weeklyChangeKg,
      avgNetKcal: fb.result.avgNet,
      tdee: fb.input.tdee,
      goalWeightKg: fb.input.goalWeightKg,
      etaDate: fb.result.goalEta?.date ?? null,
      loggedDays: fb.result.loggedDays,
      highestDays,
      activeDaysPerWeek: round1(activeDays / 3),
    };
    const hash = sha256(JSON.stringify(input));
    const now = c.clock.now();
    const key = and(eq(s.aiSummaries.userId, user.id), eq(s.aiSummaries.feature, 'progress.narrative'), eq(s.aiSummaries.localDate, x.clock.today));
    const cached = await c.db.query.aiSummaries.findFirst({ where: key });
    // Cached per member per local day; regenerate only when the inputs changed and the cache is over an hour old.
    if (cached && typeof cached.output.text === 'string' && (cached.inputHash === hash || now.getTime() - cached.createdAt.getTime() < 3600_000)) {
      return { text: cached.output.text, ai: true, aiCallId: cached.aiCallId };
    }
    const r = await c.ai.callFeature('progress.narrative', { teamId: user.teamId, userId: user.id, dayStart: x.clock.dayStart, memberOptedOut: x.profile.aiOptOuts.summary }, input);
    if (!r.ok) return templated;
    const values = { userId: user.id, feature: 'progress.narrative', localDate: x.clock.today, inputHash: hash, output: { text: r.data.text }, aiCallId: r.callId, createdAt: now };
    await c.db.insert(s.aiSummaries).values(values).onConflictDoUpdate({ target: [s.aiSummaries.userId, s.aiSummaries.feature, s.aiSummaries.localDate], set: values });
    return { text: r.data.text, ai: true, aiCallId: r.callId };
  } catch (e) {
    log.warn('progress.narrative_failed', { userId: user.id, error: (e as Error).message });
    return templated;
  }
}

export async function weightProgress(c: Container, user: AuthUser, range: WeightProgressResponse['range']): Promise<WeightProgressResponse> {
  const x = await ctxFor(c, user);
  const trend = weightTrend(await allWeights(c, user.id));
  const days = WEIGHT_RANGE_DAYS[range];
  const from = days != null ? addDays(x.clock.today, -days) : null;
  const points = from ? trend.filter((p) => p.date >= from) : trend;
  const last = trend.at(-1) ?? null;
  const fb = await forecastBundle(c, user, x, trend, null);
  return {
    range,
    unit: x.profile.units as 'metric' | 'imperial',
    points,
    latestKg: last?.kg ?? null,
    trendKg: last?.trend ?? null,
    deltaKg: points.length >= 2 ? round1(points.at(-1)!.trend - points[0]!.trend) : null,
    goalKg: x.profile.targetWeightKg,
    goalDate: x.profile.targetDate,
    forecast: toDto(fb.result, x.profile.tdee),
    narrative: await narrativeFor(c, user, x, fb),
  };
}

/** APP-PROG-02 "what if": the forecast with the daily net shifted by `delta` kcal (clamped to ±200 by the domain). */
export async function whatIfForecast(c: Container, user: AuthUser, delta: number): Promise<ForecastDto> {
  const x = await ctxFor(c, user);
  const trend = weightTrend(await allWeights(c, user.id));
  const fb = await forecastBundle(c, user, x, trend, delta);
  return toDto(fb.result, x.profile.tdee);
}

/* ───────── Calories ───────── */

const CAL_RANGE_DAYS: Record<CaloriesProgressResponse['range'], number> = { '1w': 7, '4w': 28, '3m': 91 };

export async function caloriesProgress(c: Container, user: AuthUser, range: CaloriesProgressResponse['range']): Promise<CaloriesProgressResponse> {
  const x = await ctxFor(c, user);
  const { today } = x.clock;
  const from = addDays(today, -(CAL_RANGE_DAYS[range] - 1));
  const [aggs, targets, weights] = await Promise.all([dayAggregates(c, user.id, from, today), dayTargets(c, user.id, from, today), allWeights(c, user.id)]);
  const days: CaloriesProgressResponse['days'] = dateRange(from, today).map((date) => {
    const a = aggs.get(date);
    const target = targets.get(date)?.kcal ?? x.targets?.kcal ?? null;
    const burned = Math.round(a?.burned ?? 0);
    const budget = target != null ? target + (x.profile.eatBackExercise ? burned : 0) : null;
    const band = dayKcalBand(a, target, x.profile.eatBackExercise, x.thresholds, x.clock);
    const cls: CaloriesProgressResponse['days'][number]['cls'] = !band || band.band === 'neutral' ? 'none' : band.band === 'green' ? 'in' : band.direction === 'over' ? 'over' : 'under';
    return { date, eaten: Math.round(a?.eaten.kcal ?? 0), burned, target, budget, cls, isToday: date === today, logged: (a?.foodLogs ?? 0) > 0 };
  });
  // Averages use completed days; today joins once it is closed (or when it is the only logged day).
  const closedLogged = days.filter((d) => d.logged && (!d.isToday || d.cls !== 'none'));
  const basis = closedLogged.length ? closedLogged : days.filter((d) => d.logged);
  const trend = weightTrend(weights).filter((p) => p.date >= from);
  return {
    range,
    days,
    avgIn: basis.length ? Math.round(basis.reduce((acc, d) => acc + d.eaten, 0) / basis.length) : 0,
    totalBurned: days.reduce((acc, d) => acc + d.burned, 0),
    weightChangeKg: trend.length >= 2 ? round1(trend.at(-1)!.trend - trend[0]!.trend) : null,
    daysInRange: days.filter((d) => d.cls === 'in').length,
    daysLogged: days.filter((d) => d.logged).length,
  };
}

/* ───────── Nutrients week grid ───────── */

const GRID_NUTRIENTS = ['protein', 'carbs', 'fat', 'fibre'] as const satisfies readonly Exclude<Nutrient, 'kcal'>[];

export async function nutrientGrid(c: Container, user: AuthUser, weekStartParam?: string): Promise<NutrientGridResponse> {
  const x = await ctxFor(c, user);
  const weekStart = weekStartOf(weekStartParam ?? x.clock.today);
  const end = addDays(weekStart, 6);
  const [aggs, targets] = await Promise.all([dayAggregates(c, user.id, weekStart, end), dayTargets(c, user.id, weekStart, end)]);
  const greenCounts = { protein: 0, carbs: 0, fat: 0, fibre: 0 };
  const days: NutrientGridResponse['days'] = dateRange(weekStart, end).map((date) => {
    const a = aggs.get(date);
    const t = targets.get(date) ?? x.targets;
    const logged = (a?.foodLogs ?? 0) > 0 && date <= x.clock.today;
    const bands = { protein: null, carbs: null, fat: null, fibre: null } as NutrientGridResponse['days'][number]['bands'];
    if (logged && a && t) {
      const closed = isDayClosed({ isToday: date === x.clock.today, localTime: x.clock.localTime, loggedSlots: a.slots });
      for (const n of GRID_NUTRIENTS) {
        const b = bandFor(n, a.eaten[n], t[n], x.thresholds, closed);
        bands[n] = { band: b.band, label: b.label };
        if (b.band === 'green') greenCounts[n]++;
      }
    }
    return { date, logged, bands };
  });
  return { weekStart, days, greenCounts };
}

/* ───────── Activity ───────── */

export const RECORD_LABELS: Record<PersonalRecord, string> = {
  longest_run: 'Longest run',
  longest_swim: 'Longest swim',
  longest_ride: 'Longest ride',
  longest_streak: 'Longest streak',
  most_sessions_week: 'Most sessions in a week',
};

export async function activityProgress(c: Container, user: AuthUser): Promise<ActivityProgressResponse> {
  const { today } = memberClock(c, user.timezone);
  const current = weekStartOf(today);
  const first = addDays(current, -77);
  const [logs, plan, records] = await Promise.all([
    c.db
      .select({ date: s.activityLogs.date, minutes: s.activityLogs.durationMin, kcal: s.activityLogs.kcalBurned })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, user.id), gte(s.activityLogs.date, first), lte(s.activityLogs.date, addDays(current, 6)), isNull(s.activityLogs.deletedAt))),
    activePlanItems(c, user.id),
    c.db.query.personalRecords.findMany({ where: eq(s.personalRecords.userId, user.id) }),
  ]);
  let planned = 0;
  for (const i of plan.items) planned += i.perWeek ?? Math.ceil((i.perMonth ?? 0) / 4);
  const weeks: ActivityProgressResponse['weeks'] = [];
  for (let w = first; w <= current; w = addDays(w, 7)) {
    const wl = logs.filter((l) => l.date >= w && l.date <= addDays(w, 6));
    weeks.push({ weekStart: w, sessions: wl.length, planned, minutes: Math.round(wl.reduce((a, l) => a + l.minutes, 0)), burn: Math.round(wl.reduce((a, l) => a + l.kcal, 0)) });
  }
  return {
    weeks,
    records: records
      .filter((r) => r.record in RECORD_LABELS)
      .map((r) => ({ record: r.record as PersonalRecord, label: RECORD_LABELS[r.record as PersonalRecord], value: r.value, unit: r.unit, date: r.achievedOn }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    hasPlan: plan.items.length > 0,
  };
}

/* ───────── Consistency ───────── */

export interface WeekConsistency extends ConsistencyResult {
  weekStart: string;
  sessions: number;
}

/**
 * SYS-CALC-33 per ISO week: 40 % days with a food log, 30 % days in the calorie band, 30 % plan adherence. Weeks before
 * the member joined are skipped; today only counts once something is logged for it.
 */
export async function consistencyWeeks(c: Container, userId: string, weekStarts: string[], today: string): Promise<WeekConsistency[]> {
  if (!weekStarts.length) return [];
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  if (!user || !profile) return [];
  const team = await getTeam(c, user.teamId);
  const tz = user.timezone || team.timezone;
  const joined = localDateOf(user.createdAt, tz);
  const sorted = [...weekStarts].sort();
  const from = sorted[0]!;
  const to = addDays(sorted.at(-1)!, 6) < today ? addDays(sorted.at(-1)!, 6) : today;
  const [aggs, targets, plan, acts] = await Promise.all([
    dayAggregates(c, userId, from, to),
    dayTargets(c, userId, from, to),
    activePlanItems(c, userId),
    c.db
      .select({ id: s.activityLogs.id, typeId: s.activityLogs.typeId, planItemId: s.activityLogs.planItemId, date: s.activityLogs.date })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, userId), gte(s.activityLogs.date, from), lte(s.activityLogs.date, to), isNull(s.activityLogs.deletedAt))),
  ]);
  const thresholds = thresholdsFor(team, profile);
  const cur = currentTargets(profile);
  const weekly = plan.items.filter((i) => (i.perWeek ?? 0) > 0);
  const out: WeekConsistency[] = [];
  for (const w of sorted) {
    const end = addDays(w, 6) < today ? addDays(w, 6) : today;
    if (end < joined || w > today) continue;
    const start = w < joined ? joined : w;
    let days = dateRange(start, end);
    if (end === today && !(aggs.get(today)?.foodLogs ?? 0) && days.length > 1) days = days.slice(0, -1);
    let food = 0;
    let inBand = 0;
    for (const d of days) {
      const a = aggs.get(d);
      if (!a || a.foodLogs === 0) continue;
      food++;
      const t = targets.get(d)?.kcal ?? cur?.kcal ?? 0;
      if (t && dayCalorieClass(a.eaten.kcal, t + (profile.eatBackExercise ? a.burned : 0), thresholds) === 'in') inBand++;
    }
    const weekActs = acts.filter((l) => l.date >= w && l.date <= addDays(w, 6));
    let planDone: number | null = null;
    let planTarget: number | null = null;
    if (weekly.length) {
      const counts = attributeLogs(weekly, weekActs);
      planTarget = weekly.reduce<number>((acc, i) => acc + (i.perWeek ?? 0), 0);
      planDone = weekly.reduce<number>((acc, i) => acc + Math.min(counts.get(i.id) ?? 0, i.perWeek ?? 0), 0);
    }
    const r = consistencyScore({ days: days.length, daysWithFoodLog: food, daysInCalorieBand: inBand, planDone, planTarget });
    out.push({ ...r, weekStart: w, sessions: weekActs.length });
  }
  return out;
}

export async function consistencyProgress(c: Container, user: AuthUser): Promise<ConsistencyResponse> {
  const { today } = memberClock(c, user.timezone);
  const current = weekStartOf(today);
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(current, -7 * (11 - i)));
  const rows = await consistencyWeeks(c, user.id, weeks, today);
  const cur = rows.find((r) => r.weekStart === current) ?? rows.at(-1);
  return {
    current: cur
      ? { weekStart: cur.weekStart, score: cur.score, word: cur.word, components: cur.components }
      : { weekStart: current, score: 0, word: 'rough week', components: { logging: 0, inBand: 0, plan: 0 } },
    history: rows.map((r) => ({ weekStart: r.weekStart, score: r.score })),
  };
}

/* ───────── Recaps ───────── */

export async function listRecaps(c: Container, user: AuthUser): Promise<RecapDto[]> {
  const rows = await c.db.query.weeklyRecaps.findMany({ where: eq(s.weeklyRecaps.userId, user.id), orderBy: [desc(s.weeklyRecaps.weekStart)], limit: 8 });
  return rows.map((r) => ({ weekStart: r.weekStart, highlight: r.highlight, tryNext: r.tryNext, teamFact: r.teamFact, stats: r.stats, createdAt: r.createdAt.toISOString() }));
}
