import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  LOCKED_NOTIFICATION_TYPES,
  NOTIFICATION_TYPES,
  SCHEDULED_NOTIFICATION_TYPES,
  SLOT_REMINDER,
  type InboxResponse,
  type MealSlot,
  type NotificationDto,
  type NotificationPrefDto,
  type NotificationPrefUpdate,
  type NotificationType,
} from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest, notFound } from '../lib/errors';
import { log } from '../lib/log';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { unreadCount } from './notify';
import { rescheduleUser } from './scheduler';
import { getTeam } from './team';

const PAGE = 30;
type NotificationRow = typeof s.notifications.$inferSelect;

/* ───────── Inbox ───────── */

function encodeCursor(r: NotificationRow) {
  return Buffer.from(`${r.createdAt.toISOString()}|${r.id}`).toString('base64url');
}
function decodeCursor(cursor: string): { at: string; id: string } | null {
  try {
    const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export function notificationDto(r: NotificationRow): NotificationDto {
  return { id: r.id, type: r.type, title: r.title, body: r.body, url: typeof r.data.url === 'string' ? r.data.url : '/', createdAt: r.createdAt.toISOString(), readAt: r.readAt?.toISOString() ?? null };
}

/** APP-NOTIF inbox, newest first. Snoozed copies stay hidden until they are due. */
export async function listInbox(c: Container, user: AuthUser, cursor?: string): Promise<InboxResponse> {
  const n = s.notifications;
  const cur = cursor ? decodeCursor(cursor) : null;
  if (cursor && !cur) throw badRequest('Invalid cursor.', 'invalid_cursor');
  const nowIso = c.clock.now().toISOString();
  const rows = await c.db
    .select()
    .from(n)
    .where(
      and(
        eq(n.userId, user.id),
        sql`not (${n.data} ? 'snoozedFrom' and ${n.deliverAfter} is not null and ${n.deliverAfter} > ${nowIso}::timestamptz)`,
        cur ? or(lt(n.createdAt, new Date(cur.at)), and(eq(n.createdAt, new Date(cur.at)), lt(n.id, cur.id))) : undefined,
      ),
    )
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  return { items: page.map(notificationDto), unread: await unreadCount(c, user.id), nextCursor: rows.length > PAGE ? encodeCursor(page.at(-1)!) : null };
}

export async function markRead(c: Container, user: AuthUser, ids: string[] | 'all') {
  const n = s.notifications;
  const now = c.clock.now();
  if (ids === 'all') await c.db.update(n).set({ readAt: now }).where(and(eq(n.userId, user.id), isNull(n.readAt)));
  else if (ids.length) await c.db.update(n).set({ readAt: now }).where(and(eq(n.userId, user.id), inArray(n.id, ids), isNull(n.readAt)));
}

/* ───────── Preferences ───────── */

interface TypeMeta {
  label: string;
  hint: string;
  group: NotificationPrefDto['group'];
  supportsTime: boolean;
  supportsDays: boolean;
  supportsSmartTime: boolean;
  adminOnly?: boolean;
}

const meal = (label: string, hint: string): TypeMeta => ({ label, hint, group: 'meals', supportsTime: true, supportsDays: true, supportsSmartTime: true });
export const NOTIFICATION_META: Record<NotificationType, TypeMeta> = {
  breakfast_reminder: meal('Breakfast', 'A nudge if breakfast isn’t logged yet.'),
  morning_snack_reminder: meal('Morning snack', 'Only if you like logging snacks.'),
  lunch_reminder: meal('Lunch', 'A nudge if lunch isn’t logged yet.'),
  evening_snack_reminder: meal('Evening snack', 'Only if you like logging snacks.'),
  dinner_reminder: meal('Dinner', 'A nudge if dinner isn’t logged yet.'),
  activity_reminder: { label: 'Planned activity', hint: '30 minutes before each session in your plan.', group: 'activity', supportsTime: false, supportsDays: true, supportsSmartTime: false },
  habit_reminder: { label: 'Habit reminders', hint: 'At the times your admin set. Change them per habit; skipped once done.', group: 'habits', supportsTime: false, supportsDays: true, supportsSmartTime: false },
  weigh_in_reminder: { label: 'Weigh-in', hint: 'Skipped if you weighed in during the last 6 days.', group: 'activity', supportsTime: true, supportsDays: true, supportsSmartTime: false },
  momentum_at_risk: { label: 'Momentum at risk', hint: 'An evening heads-up when today isn’t logged yet.', group: 'momentum', supportsTime: true, supportsDays: true, supportsSmartTime: false },
  milestone: { label: 'Milestones and badges', hint: 'When you hit a streak milestone.', group: 'momentum', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  weekly_recap: { label: 'Weekly recap', hint: 'Your week in numbers, Sunday evening.', group: 'momentum', supportsTime: true, supportsDays: false, supportsSmartTime: false },
  chat_mention: { label: 'Mentions and replies', hint: 'When someone @mentions or replies to you.', group: 'chat', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  chat_digest: { label: 'Chat digest', hint: 'A roundup when the chat gets busy while you’re away.', group: 'chat', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  meme_fired: { label: 'Meme moments', hint: 'When a meme is posted about you.', group: 'team', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  plan_updated: { label: 'Plan updates', hint: 'When your admin changes your diet or activity plan.', group: 'team', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  announcement: { label: 'Announcements', hint: 'From your admin. Always on; held until quiet hours end.', group: 'team', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  board_results: { label: 'Weekly results', hint: 'Monday morning: the podium, the awards and where you finished.', group: 'team', supportsTime: false, supportsDays: false, supportsSmartTime: false },
  ai_budget_alert: { label: 'AI budget alerts', hint: 'When the team’s AI spend crosses a threshold.', group: 'system', supportsTime: false, supportsDays: false, supportsSmartTime: false, adminOnly: true },
  system: { label: 'Account and security', hint: 'Sign-ins and account changes. Always on.', group: 'system', supportsTime: false, supportsDays: false, supportsSmartTime: false },
};

const SLOT_BY_TYPE = Object.fromEntries(Object.entries(SLOT_REMINDER).map(([slot, type]) => [type, slot])) as Partial<Record<NotificationType, MealSlot>>;

export async function getPreferences(c: Container, user: AuthUser): Promise<NotificationPrefDto[]> {
  const [team, rows, profile] = await Promise.all([
    getTeam(c, user.teamId),
    c.db.query.notificationPreferences.findMany({ where: eq(s.notificationPreferences.userId, user.id) }),
    c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) }),
  ]);
  const byType = new Map(rows.map((r) => [r.type, r]));
  const isAdmin = user.role !== 'member';
  return NOTIFICATION_TYPES.filter((t) => isAdmin || !NOTIFICATION_META[t].adminOnly).map((type) => {
    const meta = NOTIFICATION_META[type];
    const d = team.settings.notificationDefaults[type] ?? { enabled: true, time: null, days: [0, 1, 2, 3, 4, 5, 6], smartTime: false };
    const r = byType.get(type);
    const locked = LOCKED_NOTIFICATION_TYPES.includes(type);
    const slot = SLOT_BY_TYPE[type];
    return {
      type,
      label: meta.label,
      hint: meta.hint,
      group: meta.group,
      enabled: locked ? true : (r?.enabled ?? d.enabled),
      time: meta.supportsTime ? (r?.time ?? d.time) : null,
      days: (r?.days ?? d.days).slice().sort((a, b) => a - b),
      smartTime: meta.supportsSmartTime ? (r?.smartTime ?? d.smartTime) : false,
      smartTimeValue: slot ? (profile?.smartTimes[slot] ?? null) : null,
      supportsTime: meta.supportsTime,
      supportsDays: meta.supportsDays,
      supportsSmartTime: meta.supportsSmartTime,
      locked,
    };
  });
}

/** Validate against each type's capabilities, upsert, then recompute the member's schedules (SYS-NOTIF-03). */
export async function updatePreferences(c: Container, user: AuthUser, input: NotificationPrefUpdate): Promise<NotificationPrefDto[]> {
  const current = new Map((await getPreferences(c, user)).map((p) => [p.type, p]));
  for (const item of input.items) {
    const type = item.type as NotificationType;
    const meta = NOTIFICATION_META[type];
    const cur = current.get(type);
    if (!cur) throw badRequest('That notification type isn’t available.', 'unknown_type', { type: 'Unknown type' });
    if (cur.locked && item.enabled === false) throw badRequest(`${meta.label} can’t be switched off.`, 'locked_type', { [type]: 'Always on' });
    if (item.time != null && !meta.supportsTime) throw badRequest(`${meta.label} doesn’t take a time.`, 'time_not_supported', { [type]: 'No time' });
    if (item.days && !meta.supportsDays) throw badRequest(`${meta.label} doesn’t take days.`, 'days_not_supported', { [type]: 'No days' });
    if (item.smartTime && !meta.supportsSmartTime) throw badRequest(`${meta.label} doesn’t support smart time.`, 'smart_not_supported', { [type]: 'No smart time' });
    if (meta.supportsTime && item.time === null && (item.enabled ?? cur.enabled)) throw badRequest(`Pick a time for ${meta.label.toLowerCase()}.`, 'time_required', { [type]: 'Time required' });
    const days = item.days ? [...new Set(item.days)].sort((a, b) => a - b) : cur.days;
    const values = {
      userId: user.id,
      type,
      enabled: cur.locked ? true : (item.enabled ?? cur.enabled),
      time: meta.supportsTime ? (item.time !== undefined ? item.time : cur.time) : null,
      days,
      smartTime: meta.supportsSmartTime ? (item.smartTime ?? cur.smartTime) : false,
      updatedAt: c.clock.now(),
    };
    await c.db
      .insert(s.notificationPreferences)
      .values(values)
      .onConflictDoUpdate({ target: [s.notificationPreferences.userId, s.notificationPreferences.type], set: values });
  }
  await ensureSchedules(c, user.id);
  await rescheduleUser(c, user.id);
  return getPreferences(c, user);
}

/** Every member has one schedule row per scheduled type (members created before a type existed get it here). */
export async function ensureSchedules(c: Container, userId: string) {
  await c.db
    .insert(s.notificationSchedules)
    .values(SCHEDULED_NOTIFICATION_TYPES.map((type) => ({ userId, type, nextSendAt: null })))
    .onConflictDoNothing();
}

/* ───────── Snooze and done (service-worker actions) ───────── */

async function ownNotification(c: Container, user: AuthUser, id: string) {
  const row = await c.db.query.notifications.findFirst({ where: and(eq(s.notifications.id, id), eq(s.notifications.userId, user.id)) });
  if (!row) throw notFound('Notification not found.');
  return row;
}

/**
 * Snooze: mark this one read and queue a copy for `minutes` later. The copy is delivered by the tick (reminders are
 * re-checked first, so a meal logged in the meantime cancels it) and stays out of the inbox until then.
 */
export async function snooze(c: Container, user: AuthUser, id: string, minutes: number) {
  const row = await ownNotification(c, user, id);
  const now = c.clock.now();
  const at = new Date(now.getTime() + minutes * 60_000);
  const origin = typeof row.data.snoozedFrom === 'string' ? row.data.snoozedFrom : row.id;
  await c.db.update(s.notifications).set({ readAt: now }).where(and(eq(s.notifications.id, row.id), isNull(s.notifications.readAt)));
  const inserted = await c.db
    .insert(s.notifications)
    .values({
      userId: user.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data: { ...row.data, snoozedFrom: origin },
      // One pending snooze per original notification per 10-minute bucket keeps double taps idempotent.
      dedupeKey: `snooze:${origin}:${Math.floor(now.getTime() / 600_000)}`,
      deliverAfter: at,
      // Counted as unread only once the tick releases it.
      readAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: s.notifications.id });
  return { id: inserted[0]?.id ?? null, at };
}

/** A stable UUID derived from a string, so repeating an action never creates a second row. */
function stableUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * "Done" from the notification: mark it read; for a planned-activity reminder also log that session with the plan's
 * default duration (SYS-NOTIF-08). The log id is derived from the notification id, so a second tap is a no-op.
 */
export async function done(c: Container, user: AuthUser, id: string): Promise<{ loggedActivityId: string | null }> {
  const row = await ownNotification(c, user, id);
  const now = c.clock.now();
  await c.db
    .update(s.notifications)
    .set({ readAt: row.readAt ?? now, data: { ...row.data, doneAt: row.data.doneAt ?? now.toISOString() } })
    .where(eq(s.notifications.id, row.id));
  let loggedActivityId: string | null = null;
  if (row.type === 'activity_reminder' && typeof row.data.planItemId === 'string') {
    try {
      const item = await c.db
        .select({ item: s.activityPlanItems, type: s.activityTypes })
        .from(s.activityPlanItems)
        .innerJoin(s.activityPlans, eq(s.activityPlans.id, s.activityPlanItems.planId))
        .innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityPlanItems.typeId))
        .where(and(eq(s.activityPlanItems.id, row.data.planItemId), eq(s.activityPlans.userId, user.id)))
        .limit(1);
      const hit = item[0];
      if (hit) {
        const { upsertActivityLog } = await import('./logs');
        const logId = stableUuid(`done:${row.id}`);
        const { today } = memberClock(c, user.timezone);
        const date = typeof row.data.localDate === 'string' && row.data.localDate <= today ? row.data.localDate : today;
        const r = await upsertActivityLog(c, user, logId, {
          date,
          loggedAt: now.toISOString(),
          typeId: hit.type.id,
          durationMin: hit.item.targetMin ?? hit.type.defaultDurationMin,
          planItemId: hit.item.id,
          clientUpdatedAt: new Date(0).toISOString(),
        });
        loggedActivityId = r.status === 'applied' ? logId : null;
      }
    } catch (e) {
      log.warn('notifications.done_log_failed', { id, error: (e as Error).message });
    }
  }
  if (row.type === 'habit_reminder' && Array.isArray(row.data.habitIds)) {
    try {
      const { completingValue, memberHabits, openHabitIds, upsertCheckin } = await import('./habits');
      const { today } = memberClock(c, user.timezone);
      const date = typeof row.data.localDate === 'string' && row.data.localDate <= today ? row.data.localDate : today;
      const open = await openHabitIds(c, user, date, row.data.habitIds as string[]);
      const habits = (await memberHabits(c, user.id, user.teamId)).filter((h) => open.includes(h.id));
      for (const h of habits) await upsertCheckin(c, user, stableUuid(`done:${row.id}:${h.id}`), { habitId: h.id, date, value: completingValue(h), clientUpdatedAt: now.toISOString() });
    } catch (e) {
      log.warn('notifications.done_habit_failed', { id, error: (e as Error).message });
    }
  }
  if (SCHEDULED_NOTIFICATION_TYPES.includes(row.type as NotificationType)) await rescheduleUser(c, user.id, row.type as NotificationType);
  return { loggedActivityId };
}
