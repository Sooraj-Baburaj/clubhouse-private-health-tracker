import { and, asc, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { DEFAULT_MEAL_SLOTS, SLOT_REMINDER, type MealSlot, type NotificationType } from '@clubhouse/contracts';
import { addDays, fillTemplate, inQuietHours, isOnVacation, localDateOf, localTimeOf, pickLine, suppressionReason, weekdayOf } from '@clubhouse/domain';
import { schema as s, seed } from '@clubhouse/db';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import type { AuthUser } from '../../interface/http/types';
import { teamChannel } from '../chat';
import { habitsDueAt, openHabitIds } from '../habits';
import { deliverDeferred, notifyUser } from '../notify';
import { rescheduleUser } from '../scheduler';
import { getTeam } from '../team';
import { authUserFor, hasTime, type Stats, type StepCtx } from './shared';

const SLOT_BY_TYPE = Object.fromEntries(Object.entries(SLOT_REMINDER).map(([slot, type]) => [type, slot])) as Partial<Record<NotificationType, MealSlot>>;
const REMINDERS: NotificationType[] = [...Object.values(SLOT_REMINDER), 'activity_reminder', 'momentum_at_risk', 'weigh_in_reminder', 'habit_reminder'];
const STALE_MS = 2 * 3600_000;
const BATCH = 50;
const MAX_PER_TICK = 200;

interface ClaimedRow extends Record<string, unknown> {
  user_id: string;
  type: string;
  next_send_at: string | Date;
  attempts: number;
  last_sent_at: string | Date | null;
}

type Outcome = 'sent' | 'suppressed' | 'stale' | 'skipped';

/** Record the outcome, then compute the next send time from preferences (which also releases the claim). */
async function finish(c: Container, userId: string, type: NotificationType, o: { reason: string; sentAt?: Date; sentLocalDate?: string }) {
  await c.db
    .update(s.notificationSchedules)
    .set({ lastReason: o.reason, attempts: 0, updatedAt: c.clock.now(), ...(o.sentAt ? { lastSentAt: o.sentAt, lastSentLocalDate: o.sentLocalDate ?? null } : {}) })
    .where(and(eq(s.notificationSchedules.userId, userId), eq(s.notificationSchedules.type, type)));
  await rescheduleUser(c, userId, type);
}

interface ReminderContent {
  alreadyLogged: boolean;
  title: string;
  vars: Record<string, string | number>;
  url: string;
  actions: { action: string; title: string }[];
  data: Record<string, unknown>;
  /** Habit reminders with bundling off: one push per habit instead of the bundle. */
  separate?: { title: string; body: string; data: Record<string, unknown> }[];
}

const SNOOZE = { action: 'snooze', title: 'Snooze 1 h' };

async function anyLogOn(c: Container, userId: string, date: string): Promise<boolean> {
  const [r] = await c.db.execute<{ n: number }>(sql`
    select (exists(select 1 from food_logs where user_id = ${userId} and date = ${date} and deleted_at is null)
         or exists(select 1 from activity_logs where user_id = ${userId} and date = ${date} and deleted_at is null)
         or exists(select 1 from weight_entries where user_id = ${userId} and date = ${date} and deleted_at is null))::int as n`);
  return Number(r?.n ?? 0) > 0;
}

/** What a reminder says and whether its reason to exist is already gone (SYS-NOTIF-05 "already logged"). */
async function reminderContent(c: Container, u: AuthUser, type: NotificationType, today: string, due: Date): Promise<ReminderContent> {
  const team = await getTeam(c, u.teamId);
  const name = u.displayName.split(' ')[0] ?? u.displayName;
  const slot = SLOT_BY_TYPE[type];
  if (slot) {
    const label = team.settings.mealSlots[slot]?.label ?? DEFAULT_MEAL_SLOTS[slot].label;
    const [hit] = await c.db
      .select({ id: s.foodLogs.id })
      .from(s.foodLogs)
      .where(and(eq(s.foodLogs.userId, u.id), eq(s.foodLogs.date, today), eq(s.foodLogs.mealSlot, slot), isNull(s.foodLogs.deletedAt)))
      .limit(1);
    return { alreadyLogged: !!hit, title: `${label} time`, vars: { name, slot: label.toLowerCase() }, url: `/log/food?slot=${slot}`, actions: [{ action: 'log', title: 'Log it' }, SNOOZE], data: { slot, localDate: today } };
  }
  if (type === 'activity_reminder') {
    // The schedule fires 30 minutes before a plan day's time; find which plan item that slot belongs to.
    const at = new Date(due.getTime() + 30 * 60_000);
    const atDate = localDateOf(at, u.timezone);
    const atTime = localTimeOf(at, u.timezone);
    const days = await c.db
      .select({ itemId: s.activityPlanItems.id, typeId: s.activityPlanItems.typeId, typeName: s.activityTypes.name, time: s.activityPlanDays.time, weekday: s.activityPlanDays.weekday })
      .from(s.activityPlanDays)
      .innerJoin(s.activityPlanItems, eq(s.activityPlanItems.id, s.activityPlanDays.itemId))
      .innerJoin(s.activityPlans, eq(s.activityPlans.id, s.activityPlanItems.planId))
      .innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityPlanItems.typeId))
      .where(and(eq(s.activityPlans.userId, u.id), isNull(s.activityPlanItems.archivedAt), eq(s.activityPlanDays.weekday, weekdayOf(atDate))))
      .orderBy(asc(s.activityPlanDays.time));
    const item = days.find((d) => d.time === atTime) ?? days[0];
    const logged = await c.db
      .select({ id: s.activityLogs.id })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, u.id), eq(s.activityLogs.date, today), isNull(s.activityLogs.deletedAt), item ? eq(s.activityLogs.typeId, item.typeId) : undefined))
      .limit(1);
    const activity = item?.typeName ?? 'your workout';
    return {
      alreadyLogged: logged.length > 0,
      title: item ? `${item.typeName} at ${item.time}` : 'Planned activity',
      vars: { name, activity, time: item?.time ?? atTime },
      url: item ? `/log/activity?plan=${item.itemId}` : '/log/activity',
      actions: item ? [{ action: 'done', title: 'Done' }, SNOOZE] : [SNOOZE],
      data: { planItemId: item?.itemId ?? null, typeId: item?.typeId ?? null, localDate: today },
    };
  }
  if (type === 'momentum_at_risk') {
    const st = await c.db.query.streakStates.findFirst({ where: and(eq(s.streakStates.userId, u.id), eq(s.streakStates.kind, 'logging')) });
    const streak = st?.current ?? 0;
    // Nothing at risk without a streak; nothing to do once today has a log.
    const alreadyLogged = streak === 0 || (await anyLogOn(c, u.id, today));
    return { alreadyLogged, title: `${streak}-day momentum`, vars: { name, streak }, url: '/', actions: [{ action: 'log', title: 'Log now' }], data: { localDate: today } };
  }
  if (type === 'habit_reminder') {
    // One reminder per time slot: every habit set for this time that is still open today.
    const at = localTimeOf(due, u.timezone);
    const open = await habitsDueAt(c, u, today, at);
    const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, u.id), columns: { habitPrefs: true } });
    const names = open.map((h) => h.name);
    const list = names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    const data = { habitIds: open.map((h) => h.id), localDate: today, time: at };
    return {
      alreadyLogged: open.length === 0,
      title: open.length === 1 ? `${open[0]!.icon} ${open[0]!.name}` : `${open.length} habits due`,
      vars: { name, habits: list, count: open.length },
      url: '/habits',
      actions: [{ action: 'done', title: open.length === 1 ? 'Done' : 'All done' }, SNOOZE],
      data,
      separate:
        profile?.habitPrefs?.bundle === false && open.length > 1
          ? open.map((h) => ({ title: `${h.icon} ${h.name}`, body: h.note?.trim() || 'One tap to tick it off.', data: { habitIds: [h.id], localDate: today, time: at } }))
          : undefined,
    };
  }
  if (type === 'weigh_in_reminder') {
    const [w] = await c.db
      .select({ id: s.weightEntries.id })
      .from(s.weightEntries)
      .where(and(eq(s.weightEntries.userId, u.id), gte(s.weightEntries.date, addDays(today, -6)), lte(s.weightEntries.date, today), isNull(s.weightEntries.deletedAt)))
      .limit(1);
    return { alreadyLogged: !!w, title: 'Weigh-in', vars: { name }, url: '/log/weight', actions: [{ action: 'log', title: 'Log weight' }], data: { localDate: today } };
  }
  return { alreadyLogged: false, title: 'Clubhouse', vars: { name }, url: '/', actions: [], data: {} };
}

function copyFor(team: Awaited<ReturnType<typeof getTeam>>, type: NotificationType, seedKey: string, vars: Record<string, string | number>): string {
  const pool = team.settings.copyPool?.[type]?.length ? team.settings.copyPool[type]! : (seed.DEFAULT_COPY_POOL[type] ?? []);
  const line = pickLine(pool, seedKey) || 'Quick check-in from the Clubhouse.';
  return fillTemplate(line, vars).replace(/\s+/g, ' ').trim();
}

async function deliverDigest(c: Container, u: AuthUser, row: ClaimedRow, now: Date): Promise<Outcome> {
  const [profile, pref, read] = await Promise.all([
    c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, u.id) }),
    c.db.query.notificationPreferences.findFirst({ where: and(eq(s.notificationPreferences.userId, u.id), eq(s.notificationPreferences.type, 'chat_digest')) }),
    c.db.query.chatReads.findFirst({ where: eq(s.chatReads.userId, u.id) }),
  ]);
  const ch = await teamChannel(c, u.teamId);
  const since = row.last_sent_at ? new Date(row.last_sent_at) : new Date(0);
  const msgs = await c.db
    .select({ author: s.users.displayName })
    .from(s.messages)
    .leftJoin(s.users, eq(s.users.id, s.messages.userId))
    .where(
      and(
        eq(s.messages.channelId, ch.id),
        gt(s.messages.seq, read?.lastReadSeq ?? 0),
        gt(s.messages.createdAt, since),
        isNull(s.messages.deletedAt),
        eq(s.messages.test, false),
        sql`${s.messages.userId} is distinct from ${u.id}`,
      ),
    );
  const reason = suppressionReason({
    type: 'chat_digest',
    enabled: (pref?.enabled ?? true) && (profile?.notificationsMaster ?? true),
    alreadyLogged: false,
    lastActiveAt: null,
    lastSameTypeSentAt: null,
    inQuietHours: inQuietHours(now, u.timezone, profile?.quietHours ?? null),
    onVacation: false,
    chatMutedUntil: profile?.chatMutedUntil ?? null,
    onChatScreen: !!read?.onChatUntil && read.onChatUntil > now,
    newChatMessages: msgs.length,
    now,
  });
  let sent = false;
  if (!reason) {
    const names = [...new Set(msgs.map((m) => m.author ?? 'Clubhouse'))];
    const who = names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} other${names.length - 2 === 1 ? '' : 's'}`;
    const r = await notifyUser(c, u.id, { type: 'chat_digest', title: 'The Clubhouse', body: `${msgs.length} new messages from ${who}.`, url: '/chat', tag: 'chat-digest', dedupeKey: `digest:${u.id}:${now.toISOString().slice(0, 16)}` });
    sent = !!r.id;
  }
  await c.db
    .update(s.notificationSchedules)
    .set({ nextSendAt: null, claimedAt: null, attempts: 0, lastReason: reason ?? 'sent', updatedAt: now, ...(sent ? { lastSentAt: now, lastSentLocalDate: localDateOf(now, u.timezone) } : {}) })
    .where(and(eq(s.notificationSchedules.userId, u.id), eq(s.notificationSchedules.type, 'chat_digest')));
  return sent ? 'sent' : 'suppressed';
}

async function deliverOne(c: Container, row: ClaimedRow, now: Date): Promise<Outcome> {
  const type = row.type as NotificationType;
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, row.user_id) });
  if (!user || user.status !== 'active') {
    await c.db
      .update(s.notificationSchedules)
      .set({ nextSendAt: null, claimedAt: null, lastReason: 'inactive' })
      .where(and(eq(s.notificationSchedules.userId, row.user_id), eq(s.notificationSchedules.type, type)));
    return 'skipped';
  }
  const u = await authUserFor(c, user);
  if (type === 'chat_digest') return deliverDigest(c, u, row, now);
  // The weekly recap is built and delivered by the recap step (it needs the finished week, not just a clock).
  if (!REMINDERS.includes(type)) {
    await finish(c, u.id, type, { reason: type === 'weekly_recap' ? 'recap_step' : 'not_scheduled' });
    return 'skipped';
  }
  const due = new Date(row.next_send_at);
  if (now.getTime() - due.getTime() > STALE_MS) {
    await finish(c, u.id, type, { reason: 'stale_skipped' });
    return 'stale';
  }
  const [profile, pref, team] = await Promise.all([
    c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, u.id) }),
    c.db.query.notificationPreferences.findFirst({ where: and(eq(s.notificationPreferences.userId, u.id), eq(s.notificationPreferences.type, type)) }),
    getTeam(c, u.teamId),
  ]);
  const today = localDateOf(now, u.timezone);
  const content = await reminderContent(c, u, type, today, due);
  const reason = suppressionReason({
    type,
    enabled: !!pref?.enabled && (profile?.notificationsMaster ?? true),
    alreadyLogged: content.alreadyLogged,
    lastActiveAt: user.lastActiveAt,
    lastSameTypeSentAt: row.last_sent_at ? new Date(row.last_sent_at) : null,
    inQuietHours: inQuietHours(now, u.timezone, profile?.quietHours ?? null),
    onVacation: isOnVacation(profile?.vacationRanges ?? [], today),
    chatMutedUntil: null,
    onChatScreen: false,
    newChatMessages: 0,
    now,
  });
  if (reason) {
    await finish(c, u.id, type, { reason });
    return 'suppressed';
  }
  if (content.separate) {
    let pushed = 0;
    for (const [i, one] of content.separate.entries()) {
      const r1 = await notifyUser(c, u.id, { type, title: one.title, body: one.body, url: content.url, tag: `${type}:${i}`, actions: content.actions.map((a) => (a.action === 'done' ? { ...a, title: 'Done' } : a)), data: one.data, dedupeKey: `sched:${u.id}:${type}:${today}:${localTimeOf(due, u.timezone)}:${String(one.data.habitIds)}` });
      if (r1.id) pushed++;
    }
    await finish(c, u.id, type, { reason: pushed ? 'sent' : 'duplicate', sentAt: now, sentLocalDate: today });
    return 'sent';
  }
  const body = copyFor(team, type, `${u.id}:${type}:${today}`, content.vars);
  const r = await notifyUser(c, u.id, {
    type,
    title: content.title,
    body,
    url: content.url,
    tag: type,
    actions: content.actions,
    data: content.data,
    dedupeKey: `sched:${u.id}:${type}:${today}:${localTimeOf(due, u.timezone)}`,
  });
  await finish(c, u.id, type, { reason: r.id ? (r.pushed ? 'sent' : 'inbox_only') : 'duplicate', sentAt: now, sentLocalDate: today });
  return 'sent';
}

/** Snoozed copies whose time has come: re-check reminders (a meal logged meanwhile cancels it), then let them push. */
async function releaseSnoozed(c: Container, now: Date, limit: number): Promise<{ released: number; cancelled: number }> {
  const rows = await c.db
    .select()
    .from(s.notifications)
    .where(and(lte(s.notifications.deliverAfter, now), isNull(s.notifications.pushedAt), sql`${s.notifications.data} ? 'snoozedFrom'`))
    .limit(limit);
  let released = 0;
  let cancelled = 0;
  for (const n of rows) {
    const type = n.type as NotificationType;
    let stillNeeded = true;
    if (REMINDERS.includes(type)) {
      const user = await c.db.query.users.findFirst({ where: eq(s.users.id, n.userId) });
      if (!user || user.status !== 'active') stillNeeded = false;
      else {
        const u = await authUserFor(c, user);
        const today = localDateOf(now, u.timezone);
        const date = typeof n.data.localDate === 'string' ? n.data.localDate : today;
        if (type === 'habit_reminder') stillNeeded = date === today && (await openHabitIds(c, u, today, Array.isArray(n.data.habitIds) ? (n.data.habitIds as string[]) : [])).length > 0;
        else stillNeeded = date === today && !(await reminderContent(c, u, type, today, now)).alreadyLogged;
      }
    }
    if (stillNeeded) {
      await c.db.update(s.notifications).set({ readAt: null }).where(eq(s.notifications.id, n.id));
      released++;
    } else {
      // Never shown or pushed, so the copy simply goes away; the original stays in the inbox.
      await c.db.delete(s.notifications).where(eq(s.notifications.id, n.id));
      cancelled++;
    }
  }
  return { released, cancelled };
}

/**
 * Step 1 (§14): claim due schedule rows with FOR UPDATE SKIP LOCKED (claims older than 2 min are reclaimable), skip
 * reminders more than 2 h late, apply suppression, write the inbox row (dedupe key) and push, then compute the next
 * send. Finally push snoozed and quiet-hours-deferred notifications.
 */
export async function deliverNotifications(c: Container, ctx: StepCtx): Promise<Stats> {
  const stats = { claimed: 0, sent: 0, suppressed: 0, stale: 0, skipped: 0, errors: 0, snoozeReleased: 0, snoozeCancelled: 0, deferred: 0, announcements: 0 };
  while (stats.claimed < MAX_PER_TICK && hasTime(ctx, 3000)) {
    const now = c.clock.now();
    const nowIso = now.toISOString();
    const reclaimIso = new Date(now.getTime() - 120_000).toISOString();
    const rows = await c.db.execute<ClaimedRow>(sql`
      update notification_schedules ns
         set claimed_at = ${nowIso}::timestamptz, attempts = ns.attempts + 1
        from (select user_id, type from notification_schedules
               where next_send_at is not null and next_send_at <= ${nowIso}::timestamptz
                 and (claimed_at is null or claimed_at < ${reclaimIso}::timestamptz)
               order by next_send_at
               limit ${Math.min(BATCH, MAX_PER_TICK - stats.claimed)}
               for update skip locked) due
       where ns.user_id = due.user_id and ns.type = due.type
      returning ns.user_id, ns.type, ns.next_send_at, ns.attempts, ns.last_sent_at`);
    if (!rows.length) break;
    stats.claimed += rows.length;
    for (const row of rows) {
      try {
        stats[await deliverOne(c, row, now)]++;
      } catch (e) {
        stats.errors++;
        log.warn('jobs.deliver_failed', { userId: row.user_id, type: row.type, attempts: row.attempts, error: (e as Error).message });
        // Give up on this slot after three attempts so one bad row can't block the queue forever.
        if (row.attempts >= 3) await finish(c, row.user_id, row.type as NotificationType, { reason: 'error' }).catch(() => undefined);
      }
    }
  }
  const now = c.clock.now();
  const snoozed = await releaseSnoozed(c, now, 100);
  stats.snoozeReleased = snoozed.released;
  stats.snoozeCancelled = snoozed.cancelled;
  if (hasTime(ctx, 2000)) stats.deferred = await deliverDeferred(c, 100);
  // Scheduled admin announcements: post to chat once due (their pushes are queued via deliver_after).
  if (hasTime(ctx, 2000)) stats.announcements = await (await import('../admin/chat')).sendDueAnnouncements(c);
  return stats;
}

/**
 * Step 2 (§14) repair pass: digests are event-driven (a post schedules one), so here we only re-arm members who have
 * unread messages from others newer than their last digest but no pending digest.
 */
export async function repairChatDigests(c: Container, ctx: StepCtx): Promise<Stats> {
  const now = c.clock.now();
  const nowIso = now.toISOString();
  // Missing schedule rows for the digest type (members created before it existed).
  await c.db.execute(sql`
    insert into notification_schedules (user_id, type, next_send_at)
    select u.id, 'chat_digest', null from users u where u.status = 'active'
    on conflict do nothing`);
  const teams = await c.db.query.teams.findMany({ columns: { id: true, settings: true } });
  let armed = 0;
  for (const t of teams) {
    if (!hasTime(ctx, 2000)) break;
    const at = new Date(now.getTime() + t.settings.chat.digestMinutes * 60_000).toISOString();
    const res = await c.db.execute(sql`
      update notification_schedules ns set next_send_at = ${at}::timestamptz, claimed_at = null
        from users u
        left join chat_reads r on r.user_id = u.id
       where ns.user_id = u.id and ns.type = 'chat_digest' and ns.next_send_at is null
         and u.team_id = ${t.id} and u.status = 'active'
         and exists (
           select 1 from messages m join channels ch on ch.id = m.channel_id
            where ch.team_id = ${t.id} and m.seq > coalesce(r.last_read_seq, 0) and m.deleted_at is null and m.test = false
              and m.user_id is distinct from u.id
              and m.created_at > greatest(coalesce(ns.last_sent_at, 'epoch'::timestamptz), ${nowIso}::timestamptz - interval '6 hours'))
      returning ns.user_id`);
    armed += res.length;
  }
  return { armed };
}

