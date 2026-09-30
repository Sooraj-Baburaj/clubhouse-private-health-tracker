import { Hono } from 'hono';
import { z } from 'zod';
import { LocalDateStr, LogOptionRequest, OptionFeedbackRequest } from '@clubhouse/contracts';
import { getDiet, logOption, optionFeedback, previousPlan } from '../../../application/dietView';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, param, query } from '../validate';

export const dietRoutes = new Hono<AppEnv>()
  .use('/diet/*', writeLimit)
  .get('/diet', async (ctx) => {
    const a = currentAuth(ctx);
    const q = query(ctx, z.object({ date: LocalDateStr.optional(), dayType: z.enum(['training', 'rest']).optional() }));
    return ctx.json(await getDiet(ctx.get('c'), a.user, q.date, q.dayType));
  })
  .get('/diet/plans/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await previousPlan(ctx.get('c'), a.user, param(ctx, 'id')));
  })
  .post('/diet/options/:id/log', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await logOption(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, LogOptionRequest)));
  })
  .post('/diet/options/:id/feedback', async (ctx) => {
    const a = currentAuth(ctx);
    const { reaction } = await body(ctx, OptionFeedbackRequest);
    await optionFeedback(ctx.get('c'), a.user, param(ctx, 'id'), reaction);
    return ctx.json({ ok: true });
  });
