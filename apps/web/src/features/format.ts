import type { MealSlot } from '@clubhouse/contracts';

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  morning_snack: 'Morning snack',
  lunch: 'Lunch',
  evening_snack: 'Evening snack',
  dinner: 'Dinner',
};

/** APP-FUN-04: numbers rounded for people. */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
export const fmtKcal = (n: number) => `${fmt(n)} kcal`;
export const fmtG = (n: number) => `${Math.round(n)} g`;
export const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function greeting(localTime: string, name: string) {
  const h = Number(localTime.slice(0, 2));
  const n = firstName(name);
  if (h < 5) return `Late one, ${n}`;
  if (h < 12) return `Morning, ${n}`;
  if (h < 17) return `Let’s go, ${n}`;
  return `Evening, ${n}`;
}

export function dateLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' });
}

export function relativeTime(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function timeOf(iso: string, tz?: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

/** "13:20" → "1:20 pm". */
export function clockLabel(hhmm: string) {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export const GOAL_WORD = { lose: 'Cutting', maintain: 'Holding steady', gain: 'Building' } as const;
