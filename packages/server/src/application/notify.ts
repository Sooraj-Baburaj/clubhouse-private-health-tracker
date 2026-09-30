import { and, count, eq, isNull, lte } from 'drizzle-orm';
import { LOCKED_NOTIFICATION_TYPES, type NotificationType } from '@clubhouse/contracts';
import { inQuietHours, quietHoursEnd } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { PushPayload } from './ports';
import { signalUser } from './realtime';
import { getTeam } from './team';
import { log } from '../lib/log';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  tag?: string;
  dedupeKey?: string;
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

const CHAT_TYPES: NotificationType[] = ['chat_mention', 'chat_digest'];

/** Push one payload to every live device of a user; dead endpoints are revoked (SYS-NOTIF-09). */
export async function pushToUser(c: Container, userId: string, payload: PushPayload, opts: { ttlSec?: number; topic?: string } = {}) {
  const subs = await c.db.query.pushSubscriptions.findMany({ where: and(eq(s.pushSubscriptions.userId, userId), isNull(s.pushSubscriptions.revokedAt)) });
  // Without VAPID keys nothing can be sent; don't count that against (and eventually revoke) healthy devices.
  if (!c.push.enabled) return { delivered: 0, failed: 0, devices: subs.length };
  let delivered = 0;
  let failed = 0;
  for (const sub of subs) {
    const r = await c.push.send(sub, payload, { ttlSec: opts.ttlSec ?? 3600, topic: opts.topic });
    if (r.ok) {
      delivered++;
      await c.db.update(s.pushSubscriptions).set({ lastUsedAt: c.clock.now(), failCount: 0, lastError: null }).where(eq(s.pushSubscriptions.id, sub.id));
    } else {
      failed++;
      const fails = sub.failCount + 1;
      await c.db
        .update(s.pushSubscriptions)
        .set({ failCount: fails, lastError: r.error.slice(0, 200), revokedAt: r.gone || fails >= 5 ? c.clock.now() : null })
        .where(eq(s.pushSubscriptions.id, sub.id));
    }
  }
  return { delivered, failed, devices: subs.length };
}

export async function unreadCount(c: Container, userId: string): Promise<number> {
  const [r] = await c.db.select({ n: count() }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt)));
  return r?.n ?? 0;
}

/**
 * Deliver an immediate notification: always an inbox row (the record of what was sent, SYS-NOTIF-01), and a push
 * unless the type is off, the master switch is off, chat is muted, or it is quiet hours. Announcements wait for
 * quiet hours to end instead of being dropped (SYS-NOTIF-06). Idempotent by `dedupeKey`.
 */
export async function notifyUser(c: Container, userId: string, n: NotifyInput): Promise<{ id: string | null; pushed: boolean }> {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user || user.status !== 'active') return { id: null, pushed: false };
  const locked = LOCKED_NOTIFICATION_TYPES.includes(n.type);
  const pref = await c.db.query.notificationPreferences.findFirst({ where: and(eq(s.notificationPreferences.userId, userId), eq(s.notificationPreferences.type, n.type)) });
  if (!locked && pref && !pref.enabled) return { id: null, pushed: false };
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const team = await getTeam(c, user.teamId);
  const tz = user.timezone || team.timezone;
  const now = c.clock.now();
  const quiet = profile?.quietHours ?? null;
  const inQuiet = inQuietHours(now, tz, quiet);
  const deliverAfter = inQuiet && n.type === 'announcement' && quiet ? quietHoursEnd(now, tz, quiet) : null;

  const [row] = await c.db
    .insert(s.notifications)
    .values({ userId, type: n.type, title: n.title, body: n.body, data: { url: n.url, tag: n.tag, actions: n.actions, ...(n.data ?? {}) }, dedupeKey: n.dedupeKey ?? null, deliverAfter })
    .onConflictDoNothing()
    .returning({ id: s.notifications.id });
  if (!row) return { id: null, pushed: false };
  await signalUser(c, userId, 'inbox.new', { id: row.id });

  const masterOff = profile && !profile.notificationsMaster && !locked;
  const muted = CHAT_TYPES.includes(n.type) && profile?.chatMutedUntil && profile.chatMutedUntil > now;
  if (masterOff || muted || (inQuiet && !deliverAfter) || deliverAfter) {
    await c.db
      .update(s.notifications)
      .set({ pushResult: deliverAfter ? 'deferred_quiet_hours' : masterOff ? 'master_off' : muted ? 'muted' : 'quiet_hours' })
      .where(eq(s.notifications.id, row.id));
    return { id: row.id, pushed: false };
  }
  const badge = await unreadCount(c, userId);
  const res = await pushToUser(c, userId, { title: n.title, body: n.body, url: n.url, tag: n.tag, actions: n.actions, badge, data: { notificationId: row.id, type: n.type } }, { topic: n.tag });
  await c.db
    .update(s.notifications)
    .set({ pushedAt: res.delivered ? now : null, pushResult: res.devices === 0 ? 'no_devices' : `${res.delivered}/${res.devices}` })
    .where(eq(s.notifications.id, row.id));
  return { id: row.id, pushed: res.delivered > 0 };
}

/** Push notifications that were deferred until quiet hours ended (announcements). Called by the tick. */
export async function deliverDeferred(c: Container, limit = 200): Promise<number> {
  const due = await c.db.query.notifications.findMany({
    where: and(lte(s.notifications.deliverAfter, c.clock.now()), isNull(s.notifications.pushedAt)),
    limit,
  });
  let n = 0;
  for (const row of due) {
    try {
      const badge = await unreadCount(c, row.userId);
      const res = await pushToUser(c, row.userId, { title: row.title, body: row.body, url: (row.data.url as string) ?? '/', tag: row.data.tag as string | undefined, badge, data: { notificationId: row.id, type: row.type } }, { ttlSec: 86400 });
      await c.db.update(s.notifications).set({ pushedAt: c.clock.now(), deliverAfter: null, pushResult: `${res.delivered}/${res.devices}` }).where(eq(s.notifications.id, row.id));
      n++;
    } catch (e) {
      log.warn('notify.deferred_failed', { id: row.id, error: (e as Error).message });
    }
  }
  return n;
}

export async function notifyAdmins(c: Container, teamId: string, n: NotifyInput, opts: { superOnly?: boolean; email?: boolean } = {}) {
  const admins = await c.db.query.users.findMany({ where: and(eq(s.users.teamId, teamId), eq(s.users.status, 'active')) });
  const targets = admins.filter((u) => (opts.superOnly ? u.role === 'super_admin' : u.role !== 'member'));
  for (const u of targets) await notifyUser(c, u.id, { ...n, dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${u.id}` : undefined });
  if (opts.email) {
    const extra = c.env.ADMIN_ALERT_EMAILS.split(',').map((x) => x.trim()).filter(Boolean);
    const to = [...new Set([...targets.map((u) => u.email).filter((x): x is string => !!x), ...extra])];
    await c.email.send(to, `Clubhouse: ${n.title}`, `${n.body}\n\nOpen: ${c.env.APP_ORIGIN}${n.url}`);
  }
}
