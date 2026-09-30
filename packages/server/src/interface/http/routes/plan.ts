import { Hono } from 'hono';
import { ProposalRequest, RestWeekRequest, SetPlanDaysRequest } from '@clubhouse/contracts';
import { getMyPlan, proposeChange, requestRestWeek, setPlanDays } from '../../../application/planMember';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body } from '../validate';

export const planRoutes = new Hono<AppEnv>()
  .use('/activity-plan/*', writeLimit)
  .get('/activity-plan', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await getMyPlan(ctx.get('c'), a.user));
  })
  .put('/activity-plan/days', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await setPlanDays(ctx.get('c'), a.user, await body(ctx, SetPlanDaysRequest)));
  })
  .post('/activity-plan/proposals', async (ctx) => {
    const a = currentAuth(ctx);
    const { text } = await body(ctx, ProposalRequest);
    await proposeChange(ctx.get('c'), a.user, text);
    return ctx.json({ ok: true });
  })
  .post('/activity-plan/rest-week', async (ctx) => {
    const a = currentAuth(ctx);
    const { weekStart, reason } = await body(ctx, RestWeekRequest);
    await requestRestWeek(ctx.get('c'), a.user, weekStart, reason);
    return ctx.json({ ok: true });
  });
