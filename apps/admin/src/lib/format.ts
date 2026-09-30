/** Formatting helpers for the admin panel. Numbers use en-IN grouping to match the member app. */

const LOCALE = 'en-IN';

export function fmtInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString(LOCALE);
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Fraction (0..1) or percent (0..100) → "46%". Pass `isFraction` when the input is 0..1. */
export function fmtPct(n: number | null | undefined, isFraction = false, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  const v = isFraction ? n * 100 : n;
  return `${v.toFixed(digits)}%`;
}

export function fmtBytes(b: number | null | undefined): string {
  if (b == null || Number.isNaN(b)) return '—';
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function fmtKcal(n: number | null | undefined): string {
  return n == null ? '—' : `${fmtInt(n)} kcal`;
}

export function fmtKg(n: number | null | undefined): string {
  return n == null ? '—' : `${fmtNum(n, 1)} kg`;
}

export function fmtMs(n: number | null | undefined): string {
  if (n == null) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`;
}

function toDate(v: string | Date): Date {
  if (v instanceof Date) return v;
  // Local calendar dates (YYYY-MM-DD) are parsed at local noon so they never shift a day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00`);
  return new Date(v);
}

/** "30 Sept" / "30 Sept 2025" when not the current year. */
export function fmtDate(v: string | Date | null | undefined, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!v) return '—';
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    ...(opts.weekday ? { weekday: 'short' } : {}),
    ...(opts.year || !sameYear ? { year: 'numeric' } : {}),
  });
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = toDate(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(d)}, ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export function fmtTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = toDate(v);
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "2m ago", "3h ago", "Yesterday", "4 days ago", then a date. */
export function fmtRelative(v: string | Date | null | undefined, never = 'Never'): string {
  if (!v) return never;
  const d = toDate(v);
  const diff = Date.now() - d.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60_000);
  if (min < 1) return future ? 'in a moment' : 'just now';
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const days = Math.round(h / 24);
  if (!future && days === 1) return 'Yesterday';
  if (days < 7) return future ? `in ${days} days` : `${days} days ago`;
  return fmtDate(d);
}

/** Today's local date as YYYY-MM-DD. */
export function todayLocal(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `datetime-local` input value ↔ ISO string with offset. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromDateTimeLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  morning_snack: 'Morning snack',
  lunch: 'Lunch',
  evening_snack: 'Evening snack',
  dinner: 'Dinner',
};

/** snake_case / dotted keys → "Sentence case". */
export function humanize(key: string): string {
  const s = key.replace(/[._]/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}
