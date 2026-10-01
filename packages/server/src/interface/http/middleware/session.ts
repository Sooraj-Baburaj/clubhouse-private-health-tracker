import { and, eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { schema as s } from '@clubhouse/db';
import { ADMIN_IDLE_MS, hashToken, SESSION_DAYS } from '../../../application/sessions';
import { getTeam } from '../../../application/team';
import { AppError, forbidden, unauthorized } from '../../../lib/errors';
import type { AppEnv, AuthState } from '../types';
import { ROLE_RANK, type Role } from '@clubhouse/contracts';

/** Loads the session from the HttpOnly cookie (or `Authorization: Bearer` for tooling) and attaches the user. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (ctx, next) => {
  const c = ctx.get('c');
  ctx.set('auth', null);
  const bearer = ctx.req.header('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const token = getCookie(ctx, c.env.cookieName) ?? bearer;
  if (token && token.length < 200) {
    const row = await c.db
      .select({ session: s.sessions, user: s.users })
      .from(s.sessions)
      .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
      .where(and(eq(s.sessions.tokenHash, hashToken(c, token))))
      .limit(1);
    const hit = row[0];
    const now = c.clock.now();
    if (hit && !hit.session.revokedAt && hit.session.expiresAt > now && hit.user.status === 'active') {
      const team = await getTeam(c, hit.user.teamId);
      const auth: AuthState = {
        user: {
          id: hit.user.id,
          teamId: hit.user.teamId,
          username: hit.user.username,
          displayName: hit.user.displayName,
          email: hit.user.email,
          role: hit.user.role,
          mustChangePassword: hit.user.mustChangePassword,
          timezone: hit.user.timezone || team.timezone,
          teamTimezone: team.timezone,
          totpEnabled: !!hit.user.totpEnabledAt,
          avatarImageId: hit.user.avatarImageId,
        },
        session: { id: hit.session.id, createdAt: hit.session.createdAt, adminLastActiveAt: hit.session.adminLastActiveAt, mfaVerifiedAt: hit.session.mfaVerifiedAt },
        mfaPending: !!hit.user.totpEnabledAt && !hit.session.mfaVerifiedAt,
      };
      ctx.set('auth', auth);
      // Sliding expiry, written at most hourly to keep writes low.
      if (now.getTime() - hit.session.lastSeenAt.getTime() > 3600_000) {
        await c.db
          .update(s.sessions)
          .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_DAYS * 86400_000), ip: ctx.get('ip') })
          .where(eq(s.sessions.id, hit.session.id));
      }
      if (!hit.user.lastActiveAt || now.getTime() - hit.user.lastActiveAt.getTime() > 60_000) {
        await c.db.update(s.users).set({ lastActiveAt: now }).where(eq(s.users.id, hit.user.id));
      }
    }
  }
  await next();
});

/** Same-origin when the browser's Origin host matches the host the request was sent to (LAN IPs, tunnels, preview URLs). */
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host.split(',')[0]!.trim();
  } catch {
    return false;
  }
}

/** Mutations need the custom client header and, when present, a same-origin Origin (NFR-SEC-02). */
export const csrfMiddleware = createMiddleware<AppEnv>(async (ctx, next) => {
  const method = ctx.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const path = ctx.req.path;
    const exempt = path.startsWith('/api/jobs/') || path === '/api/setup';
    if (!exempt) {
      if (!ctx.req.header('x-clubhouse-client')) throw new AppError(403, 'csrf', 'Missing client header.');
      const origin = ctx.req.header('origin');
      const c = ctx.get('c');
      if (origin && !c.env.allowedOrigins.includes(origin) && !isSameOrigin(origin, ctx.req.header('x-forwarded-host') ?? ctx.req.header('host'))) {
        throw new AppError(403, 'csrf', 'Cross-origin request blocked.');
      }
    }
  }
  await next();
});

export interface AuthOptions {
  allowMfaPending?: boolean;
  allowMustChange?: boolean;
}

export function currentAuth(ctx: { get: (k: 'auth') => AuthState | null }, opts: AuthOptions = {}): AuthState {
  const auth = ctx.get('auth');
  if (!auth) throw unauthorized();
  if (auth.mfaPending && !opts.allowMfaPending) throw new AppError(401, 'mfa_required', 'Enter your authenticator code to continue.');
  if (auth.user.mustChangePassword && !opts.allowMustChange) throw new AppError(403, 'password_change_required', 'Please set a new password first.');
  return auth;
}

export const requireAuth = (opts: AuthOptions = {}) =>
  createMiddleware<AppEnv>(async (ctx, next) => {
    currentAuth(ctx, opts);
    await next();
  });

export const requireRole = (min: Role) =>
  createMiddleware<AppEnv>(async (ctx, next) => {
    const auth = currentAuth(ctx);
    if (ROLE_RANK[auth.user.role] < ROLE_RANK[min]) throw forbidden(min === 'super_admin' ? 'Only a Super Admin can do this.' : 'This area is for admins.', 'role_required');
    await next();
  });

/** Admin area needs activity within the last 12 hours (NFR-SEC-06); re-stamped at most every 5 minutes. */
export const adminIdleMiddleware = createMiddleware<AppEnv>(async (ctx, next) => {
  const auth = currentAuth(ctx);
  const c = ctx.get('c');
  const now = c.clock.now();
  const last = auth.session.adminLastActiveAt;
  if (!last || now.getTime() - last.getTime() > ADMIN_IDLE_MS) throw new AppError(401, 'admin_reauth_required', 'Please confirm your password to continue in the admin panel.');
  if (now.getTime() - last.getTime() > 5 * 60_000) {
    await c.db.update(s.sessions).set({ adminLastActiveAt: now }).where(eq(s.sessions.id, auth.session.id));
  }
  await next();
});

export const cronAuthMiddleware = createMiddleware<AppEnv>(async (ctx, next) => {
  const c = ctx.get('c');
  const header = ctx.req.header('authorization') ?? '';
  const { safeEqual } = await import('../../../lib/crypto');
  if (!safeEqual(header, `Bearer ${c.env.CRON_SECRET}`)) throw unauthorized('Invalid cron secret.', 'cron_unauthorized');
  await next();
});
