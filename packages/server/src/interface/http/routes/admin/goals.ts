import { Hono } from 'hono';
import { z } from 'zod';
import { AdminGoalUpdate, MemberTargetSettingsRequest, OverrideTargetsRequest } from '@clubhouse/contracts';
import * as goals from '../../../../application/admin/goals';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor } from './util';

export const goalRoutes = new Hono<AppEnv>()
  .get('/goals', async (ctx) => ctx.json(await goals.listGoals(ctx.get('c'), actor(ctx))))
  .put('/goals/:userId', async (ctx) => ctx.json(await goals.updateGoal(ctx.get('c'), actor(ctx), param(ctx, 'userId'), await body(ctx, AdminGoalUpdate))))
  .post('/goals/:userId/override', async (ctx) => ctx.json(await goals.overrideTargets(ctx.get('c'), actor(ctx), param(ctx, 'userId'), await body(ctx, OverrideTargetsRequest))))
  .post('/goals/:userId/clear-override', async (ctx) => {
    const { reason } = await body(ctx, z.object({ reason: z.string().trim().min(3, 'Give a reason (at least 3 characters).').max(300) }));
    return ctx.json(await goals.clearOverride(ctx.get('c'), actor(ctx), param(ctx, 'userId'), reason));
  })
  .patch('/goals/:userId/settings', async (ctx) => ctx.json(await goals.memberTargetSettings(ctx.get('c'), actor(ctx), param(ctx, 'userId'), await body(ctx, MemberTargetSettingsRequest))));
