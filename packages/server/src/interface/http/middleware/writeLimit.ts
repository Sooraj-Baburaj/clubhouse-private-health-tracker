import { createMiddleware } from 'hono/factory';
import { hitRateLimit, LIMITS } from '../../../application/rateLimit';
import type { AppEnv } from '../types';

/** NFR-SEC-04: every member write is limited to 60 per minute per user. */
export const writeLimit = createMiddleware<AppEnv>(async (ctx, next) => {
  const m = ctx.req.method;
  const auth = ctx.get('auth');
  if (auth && m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
    await hitRateLimit(ctx.get('c'), `write:${auth.user.id}`, LIMITS.writes.limit, LIMITS.writes.windowSec);
  }
  await next();
});
