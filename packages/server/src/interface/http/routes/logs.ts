import { Hono } from 'hono';
import { z } from 'zod';
import { ActivityLogUpsert, FoodLogUpsert, LocalDateStr, SyncRequest, WeightUpsert } from '@clubhouse/contracts';
import * as logs from '../../../application/logs';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, param, query } from '../validate';

export const logRoutes = new Hono<AppEnv>()
  .use('/logs/*', writeLimit)
  .use('/sync', writeLimit)
  .get('/activity-types', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await logs.listActivityTypes(ctx.get('c'), a.user));
  })
  .get('/logs', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, z.object({ date: LocalDateStr }));
    const r = await logs.logsForDate(ctx.get('c'), a.user, a.user.id, date);
    return ctx.json({ foodLogs: r.foodLogs, activityLogs: r.activityLogs, weight: r.weight });
  })
  .get('/logs/food/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await logs.getFoodLog(ctx.get('c'), a.user.id, param(ctx, 'id')));
  })
  .put('/logs/food/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await logs.upsertFoodLog(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, FoodLogUpsert)));
  })
  .put('/logs/activity/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await logs.upsertActivityLog(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, ActivityLogUpsert)));
  })
  .put('/logs/weight/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await logs.upsertWeight(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, WeightUpsert)));
  })
  .post('/sync', async (ctx) => {
    const a = currentAuth(ctx);
    const { ops } = await body(ctx, SyncRequest);
    return ctx.json(await logs.sync(ctx.get('c'), a.user, ops));
  })
  .get('/sync/changes', async (ctx) => {
    const a = currentAuth(ctx);
    const { since } = query(ctx, z.object({ since: z.string().datetime({ offset: true }).optional() }));
    return ctx.json(await logs.changesSince(ctx.get('c'), a.user, since ?? null));
  });
