import { Hono } from 'hono';
import { getMomentum, markBadgesSeen } from '../../../application/momentumView';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';

export const momentumRoutes = new Hono<AppEnv>()
  .get('/momentum', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await getMomentum(ctx.get('c'), a.user));
  })
  .post('/momentum/badges-seen', async (ctx) => {
    const a = currentAuth(ctx);
    await markBadgesSeen(ctx.get('c'), a.user);
    return ctx.json({ ok: true });
  });
