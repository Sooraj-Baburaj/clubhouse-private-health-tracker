import { describe, expect, it } from 'vitest';
import { DEFAULT_MEAL_SLOTS } from '@clubhouse/contracts';
import { localDateOf, localTimeOf, nextSendAt, pickLine, quietHoursEnd, slotForTime, slotWindows, smartTime, suppressionReason, weekdayOf, weekStartOf, zonedToUtc } from '../src';

describe('time helpers', () => {
  it('handles member-local dates and IST offsets', () => {
    const t = new Date('2026-09-30T19:00:00Z'); // 00:30 IST next day
    expect(localDateOf(t, 'Asia/Kolkata')).toBe('2026-10-01');
    expect(localTimeOf(t, 'Asia/Kolkata')).toBe('00:30');
    expect(zonedToUtc('2026-10-01', '09:30', 'Asia/Kolkata').toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
  it('weekday 0 = Monday', () => {
    expect(weekdayOf('2026-09-28')).toBe(0);
    expect(weekdayOf('2026-10-04')).toBe(6);
    expect(weekStartOf('2026-10-01')).toBe('2026-09-28');
  });
  it('handles a DST zone', () => {
    // 2026-03-08 02:30 does not exist in New York; TZDate resolves to a valid instant.
    const d = zonedToUtc('2026-03-08', '02:30', 'America/New_York');
    expect(Number.isFinite(d.getTime())).toBe(true);
    expect(localDateOf(d, 'America/New_York')).toBe('2026-03-08');
  });
});

describe('meal slots (APP-HOME-24)', () => {
  it('pre-selects from the time of day', () => {
    expect(slotForTime('08:00', DEFAULT_MEAL_SLOTS)).toBe('breakfast');
    expect(slotForTime('10:30', DEFAULT_MEAL_SLOTS)).toBe('morning_snack');
    expect(slotForTime('13:00', DEFAULT_MEAL_SLOTS)).toBe('lunch');
    expect(slotForTime('17:00', DEFAULT_MEAL_SLOTS)).toBe('evening_snack');
    expect(slotForTime('21:00', DEFAULT_MEAL_SLOTS)).toBe('dinner');
  });
});

describe('smart time (SYS-NOTIF-04)', () => {
  const w = slotWindows(DEFAULT_MEAL_SLOTS).lunch;
  it('median minus 10 minutes, clamped, default under 5 samples', () => {
    expect(smartTime([780, 790, 800, 810, 820], '13:30', w)).toBe('13:10');
    expect(smartTime([780, 790], '13:30', w)).toBe('13:30');
    expect(smartTime([600, 600, 600, 600, 600], '13:30', w)).toBe('12:00');
  });
});

describe('next send (SYS-NOTIF-03/06)', () => {
  const tz = 'Asia/Kolkata';
  it('picks the next matching day and skips the date already sent', () => {
    const now = new Date('2026-09-30T02:00:00Z'); // 07:30 IST
    const at = nextSendAt({ slots: [{ weekday: 2, time: '09:30' }], tz, now, quiet: { start: '22:00', end: '07:00' } });
    expect(at!.toISOString()).toBe('2026-09-30T04:00:00.000Z');
    const next = nextSendAt({ slots: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, time: '09:30' })), tz, now, lastSentLocalDate: '2026-09-30', quiet: null });
    expect(next!.toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
  it('drops slots inside quiet hours', () => {
    const now = new Date('2026-09-30T02:00:00Z');
    expect(nextSendAt({ slots: [{ weekday: 2, time: '23:00' }], tz, now, quiet: { start: '22:00', end: '07:00' } })).toBeNull();
  });
  it('announcements wait until quiet hours end', () => {
    const now = new Date('2026-09-30T18:00:00Z'); // 23:30 IST
    expect(quietHoursEnd(now, tz, { start: '22:00', end: '07:00' }).toISOString()).toBe('2026-10-01T01:30:00.000Z');
  });
});

describe('suppression (SYS-NOTIF-05/07)', () => {
  const now = new Date('2026-09-30T08:00:00Z');
  const base = { type: 'lunch_reminder' as const, enabled: true, alreadyLogged: false, lastActiveAt: null, lastSameTypeSentAt: null, inQuietHours: false, onVacation: false, chatMutedUntil: null, onChatScreen: false, newChatMessages: 0, now };
  it('suppresses reminders that are already done or recently active', () => {
    expect(suppressionReason(base)).toBeNull();
    expect(suppressionReason({ ...base, alreadyLogged: true })).toBe('already_logged');
    expect(suppressionReason({ ...base, lastActiveAt: new Date(now.getTime() - 5 * 60_000) })).toBe('active_in_app');
    expect(suppressionReason({ ...base, onVacation: true })).toBe('vacation');
    expect(suppressionReason({ ...base, lastSameTypeSentAt: new Date(now.getTime() - 3600_000) })).toBe('recently_sent');
    expect(suppressionReason({ ...base, inQuietHours: true })).toBe('quiet_hours');
  });
  it('digests need 3 messages and respect mute and the chat screen', () => {
    expect(suppressionReason({ ...base, type: 'chat_digest', newChatMessages: 2 })).toBe('too_few_messages');
    expect(suppressionReason({ ...base, type: 'chat_digest', newChatMessages: 5 })).toBeNull();
    expect(suppressionReason({ ...base, type: 'chat_mention', onChatScreen: true })).toBe('on_chat_screen');
    expect(suppressionReason({ ...base, type: 'chat_mention', chatMutedUntil: new Date(now.getTime() + 1000) })).toBe('muted');
  });
  it('copy lines are picked deterministically', () => {
    expect(pickLine(['a', 'b', 'c'], 'x')).toBe(pickLine(['a', 'b', 'c'], 'x'));
  });
});
