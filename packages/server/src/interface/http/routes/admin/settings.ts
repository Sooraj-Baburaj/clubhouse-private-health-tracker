import { Hono } from 'hono';
import { TeamSettingsUpdate } from '@clubhouse/contracts';
import * as settings from '../../../../application/admin/settings';
import type { AppEnv } from '../../types';
import { body } from '../../validate';
import { actor } from './util';

export const settingsRoutes = new Hono<AppEnv>()
  .get('/settings', async (ctx) => ctx.json(await settings.getSettings(ctx.get('c'), actor(ctx))))
  .patch('/settings', async (ctx) => ctx.json(await settings.updateSettings(ctx.get('c'), actor(ctx), await body(ctx, TeamSettingsUpdate))));
