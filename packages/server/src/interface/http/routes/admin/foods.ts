import { Hono } from 'hono';
import { z } from 'zod';
import { AdminFoodUpdate, ImportFoodsRequest, MergeFoodsRequest } from '@clubhouse/contracts';
import * as foods from '../../../../application/admin/foods';
import type { AppEnv } from '../../types';
import { body, param, query } from '../../validate';
import { signalTeam } from '../../../../application/realtime';
import { actor, OK } from './util';

const FoodQuery = z.object({
  q: z.string().max(100).optional(),
  source: z.enum(['seed', 'usda', 'member', 'admin', 'ai']).optional(),
  verified: z.enum(['0', '1']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const foodRoutes = new Hono<AppEnv>()
  // Any successful catalogue write tells browsers to pull the food delta now instead of within the 6 h TTL.
  .use('/foods/*', async (ctx, next) => {
    await next();
    if (ctx.req.method !== 'GET' && ctx.res.ok) await signalTeam(ctx.get('c'), actor(ctx).user.teamId, 'foods.changed').catch(() => undefined);
  })
  .get('/foods', async (ctx) => ctx.json(await foods.listFoods(ctx.get('c'), actor(ctx), query(ctx, FoodQuery))))
  .post('/foods/merge', async (ctx) => {
    const input = await body(ctx, MergeFoodsRequest);
    await foods.mergeFoods(ctx.get('c'), actor(ctx), input.sourceId, input.targetId);
    return ctx.json(OK);
  })
  .post('/foods/import', async (ctx) => {
    const { csv } = await body(ctx, ImportFoodsRequest);
    return ctx.json(await foods.importFoods(ctx.get('c'), actor(ctx), csv));
  })
  .patch('/foods/:id', async (ctx) => ctx.json(await foods.updateFood(ctx.get('c'), actor(ctx), param(ctx, 'id'), await body(ctx, AdminFoodUpdate))))
  .post('/foods/:id/promote', async (ctx) => ctx.json(await foods.promoteFood(ctx.get('c'), actor(ctx), param(ctx, 'id'))))
  .delete('/foods/:id', async (ctx) => {
    await foods.deleteFood(ctx.get('c'), actor(ctx), param(ctx, 'id'));
    return ctx.json(OK);
  });
