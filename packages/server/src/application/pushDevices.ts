import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DeviceDto, PushSubscribeRequest } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { AppError, notFound } from '../lib/errors';
import type { AuthState } from '../interface/http/types';
import { pushToUser } from './notify';

/** A short, human label for the device list ("iPhone · Safari"), from the client hint or the user agent. */
export function platformFrom(ua: string, hint?: string | null): string {
  if (hint && hint.trim()) return hint.trim().slice(0, 40);
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : null;
  return browser ? `${os} · ${browser}` : os;
}

/** Upsert by endpoint: a browser that re-subscribes (or moves to another account) takes the row over. */
export async function subscribe(c: Container, auth: AuthState, input: PushSubscribeRequest, userAgent: string): Promise<{ id: string }> {
  const now = c.clock.now();
  const values = {
    userId: auth.user.id,
    sessionId: auth.session.id,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent.slice(0, 300) || null,
    platform: platformFrom(userAgent, input.platform),
    lastUsedAt: now,
    failCount: 0,
    lastError: null,
    revokedAt: null,
  };
  const [row] = await c.db
    .insert(s.pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({ target: s.pushSubscriptions.endpoint, set: values })
    .returning({ id: s.pushSubscriptions.id });
  if (!row) throw new AppError(500, 'push_subscribe_failed', 'Couldn’t save this device.');
  return { id: row.id };
}

export async function unsubscribe(c: Container, userId: string, endpoint: string) {
  await c.db
    .update(s.pushSubscriptions)
    .set({ revokedAt: c.clock.now() })
    .where(and(eq(s.pushSubscriptions.userId, userId), eq(s.pushSubscriptions.endpoint, endpoint), isNull(s.pushSubscriptions.revokedAt)));
}

/** Devices with live push; `thisDevice` is flagged by endpoint when the client sends it, else by session. */
export async function listDevices(c: Container, auth: AuthState, endpoint?: string): Promise<DeviceDto[]> {
  const rows = await c.db.query.pushSubscriptions.findMany({
    where: and(eq(s.pushSubscriptions.userId, auth.user.id), isNull(s.pushSubscriptions.revokedAt)),
    orderBy: [desc(s.pushSubscriptions.createdAt)],
  });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    failing: r.failCount > 0,
    thisDevice: endpoint ? r.endpoint === endpoint : r.sessionId === auth.session.id,
  }));
}

export async function removeDevice(c: Container, userId: string, id: string) {
  const row = await c.db.query.pushSubscriptions.findFirst({ where: and(eq(s.pushSubscriptions.id, id), eq(s.pushSubscriptions.userId, userId)) });
  if (!row) throw notFound('Device not found.');
  if (!row.revokedAt) await c.db.update(s.pushSubscriptions).set({ revokedAt: c.clock.now() }).where(eq(s.pushSubscriptions.id, id));
}

/** "Send a test" (APP-SET-06): one push to every live device. */
export async function sendTest(c: Container, userId: string): Promise<{ delivered: number; devices: number }> {
  const r = await pushToUser(c, userId, { title: 'Clubhouse test', body: 'Push works on this device. 🎉', url: '/inbox', tag: 'test' }, { ttlSec: 300 });
  return { delivered: r.delivered, devices: r.devices };
}
