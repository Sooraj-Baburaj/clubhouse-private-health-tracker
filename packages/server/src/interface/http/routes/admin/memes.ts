import { Hono } from 'hono';
import { z } from 'zod';
import { BulkMemeRequest, CreateMemeRequest, DryRunRequest, TriggerDefinition, UpdateMemeRequest } from '@clubhouse/contracts';
import * as memes from '../../../../application/admin/memes';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor, OK } from './util';

export const memeRoutes = new Hono<AppEnv>()
  .get('/memes', async (ctx) => ctx.json(await memes.listMemes(ctx.get('c'), actor(ctx))))
  .post('/memes/bulk', async (ctx) => ctx.json(await memes.bulkMemes(ctx.get('c'), actor(ctx), await body(ctx, BulkMemeRequest))))
  .post('/memes', async (ctx) => ctx.json(await memes.createMeme(ctx.get('c'), actor(ctx), await body(ctx, CreateMemeRequest))))
  .patch('/memes/:id', async (ctx) => ctx.json(await memes.updateMeme(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, UpdateMemeRequest))))
  .get('/triggers', async (ctx) => ctx.json(await memes.listTriggers(ctx.get('c'), actor(ctx))))
  .post('/triggers', async (ctx) => ctx.json(await memes.createTrigger(ctx.get('c'), actor(ctx), await body(ctx, TriggerDefinition))))
  .put('/triggers/:id', async (ctx) => ctx.json(await memes.updateTrigger(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, TriggerDefinition))))
  .post('/triggers/:id/toggle', async (ctx) => {
    const { enabled } = await body(ctx, z.object({ enabled: z.boolean() }));
    return ctx.json(await memes.toggleTrigger(ctx.get('c'), actor(ctx), param(ctx, 'id'), enabled));
  })
  .delete('/triggers/:id', async (ctx) => {
    await memes.deleteTrigger(ctx.get('c'), actor(ctx), param(ctx, 'id'));
    return ctx.json(OK);
  })
  .post('/triggers/:id/dry-run', async (ctx) => {
    const id = param(ctx, 'id', /^(all|[0-9a-f-]{36})$/i);
    const input = await body(ctx, DryRunRequest);
    return ctx.json(await memes.dryRun(ctx.get('c'), actor(ctx), id === 'all' ? null : id, input.memberId, input.date));
  })
  .post('/triggers/:id/fire-test', async (ctx) => ctx.json(await memes.fireTest(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .get('/triggers/:id/evaluations', async (ctx) => ctx.json(await memes.evaluations(ctx.get('c'), actor(ctx), param(ctx, 'id'))));
