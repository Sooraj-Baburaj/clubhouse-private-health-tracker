import { Hono } from 'hono';
import { NotificationDefaultsUpdate } from '@clubhouse/contracts';
import * as n from '../../../../application/admin/notifications';
import type { AppEnv } from '../../types';
import { body } from '../../validate';
import { actor, OK } from './util';

export const notificationRoutes = new Hono<AppEnv>()
  .get('/notifications/defaults', async (ctx) => ctx.json(await n.getDefaults(ctx.get('c'), actor(ctx))))
  .put('/notifications/defaults', async (ctx) => {
    await n.updateDefaults(ctx.get('c'), actor(ctx), await body(ctx, NotificationDefaultsUpdate));
    return ctx.json(OK);
  })
  .get('/notifications/push-health', async (ctx) => ctx.json(await n.pushHealth(ctx.get('c'), actor(ctx))))
  .post('/notifications/test', async (ctx) => ctx.json(await n.testToMe(ctx.get('c'), actor(ctx))));
