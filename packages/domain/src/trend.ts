import { KCAL_PER_KG } from './constants';
import { addDays, daysBetween } from './time';

export interface WeighIn {
  date: string;
  kg: number;
}

export interface TrendPoint {
  date: string;
  kg: number;
  trend: number;
}

/** SYS-CALC-30: exponential moving average of daily weigh-ins with smoothing 0.1. */
export function weightTrend(entries: WeighIn[], alpha = 0.1): TrendPoint[] {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  for (const e of sorted) {
    trend = trend == null ? e.kg : trend + alpha * (e.kg - trend);
    out.push({ date: e.date, kg: e.kg, trend: Math.round(trend * 100) / 100 });
  }
  return out;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface ForecastInput {
  trendKg: number;
  /** Net calories (eaten − burned) for up to the last 21 logged days. */
  netKcalByDay: number[];
  tdee: number;
  goalWeightKg: number | null;
  goalDate: string | null;
  today: string;
}

export interface ForecastResult {
  locked: boolean;
  loggedDays: number;
  avgNet: number;
  sdNet: number;
  /** kg per week; negative = losing. */
  weeklyChangeKg: number;
  projectedAtGoalDate: { date: string; kg: number; lowKg: number; highKg: number } | null;
  goalEta: { date: string; weeks: number } | null;
  etaBeyondYear: boolean;
  series: { date: string; kg: number; lowKg: number; highKg: number }[];
  sentence: string;
}

const MIN_DAYS = 7;
const MAX_WEEKS = 52;

/** SYS-CALC-31/32: projected weight = trend + (avg net − TDEE) × days ÷ 7,700, band ± SD of net. */
export function forecast(input: ForecastInput): ForecastResult {
  const days = input.netKcalByDay.slice(-21);
  const loggedDays = days.length;
  const base: ForecastResult = {
    locked: loggedDays < MIN_DAYS,
    loggedDays,
    avgNet: 0,
    sdNet: 0,
    weeklyChangeKg: 0,
    projectedAtGoalDate: null,
    goalEta: null,
    etaBeyondYear: false,
    series: [],
    sentence: `Log ${Math.max(0, MIN_DAYS - loggedDays)} more day${MIN_DAYS - loggedDays === 1 ? '' : 's'} to unlock your forecast.`,
  };
  if (base.locked) return base;
  const avgNet = mean(days);
  const sdNet = stdDev(days);
  const dailyBalance = avgNet - input.tdee;
  const dailyKg = dailyBalance / KCAL_PER_KG;
  const weeklyChangeKg = Math.round(dailyKg * 7 * 100) / 100;
  // Band: the same projection with the daily net shifted by ± one standard deviation (SYS-CALC-31).
  const at = (d: number) => {
    const kg = input.trendKg + dailyKg * d;
    const spread = (sdNet * d) / KCAL_PER_KG;
    return { kg: round1(kg), lowKg: round1(kg - spread), highKg: round1(kg + spread) };
  };
  const horizon = input.goalDate ? Math.max(7, daysBetween(input.today, input.goalDate)) : 84;
  const series = [] as ForecastResult['series'];
  for (let d = 0; d <= Math.min(horizon, 366); d += 7) series.push({ date: addDays(input.today, d), ...at(d) });

  let projectedAtGoalDate: ForecastResult['projectedAtGoalDate'] = null;
  if (input.goalDate && input.goalDate > input.today) {
    projectedAtGoalDate = { date: input.goalDate, ...at(daysBetween(input.today, input.goalDate)) };
  }
  let goalEta: ForecastResult['goalEta'] = null;
  let etaBeyondYear = false;
  if (input.goalWeightKg != null) {
    const toGo = input.goalWeightKg - input.trendKg;
    if (Math.abs(toGo) < 0.1) goalEta = { date: input.today, weeks: 0 };
    else if (dailyKg !== 0 && Math.sign(toGo) === Math.sign(dailyKg)) {
      const d = toGo / dailyKg;
      if (d / 7 > MAX_WEEKS) etaBeyondYear = true;
      else goalEta = { date: addDays(input.today, Math.ceil(d)), weeks: Math.round((d / 7) * 10) / 10 };
    } else etaBeyondYear = true;
  }
  const net = Math.round(Math.abs(dailyBalance) / 10) * 10;
  const direction = dailyBalance < 0 ? 'under' : 'over';
  const kgWeek = Math.abs(Math.round(weeklyChangeKg * 20) / 20);
  const verb = dailyBalance < 0 ? 'lose' : 'gain';
  const sentence =
    net < 30
      ? 'Your average net is right at maintenance, which points to holding steady.'
      : `Your average net is ${net.toLocaleString('en-IN')} kcal ${direction}, which points to about ${kgWeek} kg a week to ${verb}.`;
  return { ...base, locked: false, avgNet: Math.round(avgNet), sdNet: Math.round(sdNet), weeklyChangeKg, projectedAtGoalDate, goalEta, etaBeyondYear, series, sentence };
}

/** APP-PROG-02 "what if": re-run the forecast with the daily net shifted by up to ±200 kcal. */
export function whatIf(input: ForecastInput, deltaKcal: number): ForecastResult {
  const d = Math.max(-200, Math.min(200, deltaKcal));
  return forecast({ ...input, netKcalByDay: input.netKcalByDay.map((x) => x + d) });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
