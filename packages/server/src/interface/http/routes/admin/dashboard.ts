import { Hono } from 'hono';
import { dashboard } from '../../../../application/admin/dashboard';
import type { AppEnv } from '../../types';
import { actor } from './util';

export const dashboardRoutes = new Hono<AppEnv>().get('/dashboard', async (ctx) => ctx.json(await dashboard(ctx.get('c'), actor(ctx))));
