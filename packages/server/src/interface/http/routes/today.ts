import { Hono } from 'hono';
import { z } from 'zod';
import { LocalDateStr } from '@clubhouse/contracts';
import { getToday } from '../../../application/today';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { query } from '../validate';

export const todayRoutes = new Hono<AppEnv>().get('/today', async (ctx) => {
  const a = currentAuth(ctx);
  const { date } = query(ctx, z.object({ date: LocalDateStr.optional() }));
  return ctx.json(await getToday(ctx.get('c'), a.user, date));
});
