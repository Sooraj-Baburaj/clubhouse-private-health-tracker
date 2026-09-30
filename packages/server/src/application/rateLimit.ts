import { and, eq, sql } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { tooMany } from '../lib/errors';

function windowStart(now: Date, windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

async function effectiveCount(c: Container, key: string, windowSec: number, now: Date, current: number) {
  const start = windowStart(now, windowSec);
  const prevStart = new Date(start.getTime() - windowSec * 1000);
  const prev = await c.db.query.rateLimits.findFirst({ where: and(eq(s.rateLimits.key, key), eq(s.rateLimits.windowStart, prevStart)) });
  const elapsed = (now.getTime() - start.getTime()) / (windowSec * 1000);
  return { effective: (prev?.count ?? 0) * (1 - elapsed) + current, retryAfter: windowSec * (1 - elapsed) };
}

/**
 * Sliding-window rate limit stored in Postgres (no Redis on Vercel Hobby). Two fixed buckets weighted by elapsed time.
 * Throws 429 with Retry-After when the limit is exceeded.
 */
export async function hitRateLimit(c: Container, key: string, limit: number, windowSec: number, message = 'Slow down a little and try again.') {
  const now = c.clock.now();
  const start = windowStart(now, windowSec);
  const [row] = await c.db
    .insert(s.rateLimits)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({ target: [s.rateLimits.key, s.rateLimits.windowStart], set: { count: sql`${s.rateLimits.count} + 1` } })
    .returning({ count: s.rateLimits.count });
  const { effective, retryAfter } = await effectiveCount(c, key, windowSec, now, row!.count);
  if (effective > limit) throw tooMany(message, retryAfter);
}

/** Read-only check (for login: only failures increment). */
export async function checkRateLimit(c: Container, key: string, limit: number, windowSec: number): Promise<{ blocked: boolean; retryAfter: number }> {
  const now = c.clock.now();
  const start = windowStart(now, windowSec);
  const cur = await c.db.query.rateLimits.findFirst({ where: and(eq(s.rateLimits.key, key), eq(s.rateLimits.windowStart, start)) });
  const { effective, retryAfter } = await effectiveCount(c, key, windowSec, now, cur?.count ?? 0);
  return { blocked: effective >= limit, retryAfter };
}

export async function incrementRateLimit(c: Container, key: string, windowSec: number) {
  const start = windowStart(c.clock.now(), windowSec);
  await c.db
    .insert(s.rateLimits)
    .values({ key, windowStart: start, count: 1 })
    .onConflictDoUpdate({ target: [s.rateLimits.key, s.rateLimits.windowStart], set: { count: sql`${s.rateLimits.count} + 1` } });
}

export async function resetRateLimit(c: Container, key: string) {
  await c.db.delete(s.rateLimits).where(eq(s.rateLimits.key, key));
}

export const LIMITS = {
  loginFailures: { limit: 5, windowSec: 15 * 60 },
  writes: { limit: 60, windowSec: 60 },
  photos: { limit: 20, windowSec: 3600 },
  chat: { limit: 30, windowSec: 60 },
  totp: { limit: 5, windowSec: 15 * 60 },
} as const;
