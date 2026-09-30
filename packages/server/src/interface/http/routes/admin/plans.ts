import { Hono } from 'hono';
import { AdminRestWeekRequest, AssignPlanTemplateRequest, ProposalReplyRequest, RestWeekDecision, UpsertPlanRequest } from '@clubhouse/contracts';
import * as plans from '../../../../application/admin/plans';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor, OK } from './util';

export const planRoutes = new Hono<AppEnv>()
  .get('/plans', async (ctx) => ctx.json(await plans.listPlans(ctx.get('c'), actor(ctx))))
  .post('/plans/assign', async (ctx) => ctx.json(await plans.assignPlan(ctx.get('c'), actor(ctx), await body(ctx, AssignPlanTemplateRequest))))
  .get('/plans/ranking', async (ctx) => ctx.json(await plans.ranking(ctx.get('c'), actor(ctx))))
  .get('/plans/proposals', async (ctx) => ctx.json(await plans.proposals(ctx.get('c'), actor(ctx))))
  .post('/plans/proposals/:id', async (ctx) => {
    await plans.replyProposal(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, ProposalReplyRequest));
    return ctx.json(OK);
  })
  .get('/plans/rest-weeks', async (ctx) => ctx.json(await plans.restWeeks(ctx.get('c'), actor(ctx))))
  .post('/plans/rest-weeks', async (ctx) => {
    await plans.setRestWeek(ctx.get('c'), actor(ctx), await body(ctx, AdminRestWeekRequest));
    return ctx.json(OK);
  })
  .post('/plans/rest-weeks/:id', async (ctx) => {
    const { status } = await body(ctx, RestWeekDecision);
    await plans.decideRestWeek(ctx.get('c'), actor(ctx), param(ctx, 'id'), status);
    return ctx.json(OK);
  })
  .get('/plans/:userId', async (ctx) => ctx.json(await plans.getPlan(ctx.get('c'), actor(ctx), param(ctx, 'userId'))))
  .put('/plans/:userId', async (ctx) => {
    await plans.upsertPlan(ctx.get('c'), actor(ctx), param(ctx, 'userId'), await body(ctx, UpsertPlanRequest));
    return ctx.json(OK);
  });
