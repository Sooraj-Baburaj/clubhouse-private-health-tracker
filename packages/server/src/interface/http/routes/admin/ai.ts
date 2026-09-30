import { Hono } from 'hono';
import { z } from 'zod';
import { AiBudgetUpdate, AiFeatureUpdate, AiPricingRow, AiRetentionUpdate, LocalDateStr } from '@clubhouse/contracts';
import * as ai from '../../../../application/admin/ai';
import type { AppEnv } from '../../types';
import { body, param, query } from '../../validate';
import { actor, csvResponse, OK } from './util';

const KEY = /^[a-z]+\.[a-z]+$/;
const Range = z.object({ from: LocalDateStr, to: LocalDateStr });
const CallsQuery = z.object({
  userId: z.string().uuid().optional(),
  feature: z.string().max(40).optional(),
  outcome: z.string().max(30).optional(),
  before: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const aiRoutes = new Hono<AppEnv>()
  .get('/ai', async (ctx) => ctx.json(await ai.overview(ctx.get('c'), actor(ctx))))
  .post('/ai/global', async (ctx) => {
    const { on, reason } = await body(ctx, z.object({ on: z.boolean(), reason: z.string().trim().max(300).optional() }));
    await ai.setGlobal(ctx.get('c'), actor(ctx), on, reason);
    return ctx.json(OK);
  })
  .patch('/ai/features/:key', async (ctx) => {
    await ai.updateFeature(ctx.get('c'), actor(ctx), param(ctx, 'key', KEY), await body(ctx, AiFeatureUpdate));
    return ctx.json(OK);
  })
  .put('/ai/budget', async (ctx) => {
    await ai.updateBudget(ctx.get('c'), actor(ctx), await body(ctx, AiBudgetUpdate));
    return ctx.json(OK);
  })
  .post('/ai/pricing', async (ctx) => {
    await ai.addPricing(ctx.get('c'), actor(ctx), await body(ctx, AiPricingRow));
    return ctx.json(OK);
  })
  .put('/ai/retention', async (ctx) => {
    const { promptRetentionDays } = await body(ctx, AiRetentionUpdate);
    await ai.updateRetention(ctx.get('c'), actor(ctx), promptRetentionDays);
    return ctx.json(OK);
  })
  .get('/ai/usage', async (ctx) => {
    const { from, to } = query(ctx, Range);
    return ctx.json(await ai.usage(ctx.get('c'), actor(ctx), from, to));
  })
  .get('/ai/usage.csv', async (ctx) => {
    const { from, to } = query(ctx, Range);
    return csvResponse(ctx, await ai.usageCsv(ctx.get('c'), actor(ctx), from, to), `ai-usage-${from}-to-${to}.csv`);
  })
  .get('/ai/calls', async (ctx) => ctx.json(await ai.calls(ctx.get('c'), actor(ctx), query(ctx, CallsQuery))))
  .get('/ai/calls/:id', async (ctx) => ctx.json(await ai.call(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .get('/ai/registry', (ctx) => ctx.json(ai.registry()))
  .post('/ai/test/:key', async (ctx) => ctx.json(await ai.testCall(ctx.get('c'), actor(ctx), param(ctx, 'key', KEY))));
