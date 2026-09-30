import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { acquireLease, runDaily, runTick, TICK_BUDGET_MS, TICK_LEASE_SEC } from '../../../application/jobs';
import { log } from '../../../lib/log';
import { cronAuthMiddleware } from '../middleware/session';
import type { AppEnv } from '../types';

const onVercel = () => !!process.env.VERCEL;

/** The tick budget: 50 s, or less when the platform's invocation deadline is closer. */
async function deadline(): Promise<number> {
  let d = Date.now() + TICK_BUDGET_MS;
  if (onVercel()) {
    try {
      const { getDeadline } = await import('@vercel/functions');
      const platform = getDeadline();
      if (platform) d = Math.min(d, platform.getTime() - 3000);
    } catch {
      /* not available: keep the fixed budget */
    }
  }
  return d;
}

/** On Vercel, reply within a second and keep working in waitUntil; locally (dev, tests) run inline. */
async function background<T>(work: Promise<T>): Promise<T | null> {
  if (onVercel()) {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(work.catch((e: Error) => log.error('jobs.background_failed', { error: e.message })));
    return null;
  }
  return work;
}

async function tick(ctx: Context<AppEnv>) {
  const c = ctx.get('c');
  const source = (ctx.req.query('source') ?? 'cron').slice(0, 40);
  const owner = randomUUID();
  if (!(await acquireLease(c, 'tick', TICK_LEASE_SEC, owner))) return ctx.json({ ran: false, reason: 'locked' }, 200);
  const result = await background(runTick(c, source, owner, await deadline()));
  return ctx.json(result ? { ran: true, ok: result.ok, ms: result.ms, steps: result.steps } : { ran: true }, 202);
}

async function daily(ctx: Context<AppEnv>) {
  const c = ctx.get('c');
  const source = (ctx.req.query('source') ?? 'vercel-cron').slice(0, 40);
  const owner = randomUUID();
  if (!(await acquireLease(c, 'daily', 240, owner))) return ctx.json({ ran: false, reason: 'locked' }, 200);
  const result = await background(runDaily(c, source, owner));
  return ctx.json(result ? { ran: true, ...result } : { ran: true }, 202);
}

/** §14: cron endpoints (bearer CRON_SECRET), both safe to call twice. Mounted at /api/jobs. */
export const jobRoutes = new Hono<AppEnv>().use('*', cronAuthMiddleware).on(['GET', 'POST'], '/tick', tick).on(['GET', 'POST'], '/daily', daily);
