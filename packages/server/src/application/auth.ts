import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { LoginResponse, SessionDto } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { recoveryCode, seal, sha256, unseal } from '../lib/crypto';
import { AppError, badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { audit } from './audit';
import { notifyAdmins } from './notify';
import { checkRateLimit, incrementRateLimit, LIMITS, resetRateLimit } from './rateLimit';
import { activeSessions, createSession, deviceLabelFrom, revokeAllSessions, revokeSession } from './sessions';

// Verifying unknown usernames against a real hash keeps response timing similar (no username probing).
let dummyHash: Promise<string> | null = null;
const getDummyHash = (c: Container) => (dummyHash ??= c.hasher.hash(`dummy-${Math.random()}`));

export interface RequestMeta {
  ip: string;
  userAgent: string;
}

export async function login(c: Container, input: { login: string; password: string; deviceLabel?: string }, meta: RequestMeta): Promise<{ token: string; response: LoginResponse }> {
  const loginKey = input.login.trim().toLowerCase();
  const keyUser = `login:${loginKey}`;
  const keyIp = `login:ip:${meta.ip}`;
  const { limit, windowSec } = LIMITS.loginFailures;
  for (const key of [keyUser, keyIp]) {
    const rl = await checkRateLimit(c, key, key === keyIp ? limit * 4 : limit, windowSec);
    if (rl.blocked) {
      const mins = Math.ceil(rl.retryAfter / 60);
      throw new AppError(429, 'login_locked', `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, undefined, { 'Retry-After': String(Math.ceil(rl.retryAfter)) });
    }
  }
  const user = await c.db.query.users.findFirst({
    where: or(eq(sql`lower(${s.users.username})`, loginKey), eq(sql`lower(${s.users.email})`, loginKey)),
  });
  const ok = await c.hasher.verify(user?.passwordHash ?? (await getDummyHash(c)), input.password);
  if (!user || !ok) {
    await incrementRateLimit(c, keyUser, windowSec);
    await incrementRateLimit(c, keyIp, windowSec);
    throw unauthorized('That username and password don’t match. Ask your admin if you’re locked out.', 'invalid_credentials');
  }
  if (user.status !== 'active') throw forbidden('This account is switched off. Ask your admin.', 'deactivated');
  const now = c.clock.now();
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < now) {
    throw forbidden('Your temporary password has expired. Ask your admin for a new one.', 'temp_password_expired');
  }
  await resetRateLimit(c, keyUser);
  const isAdmin = user.role !== 'member';
  const mfaRequired = !!user.totpEnabledAt;
  const { token, session } = await createSession(c, user.id, { ...meta, deviceLabel: input.deviceLabel, mfaVerified: !mfaRequired, admin: isAdmin });
  if (isAdmin) await recordAdminLogin(c, user, session.id, meta);
  return { token, response: { mfaRequired, mustChangePassword: user.mustChangePassword, role: user.role } };
}

async function recordAdminLogin(c: Container, user: typeof s.users.$inferSelect, _sessionId: string, meta: RequestMeta) {
  const deviceHash = sha256(`${deviceLabelFrom(meta.userAgent)}:${meta.userAgent}`);
  const seen = await c.db.query.adminLoginEvents.findFirst({ where: and(eq(s.adminLoginEvents.userId, user.id), eq(s.adminLoginEvents.deviceHash, deviceHash)) });
  const first = !(await c.db.query.adminLoginEvents.findFirst({ where: eq(s.adminLoginEvents.userId, user.id) }));
  await c.db.insert(s.adminLoginEvents).values({ userId: user.id, deviceHash, ip: meta.ip, userAgent: meta.userAgent.slice(0, 300), newDevice: !seen });
  await audit(c, { teamId: user.teamId, actorId: user.id, actorRole: user.role, action: 'admin.sign_in', targetType: 'user', targetId: user.id, after: { device: deviceLabelFrom(meta.userAgent), newDevice: !seen }, ip: meta.ip, userAgent: meta.userAgent });
  if (!seen && !first) {
    await notifyAdmins(
      c,
      user.teamId,
      { type: 'system', title: 'New admin sign-in', body: `${user.displayName} signed in to the admin panel from a new device (${deviceLabelFrom(meta.userAgent)}).`, url: '/admin/audit', dedupeKey: `admin-new-device:${user.id}:${deviceHash}` },
      { superOnly: true, email: true },
    );
  }
}

export async function logout(c: Container, sessionId: string) {
  await revokeSession(c, sessionId);
}

export async function changePassword(c: Container, userId: string, sessionId: string, current: string, next: string, meta: RequestMeta) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) throw notFound();
  if (!(await c.hasher.verify(user.passwordHash, current))) throw badRequest('Your current password is not right.', 'wrong_password', { currentPassword: 'Not right' });
  if (current === next) throw badRequest('Pick a password you have not used just now.', 'same_password', { newPassword: 'Must be different' });
  await c.db
    .update(s.users)
    .set({ passwordHash: await c.hasher.hash(next), mustChangePassword: false, tempPasswordExpiresAt: null, updatedAt: c.clock.now() })
    .where(eq(s.users.id, userId));
  await revokeAllSessions(c, userId, sessionId);
  await audit(c, { teamId: user.teamId, actorId: userId, actorRole: user.role, action: 'user.password_change', targetType: 'user', targetId: userId, ip: meta.ip, userAgent: meta.userAgent });
}

export async function listSessions(c: Container, userId: string, currentId: string): Promise<SessionDto[]> {
  const rows = await activeSessions(c, userId);
  return rows.map((r) => ({ id: r.id, deviceLabel: r.deviceLabel, userAgent: r.userAgent, ip: r.ip, createdAt: r.createdAt.toISOString(), lastSeenAt: r.lastSeenAt.toISOString(), current: r.id === currentId }));
}

export async function revokeOwnSession(c: Container, userId: string, sessionId: string) {
  const row = await c.db.query.sessions.findFirst({ where: and(eq(s.sessions.id, sessionId), eq(s.sessions.userId, userId)) });
  if (!row) throw notFound('Session not found.');
  await revokeSession(c, sessionId);
}

/** Re-confirm the password (and TOTP if enrolled) to reopen the admin area after 12 idle hours. */
export async function reauth(c: Container, userId: string, sessionId: string, password: string, code?: string) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) throw notFound();
  if (!(await c.hasher.verify(user.passwordHash, password))) throw badRequest('That password is not right.', 'wrong_password', { password: 'Not right' });
  if (user.totpEnabledAt) {
    if (!code) throw badRequest('Enter your authenticator code.', 'mfa_code_required', { code: 'Required' });
    await verifyTotpForUser(c, user, code);
  }
  await c.db.update(s.sessions).set({ adminLastActiveAt: c.clock.now(), mfaVerifiedAt: user.totpEnabledAt ? c.clock.now() : null }).where(eq(s.sessions.id, sessionId));
}

/* ───────── TOTP (admins) ───────── */

async function checkTotp(secret: string, code: string): Promise<boolean> {
  const { verify } = await import('otplib');
  const r = await verify({ secret, token: code, epochTolerance: 30 });
  return r.valid;
}

async function newSecret(): Promise<string> {
  const { generateSecret } = await import('otplib');
  return generateSecret();
}

async function keyUri(label: string, secret: string): Promise<string> {
  const { generateURI } = await import('otplib');
  return generateURI({ issuer: 'Clubhouse', label, secret });
}

async function verifyTotpForUser(c: Container, user: typeof s.users.$inferSelect, code: string) {
  const { limit, windowSec } = LIMITS.totp;
  const rl = await checkRateLimit(c, `totp:${user.id}`, limit, windowSec);
  if (rl.blocked) throw new AppError(429, 'totp_locked', 'Too many code attempts. Try again later.');
  const trimmed = code.trim().toLowerCase();
  if (/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(trimmed)) {
    const hashes = user.totpRecoveryHashes ?? [];
    const h = sha256(`${trimmed}:${c.env.SESSION_PEPPER}`);
    if (hashes.includes(h)) {
      await c.db.update(s.users).set({ totpRecoveryHashes: hashes.filter((x) => x !== h) }).where(eq(s.users.id, user.id));
      return;
    }
  } else if (user.totpSecretEnc && (await checkTotp(unseal(c.env.TOTP_ENC_KEY, user.totpSecretEnc), trimmed))) {
    return;
  }
  await incrementRateLimit(c, `totp:${user.id}`, windowSec);
  throw badRequest('That code didn’t work. Check the time on your phone and try again.', 'invalid_code', { code: 'Invalid code' });
}

export async function verifyMfa(c: Container, userId: string, sessionId: string, code: string) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user?.totpEnabledAt) throw badRequest('Two-step sign-in is not set up.', 'mfa_not_enabled');
  await verifyTotpForUser(c, user, code);
  await c.db.update(s.sessions).set({ mfaVerifiedAt: c.clock.now(), adminLastActiveAt: user.role !== 'member' ? c.clock.now() : null }).where(eq(s.sessions.id, sessionId));
}

export async function enrolTotp(c: Container, userId: string) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user) throw notFound();
  if (user.role === 'member') throw forbidden('Two-step sign-in is for admins.');
  const secret = await newSecret();
  await c.db.update(s.users).set({ totpPendingSecretEnc: seal(c.env.TOTP_ENC_KEY, secret) }).where(eq(s.users.id, userId));
  return { otpauthUrl: await keyUri(user.email ?? user.username, secret), secret };
}

export async function confirmTotp(c: Container, userId: string, sessionId: string, code: string, meta: RequestMeta) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user?.totpPendingSecretEnc) throw badRequest('Start the set-up again.', 'no_pending_totp');
  const secret = unseal(c.env.TOTP_ENC_KEY, user.totpPendingSecretEnc);
  if (!(await checkTotp(secret, code.trim()))) throw badRequest('That code didn’t work. Try the newest code.', 'invalid_code', { code: 'Invalid code' });
  const codes = Array.from({ length: 8 }, () => recoveryCode());
  await c.db
    .update(s.users)
    .set({ totpSecretEnc: user.totpPendingSecretEnc, totpPendingSecretEnc: null, totpEnabledAt: c.clock.now(), totpRecoveryHashes: codes.map((x) => sha256(`${x}:${c.env.SESSION_PEPPER}`)) })
    .where(eq(s.users.id, userId));
  await c.db.update(s.sessions).set({ mfaVerifiedAt: c.clock.now() }).where(eq(s.sessions.id, sessionId));
  await audit(c, { teamId: user.teamId, actorId: userId, actorRole: user.role, action: 'user.totp_enable', targetType: 'user', targetId: userId, ip: meta.ip, userAgent: meta.userAgent });
  return { recoveryCodes: codes };
}

export async function disableTotp(c: Container, userId: string, code: string, meta: RequestMeta) {
  const user = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!user?.totpEnabledAt) throw badRequest('Two-step sign-in is not on.', 'mfa_not_enabled');
  await verifyTotpForUser(c, user, code);
  await c.db.update(s.users).set({ totpSecretEnc: null, totpEnabledAt: null, totpRecoveryHashes: null }).where(eq(s.users.id, userId));
  await audit(c, { teamId: user.teamId, actorId: userId, actorRole: user.role, action: 'user.totp_disable', targetType: 'user', targetId: userId, ip: meta.ip, userAgent: meta.userAgent });
}

export async function cleanupExpiredSessions(c: Container) {
  const cutoff = new Date(c.clock.now().getTime() - 7 * 86400_000).toISOString();
  await c.db.delete(s.sessions).where(or(sql`${s.sessions.expiresAt} < ${cutoff}::timestamptz`, and(sql`${s.sessions.revokedAt} is not null`, sql`${s.sessions.revokedAt} < ${cutoff}::timestamptz`)));
  await c.db.delete(s.rateLimits).where(sql`${s.rateLimits.windowStart} < now() - interval '2 hours'`);
  return { ok: true, isNull };
}
