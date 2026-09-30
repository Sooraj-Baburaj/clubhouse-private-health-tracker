import { Hono } from 'hono';
import { z } from 'zod';
import { RetentionUpdate } from '@clubhouse/contracts';
import * as retention from '../../../../application/admin/retention';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor, OK } from './util';

export const retentionRoutes = new Hono<AppEnv>()
  .get('/retention', async (ctx) => ctx.json(await retention.getRetention(ctx.get('c'), actor(ctx))))
  .put('/retention', async (ctx) => {
    const input = await body(ctx, RetentionUpdate);
    await retention.updateRetention(ctx.get('c'), actor(ctx), input.retentionDays, input.reason);
    return ctx.json(OK);
  })
  .post('/retention/run', async (ctx) => {
    const { dryRun } = await body(ctx, z.object({ dryRun: z.boolean() }));
    return ctx.json(await retention.runRetention(ctx.get('c'), actor(ctx), dryRun));
  })
  .post('/exports', async (ctx) => ctx.json(await retention.exportTeam(ctx.get('c'), actor(ctx))))
  .post('/deletion-requests/:id', async (ctx) => {
    const { action } = await body(ctx, z.object({ action: z.enum(['done', 'dismissed']) }));
    await retention.handleDeletion(ctx.get('c'), actor(ctx), param(ctx, 'id'), action);
    return ctx.json(OK);
  });
