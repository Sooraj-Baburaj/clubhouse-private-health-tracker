import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { randomToken, sha256 } from '../lib/crypto';

export const SESSION_DAYS = 30;
export const ADMIN_IDLE_MS = 12 * 3600_000;

export const hashToken = (c: Container, token: string) => sha256(`${token}:${c.env.SESSION_PEPPER}`);

export function deviceLabelFrom(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

export async function createSession(c: Container, userId: string, meta: { ip: string; userAgent: string; deviceLabel?: string; mfaVerified: boolean; admin: boolean }) {
  const token = randomToken(32);
  const now = c.clock.now();
  const [row] = await c.db
    .insert(s.sessions)
    .values({
      userId,
      tokenHash: hashToken(c, token),
      deviceLabel: meta.deviceLabel || deviceLabelFrom(meta.userAgent),
      userAgent: meta.userAgent.slice(0, 300),
      ip: meta.ip,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400_000),
      mfaVerifiedAt: meta.mfaVerified ? now : null,
      adminLastActiveAt: meta.admin && meta.mfaVerified ? now : null,
    })
    .returning();
  return { token, session: row! };
}

export async function revokeSession(c: Container, sessionId: string) {
  await c.db.update(s.sessions).set({ revokedAt: c.clock.now() }).where(eq(s.sessions.id, sessionId));
  await c.db.update(s.pushSubscriptions).set({ revokedAt: c.clock.now() }).where(and(eq(s.pushSubscriptions.sessionId, sessionId), isNull(s.pushSubscriptions.revokedAt)));
}

export async function revokeAllSessions(c: Container, userId: string, exceptSessionId?: string) {
  const where = exceptSessionId
    ? and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), ne(s.sessions.id, exceptSessionId))
    : and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt));
  const revoked = await c.db.update(s.sessions).set({ revokedAt: c.clock.now() }).where(where).returning({ id: s.sessions.id });
  for (const r of revoked) {
    await c.db.update(s.pushSubscriptions).set({ revokedAt: c.clock.now() }).where(and(eq(s.pushSubscriptions.sessionId, r.id), isNull(s.pushSubscriptions.revokedAt)));
  }
  return revoked.length;
}

export async function activeSessions(c: Container, userId: string) {
  return c.db.query.sessions.findMany({
    where: and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, c.clock.now())),
    orderBy: (t, { desc }) => [desc(t.lastSeenAt)],
  });
}
