import { TZDate } from '@date-fns/tz';

/** Calendar-date arithmetic on 'YYYY-MM-DD' strings, independent of any timezone. */
const DAY_MS = 86_400_000;

function parseDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}
function formatDate(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Member-local calendar date of an instant. */
export function localDateOf(instant: Date, tz: string): string {
  const z = new TZDate(instant.getTime(), tz);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  const d = String(z.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Member-local wall-clock time ('HH:mm') of an instant. */
export function localTimeOf(instant: Date, tz: string): string {
  const z = new TZDate(instant.getTime(), tz);
  return `${String(z.getHours()).padStart(2, '0')}:${String(z.getMinutes()).padStart(2, '0')}`;
}

export function localMinutesOf(instant: Date, tz: string): number {
  const z = new TZDate(instant.getTime(), tz);
  return z.getHours() * 60 + z.getMinutes();
}

/** ISO weekday of the local date: 0 = Monday … 6 = Sunday. */
export function weekdayOf(date: string): number {
  const dow = new Date(parseDate(date)).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

export function addDays(date: string, days: number): string {
  return formatDate(parseDate(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minutesToHHmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * The UTC instant of a member-local wall-clock time. For DST gaps the later valid instant is used;
 * for DST overlaps the first occurrence is used (TZDate semantics).
 */
export function zonedToUtc(date: string, hhmm: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const z = new TZDate(y, mo - 1, d, h, mi, 0, 0, tz);
  return new Date(z.getTime());
}

/** Start of the member-local day as a UTC instant. */
export function startOfLocalDay(date: string, tz: string): Date {
  return zonedToUtc(date, '00:00', tz);
}

export function isoWeekKey(date: string): string {
  // Week key = the Monday date of that week; stable and sortable.
  return weekStartOf(date);
}

/** Hours after local midnight when the day before counts as settled (late-night logs still land on it). */
export const SETTLE_HOURS = 3;

/** The last member-local date that has ended and settled: yesterday, once local time is past 03:00. */
export function lastSettledDate(now: Date, tz: string): string {
  return addDays(localDateOf(new Date(now.getTime() - SETTLE_HOURS * 3600_000), tz), -1);
}

/** ISO-8601 week number ("Week 41"): the week with the year's first Thursday is week 1. */
export function isoWeekNumber(date: string): number {
  const thursday = addDays(weekStartOf(date), 3);
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(yearStart, thursday) / 7) + 1;
}

/** True when `minutes` falls inside [from, to), handling windows that wrap past midnight. */
export function inWindow(minutes: number, from: string, to: string): boolean {
  const a = hhmmToMinutes(from);
  const b = hhmmToMinutes(to);
  if (a === b) return false;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}
