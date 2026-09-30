import { Hono } from 'hono';
import { z } from 'zod';
import { BulkAssignRequest, CreateDraftRequest, DraftWithAiRequest, PublishPlanRequest, ReviewSlotRequest, UpdatePlanRequest, UpsertOptionRequest } from '@clubhouse/contracts';
import * as diets from '../../../../application/admin/diets';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor } from './util';

export const dietRoutes = new Hono<AppEnv>()
  .get('/diets', async (ctx) => ctx.json(await diets.listDiets(ctx.get('c'), actor(ctx))))
  .get('/diets/templates', async (ctx) => ctx.json(await diets.templates(ctx.get('c'), actor(ctx))))
  .post('/diets/plans', async (ctx) => ctx.json(await diets.createDraft(ctx.get('c'), actor(ctx), await body(ctx, CreateDraftRequest))))
  .get('/diets/plans/:planId', async (ctx) => ctx.json(await diets.getPlan(ctx.get('c'), actor(ctx), param(ctx, 'planId'))))
  .patch('/diets/plans/:planId', async (ctx) => ctx.json(await diets.updatePlan(ctx.get('c'), actor(ctx), param(ctx, 'planId'), await body(ctx, UpdatePlanRequest))))
  .delete('/diets/plans/:planId', async (ctx) => ctx.json(await diets.deletePlan(ctx.get('c'), actor(ctx), param(ctx, 'planId'))))
  .post('/diets/plans/:planId/options', async (ctx) => ctx.json(await diets.addOption(ctx.get('c'), actor(ctx), param(ctx, 'planId'), await body(ctx, UpsertOptionRequest))))
  .put('/diets/plans/:planId/options/:optionId', async (ctx) =>
    ctx.json(await diets.updateOption(ctx.get('c'), actor(ctx), param(ctx, 'planId'), param(ctx, 'optionId'), await body(ctx, UpsertOptionRequest))),
  )
  .delete('/diets/plans/:planId/options/:optionId', async (ctx) => ctx.json(await diets.deleteOption(ctx.get('c'), actor(ctx), param(ctx, 'planId'), param(ctx, 'optionId'))))
  .post('/diets/plans/:planId/review', async (ctx) => {
    const { slot } = await body(ctx, ReviewSlotRequest);
    return ctx.json(await diets.reviewSlot(ctx.get('c'), actor(ctx), param(ctx, 'planId'), slot));
  })
  .post('/diets/plans/:planId/publish', async (ctx) => {
    const { note } = await body(ctx, PublishPlanRequest);
    return ctx.json(await diets.publish(ctx.get('c'), actor(ctx), param(ctx, 'planId'), note || null));
  })
  .post('/diets/plans/:planId/template', async (ctx) => {
    const { name } = await body(ctx, z.object({ name: z.string().trim().min(1).max(80) }));
    return ctx.json(await diets.saveAsTemplate(ctx.get('c'), actor(ctx), param(ctx, 'planId'), name));
  })
  .get('/diets/plans/:planId/diff/:otherId', async (ctx) => ctx.json(await diets.diff(ctx.get('c'), actor(ctx), param(ctx, 'planId'), param(ctx, 'otherId'))))
  .post('/diets/ai-draft', async (ctx) => ctx.json(await diets.draftWithAi(ctx.get('c'), actor(ctx), await body(ctx, DraftWithAiRequest))))
  .get('/diets/members/:userId/feedback', async (ctx) => ctx.json(await diets.feedback(ctx.get('c'), actor(ctx), param(ctx, 'userId'))))
  .post('/diets/bulk-assign', async (ctx) => ctx.json(await diets.bulkAssign(ctx.get('c'), actor(ctx), await body(ctx, BulkAssignRequest))));
