import { Hono } from 'hono';
import { z } from 'zod';
import { LocalDateStr } from '@clubhouse/contracts';
import { memberDay, teamSummary } from '../../../application/teamView';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { param, query } from '../validate';

const DateQuery = z.object({ date: LocalDateStr.optional() });

/** Team rows and the member sheet (APP-PROG-07/08). Never exposes weight. */
export const teamRoutes = new Hono<AppEnv>()
  .get('/team/summary', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, DateQuery);
    return ctx.json(await teamSummary(ctx.get('c'), a.user, date));
  })
  .get('/team/members/:id/day', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, DateQuery);
    return ctx.json(await memberDay(ctx.get('c'), a.user, param(ctx, 'id'), date));
  });
