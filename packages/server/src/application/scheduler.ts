import { and, eq, isNull } from 'drizzle-orm';
import { SCHEDULED_NOTIFICATION_TYPES, SLOT_REMINDER, type MealSlot, type NotificationType } from '@clubhouse/contracts';
import { hhmmToMinutes, minutesToHHmm, nextSendAt, slotsFromPreference, type ScheduleSlot } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { habitReminderSlots } from './habits';
import { getTeam } from './team';

const SLOT_BY_TYPE = Object.fromEntries(Object.entries(SLOT_REMINDER).map(([slot, type]) => [type, slot])) as Record<string, MealSlot>;

/** Weekly (weekday, time) slots for a scheduled type, using smart times for meals and plan days for activity. */
export async function slotsFor(c: Container, userId: string, type: NotificationType, pref: { enabled: boolean; time: string | null; days: number[]; smartTime: boolean }, smartTimes: Record<string, string>): Promise<ScheduleSlot[]> {
  if (!pref.enabled) return [];
  if (type === 'habit_reminder') {
    const u = await c.db.query.users.findFirst({ where: eq(s.users.id, userId), columns: { teamId: true } });
    return u ? habitReminderSlots(c, userId, u.teamId, pref.days) : [];
  }
  if (type === 'activity_reminder') {
    const plan = await c.db.query.activityPlans.findFirst({ where: eq(s.activityPlans.userId, userId) });
    if (!plan) return [];
    const items = await c.db.query.activityPlanItems.findMany({ where: and(eq(s.activityPlanItems.planId, plan.id), isNull(s.activityPlanItems.archivedAt)) });
    const out: ScheduleSlot[] = [];
    for (const item of items) {
      const days = await c.db.query.activityPlanDays.findMany({ where: eq(s.activityPlanDays.itemId, item.id) });
      for (const d of days) {
        let m = hhmmToMinutes(d.time) - 30;
        let wd = d.weekday;
        if (m < 0) {
          m += 1440;
          wd = (wd + 6) % 7;
        }
        if (pref.days.includes(d.weekday)) out.push({ weekday: wd, time: minutesToHHmm(m) });
      }
    }
    return out;
  }
  const slot = SLOT_BY_TYPE[type];
  const time = slot && pref.smartTime && smartTimes[slot] ? smartTimes[slot]! : pref.time;
  return slotsFromPreference(time, pref.days);
}

/** Recompute `next_send_at` for every scheduled type of a member (SYS-NOTIF-03). */
export async function rescheduleUser(c: Container, userId: string, onlyType?: NotificationType) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  if (!user || !profile) return;
  const team = await getTeam(c, user.teamId);
  const tz = user.timezone || team.timezone;
  const schedules = await c.db.query.notificationSchedules.findMany({ where: eq(s.notificationSchedules.userId, userId) });
  const prefs = await c.db.query.notificationPreferences.findMany({ where: eq(s.notificationPreferences.userId, userId) });
  const now = c.clock.now();
  for (const sch of schedules) {
    if (onlyType && sch.type !== onlyType) continue;
    // Event-driven rows (chat digests) are armed by chat posts, not by preferences; leave their pending time alone.
    if (!SCHEDULED_NOTIFICATION_TYPES.includes(sch.type as NotificationType)) continue;
    const pref = prefs.find((p) => p.type === sch.type);
    let next: Date | null = null;
    if (pref && user.status === 'active' && profile.notificationsMaster && user.onboardedAt) {
      const slots = await slotsFor(c, userId, sch.type as NotificationType, { enabled: pref.enabled, time: pref.time, days: pref.days, smartTime: pref.smartTime }, profile.smartTimes);
      // Habit reminders go out at several times a day (one per time slot), so a send today doesn't close the day.
      const lastSentLocalDate = sch.type === 'habit_reminder' ? null : sch.lastSentLocalDate;
      next = nextSendAt({ slots, tz, now, lastSentLocalDate, quiet: profile.quietHours });
    }
    await c.db
      .update(s.notificationSchedules)
      .set({ nextSendAt: next, claimedAt: null, updatedAt: now })
      .where(and(eq(s.notificationSchedules.userId, userId), eq(s.notificationSchedules.type, sch.type)));
  }
}
