import type { MealSlot, NotificationType, QuietHours } from '@clubhouse/contracts';
import { SLOT_ORDER } from './constants';
import { addDays, hhmmToMinutes, inWindow, localDateOf, localMinutesOf, minutesToHHmm, weekdayOf, zonedToUtc } from './time';

export interface SlotWindowDef {
  from: string;
  to: string;
}

/** Derive each slot's [from, to) window from the team's "until" times (breakfast starts 04:00, dinner ends 23:59). */
export function slotWindows(mealSlots: Record<MealSlot, { until: string | null }>): Record<MealSlot, SlotWindowDef> {
  const out = {} as Record<MealSlot, SlotWindowDef>;
  let from = '04:00';
  for (const slot of SLOT_ORDER) {
    const to = mealSlots[slot]?.until ?? '23:59';
    out[slot] = { from, to };
    from = to;
  }
  return out;
}

/** APP-HOME-24: pre-select the meal slot from the time of day. */
export function slotForTime(hhmm: string, mealSlots: Record<MealSlot, { until: string | null }>): MealSlot {
  const m = hhmmToMinutes(hhmm);
  for (const slot of SLOT_ORDER) {
    const until = mealSlots[slot]?.until;
    if (until == null || m < hhmmToMinutes(until)) return slot;
  }
  return 'dinner';
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** SYS-NOTIF-04: median log time for the slot over 14 days minus 10 minutes, clamped to the window; < 5 samples → default. */
export function smartTime(sampleMinutes: number[], defaultTime: string, window: SlotWindowDef): string {
  if (sampleMinutes.length < 5) return defaultTime;
  const t = median(sampleMinutes) - 10;
  const lo = hhmmToMinutes(window.from);
  const hi = hhmmToMinutes(window.to) - 1;
  return minutesToHHmm(Math.max(lo, Math.min(hi, t)));
}

export function inQuietHours(instant: Date, tz: string, quiet: QuietHours): boolean {
  if (!quiet) return false;
  return inWindow(localMinutesOf(instant, tz), quiet.start, quiet.end);
}

/** The instant the current quiet window ends (for announcements, which wait instead of being dropped). */
export function quietHoursEnd(instant: Date, tz: string, quiet: NonNullable<QuietHours>): Date {
  const today = localDateOf(instant, tz);
  const endToday = zonedToUtc(today, quiet.end, tz);
  if (endToday.getTime() > instant.getTime()) return endToday;
  return zonedToUtc(addDays(today, 1), quiet.end, tz);
}

export interface ScheduleSlot {
  weekday: number; // 0 = Monday
  time: string;
}

/**
 * Next send instant strictly after `now` for a set of weekly (weekday, time) slots, skipping the local date already
 * sent and any slot that falls inside quiet hours (reminders due in quiet hours are dropped, SYS-NOTIF-06).
 */
export function nextSendAt(opts: {
  slots: ScheduleSlot[];
  tz: string;
  now: Date;
  lastSentLocalDate?: string | null;
  quiet: QuietHours;
  horizonDays?: number;
}): Date | null {
  if (!opts.slots.length) return null;
  const today = localDateOf(opts.now, opts.tz);
  let best: Date | null = null;
  for (let d = 0; d <= (opts.horizonDays ?? 8); d++) {
    const date = addDays(today, d);
    const wd = weekdayOf(date);
    for (const s of opts.slots) {
      if (s.weekday !== wd) continue;
      if (opts.lastSentLocalDate && date === opts.lastSentLocalDate) continue;
      const at = zonedToUtc(date, s.time, opts.tz);
      if (at.getTime() <= opts.now.getTime()) continue;
      if (opts.quiet && inWindow(hhmmToMinutes(s.time), opts.quiet.start, opts.quiet.end)) continue;
      if (!best || at < best) best = at;
    }
    if (best) return best;
  }
  return best;
}

export function slotsFromPreference(time: string | null, days: number[]): ScheduleSlot[] {
  if (!time) return [];
  return days.map((weekday) => ({ weekday, time }));
}

export type SuppressionReason =
  | 'already_logged'
  | 'active_in_app'
  | 'quiet_hours'
  | 'vacation'
  | 'recently_sent'
  | 'too_few_messages'
  | 'on_chat_screen'
  | 'muted'
  | 'disabled';

export interface SuppressionContext {
  type: NotificationType;
  enabled: boolean;
  alreadyLogged: boolean;
  lastActiveAt: Date | null;
  lastSameTypeSentAt: Date | null;
  inQuietHours: boolean;
  onVacation: boolean;
  chatMutedUntil: Date | null;
  onChatScreen: boolean;
  newChatMessages: number;
  now: Date;
}

const REMINDER_TYPES: NotificationType[] = [
  'breakfast_reminder',
  'morning_snack_reminder',
  'lunch_reminder',
  'evening_snack_reminder',
  'dinner_reminder',
  'activity_reminder',
  'momentum_at_risk',
  'weigh_in_reminder',
  'habit_reminder',
];

/** SYS-NOTIF-05/06/07: decide whether a due notification is suppressed. `null` = send. */
export function suppressionReason(ctx: SuppressionContext): SuppressionReason | null {
  if (!ctx.enabled) return 'disabled';
  const isReminder = REMINDER_TYPES.includes(ctx.type);
  if (ctx.type === 'announcement') return null; // waits for quiet hours instead (handled by the scheduler)
  if (ctx.inQuietHours) return 'quiet_hours';
  if (isReminder) {
    if (ctx.onVacation) return 'vacation';
    if (ctx.alreadyLogged) return 'already_logged';
    if (ctx.lastActiveAt && ctx.now.getTime() - ctx.lastActiveAt.getTime() < 10 * 60_000) return 'active_in_app';
    // Habit reminders fire at several times a day (one bundle per time slot), so they skip the 4-hour spacing.
    if (ctx.type !== 'habit_reminder' && ctx.lastSameTypeSentAt && ctx.now.getTime() - ctx.lastSameTypeSentAt.getTime() < 4 * 3600_000) return 'recently_sent';
  }
  if (ctx.type === 'chat_digest' || ctx.type === 'chat_mention') {
    if (ctx.chatMutedUntil && ctx.chatMutedUntil > ctx.now) return 'muted';
    if (ctx.onChatScreen) return 'on_chat_screen';
    if (ctx.type === 'chat_digest' && ctx.newChatMessages < 3) return 'too_few_messages';
  }
  return null;
}

/** Deterministic pick from a copy pool so a retried send uses the same line (SYS-NOTIF-12). */
export function pickLine(lines: string[], seed: string): string {
  if (!lines.length) return '';
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return lines[Math.abs(h) % lines.length]!;
}

export function fillTemplate(line: string, vars: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] != null ? String(vars[k]) : ''));
}
