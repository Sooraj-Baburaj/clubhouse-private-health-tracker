import { Hono } from 'hono';
import { AdminHabitInput, HabitEnabledRequest } from '@clubhouse/contracts';
import * as habits from '../../../../application/admin/habits';
import type { AppEnv } from '../../types';
import { body, param } from '../../validate';
import { actor, OK } from './util';

export const habitRoutes = new Hono<AppEnv>()
  .get('/habits', async (ctx) => ctx.json(await habits.listHabits(ctx.get('c'), actor(ctx))))
  .get('/habits/adherence', async (ctx) => ctx.json(await habits.adherence(ctx.get('c'), actor(ctx))))
  .post('/habits', async (ctx) => ctx.json(await habits.createHabit(ctx.get('c'), actor(ctx), await body(ctx, AdminHabitInput))))
  .post('/habits/templates/:key', async (ctx) => ctx.json(await habits.addTemplate(ctx.get('c'), actor(ctx), param(ctx, 'key', /^[a-z_]{1,40}$/))))
  .put('/habits/:id', async (ctx) => ctx.json(await habits.updateHabit(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, AdminHabitInput))))
  .post('/habits/:id/enabled', async (ctx) => {
    const { enabled } = await body(ctx, HabitEnabledRequest);
    return ctx.json(await habits.setHabitEnabled(ctx.get('c'), actor(ctx), param(ctx, 'id'), enabled));
  })
  .post('/habits/:id/archive', async (ctx) => {
    await habits.archiveHabit(ctx.get('c'), actor(ctx), param(ctx, 'id'));
    return ctx.json(OK);
  });
