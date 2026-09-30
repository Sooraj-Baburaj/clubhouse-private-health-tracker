import { Hono } from 'hono';
import { z } from 'zod';
import { LocalDateStr } from '@clubhouse/contracts';
import * as progress from '../../../application/progress';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { query } from '../validate';

/** Progress tab (APP-PROG-01…09). */
export const progressRoutes = new Hono<AppEnv>()
  .get('/progress/weight', async (ctx) => {
    const a = currentAuth(ctx);
    const { range } = query(ctx, z.object({ range: z.enum(['4w', '3m', '1y', 'all']).default('3m') }));
    return ctx.json(await progress.weightProgress(ctx.get('c'), a.user, range));
  })
  .get('/progress/what-if', async (ctx) => {
    const a = currentAuth(ctx);
    const { delta } = query(ctx, z.object({ delta: z.coerce.number().int().min(-500).max(500) }));
    return ctx.json(await progress.whatIfForecast(ctx.get('c'), a.user, delta));
  })
  .get('/progress/calories', async (ctx) => {
    const a = currentAuth(ctx);
    const { range } = query(ctx, z.object({ range: z.enum(['1w', '4w', '3m']).default('1w') }));
    return ctx.json(await progress.caloriesProgress(ctx.get('c'), a.user, range));
  })
  .get('/progress/nutrients', async (ctx) => {
    const a = currentAuth(ctx);
    const { weekStart } = query(ctx, z.object({ weekStart: LocalDateStr.optional() }));
    return ctx.json(await progress.nutrientGrid(ctx.get('c'), a.user, weekStart));
  })
  .get('/progress/activity', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await progress.activityProgress(ctx.get('c'), a.user));
  })
  .get('/progress/consistency', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await progress.consistencyProgress(ctx.get('c'), a.user));
  })
  .get('/progress/recaps', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await progress.listRecaps(ctx.get('c'), a.user));
  });
