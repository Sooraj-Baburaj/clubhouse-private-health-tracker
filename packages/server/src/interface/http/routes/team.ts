import { Hono } from 'hono';
import { z } from 'zod';
import { BoardQuery, LocalDateStr } from '@clubhouse/contracts';
import { boardView, memberPoints } from '../../../application/board';
import { memberDay, teamSummary } from '../../../application/teamView';
import { currentAuth } from '../middleware/session';
import type { AppEnv } from '../types';
import { param, query } from '../validate';

const DateQuery = z.object({ date: LocalDateStr.optional() });

/** Crew today, the member sheet and the leaderboard (Team tab). Never exposes weight, calories or foods on the board. */
export const teamRoutes = new Hono<AppEnv>()
  .get('/team/summary', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, DateQuery);
    return ctx.json(await teamSummary(ctx.get('c'), a.user, date));
  })
  .get('/team/board', async (ctx) => {
    const a = currentAuth(ctx);
    const { week } = query(ctx, BoardQuery);
    return ctx.json(await boardView(ctx.get('c'), a.user, week));
  })
  .get('/team/members/:id/day', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, DateQuery);
    return ctx.json(await memberDay(ctx.get('c'), a.user, param(ctx, 'id'), date));
  })
  .get('/team/members/:id/points', async (ctx) => {
    const a = currentAuth(ctx);
    const { week } = query(ctx, BoardQuery);
    return ctx.json(await memberPoints(ctx.get('c'), a.user, param(ctx, 'id'), week));
  });
