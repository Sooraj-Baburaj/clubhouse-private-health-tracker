import { Hono } from 'hono';
import { z } from 'zod';
import { HabitCheckinUpsert, HabitPrefUpdate, LocalDateStr, MemberHabitOrderRequest } from '@clubhouse/contracts';
import * as habits from '../../../application/habits';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, param, query } from '../validate';

export const habitRoutes = new Hono<AppEnv>()
  .use('/habits/checkins/*', writeLimit)
  .get('/habits', async (ctx) => {
    const a = currentAuth(ctx);
    const { date } = query(ctx, z.object({ date: LocalDateStr.optional() }));
    return ctx.json(await habits.getHabitDay(ctx.get('c'), a.user, date));
  })
  .get('/habits/week', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await habits.getHabitWeek(ctx.get('c'), a.user));
  })
  .put('/habits/order', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await habits.setMemberOrder(ctx.get('c'), a.user, (await body(ctx, MemberHabitOrderRequest)).ids));
  })
  .put('/habits/checkins/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await habits.upsertCheckin(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, HabitCheckinUpsert)));
  })
  .get('/habits/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await habits.getHabitDetail(ctx.get('c'), a.user, param(ctx, 'id')));
  })
  .patch('/habits/:id/prefs', async (ctx) => {
    const a = currentAuth(ctx);
    await habits.updateHabitPref(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, HabitPrefUpdate));
    return ctx.json({ ok: true });
  });
