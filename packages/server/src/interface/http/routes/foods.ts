import { Hono } from 'hono';
import { z } from 'zod';
import { CreateFoodRequest, CreateRecipeRequest, FoodSearchQuery } from '@clubhouse/contracts';
import * as foods from '../../../application/foods';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, param, query } from '../validate';

export const foodRoutes = new Hono<AppEnv>()
  .use('/foods/*', writeLimit)
  .use('/recipes', writeLimit)
  .get('/foods/search', async (ctx) => {
    const a = currentAuth(ctx);
    const q = query(ctx, FoodSearchQuery);
    return ctx.json(await foods.searchFoods(ctx.get('c'), a.user, q.q, q.limit));
  })
  .get('/foods/usuals', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await foods.usualFoods(ctx.get('c'), a.user));
  })
  .get('/foods/mine', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await foods.listMyFoods(ctx.get('c'), a.user));
  })
  .get('/foods/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await foods.getFood(ctx.get('c'), a.user, param(ctx, 'id')));
  })
  .post('/foods', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await foods.createFood(ctx.get('c'), a.user, await body(ctx, CreateFoodRequest)), 201);
  })
  .delete('/foods/:id', async (ctx) => {
    const a = currentAuth(ctx);
    await foods.deleteMyFood(ctx.get('c'), a.user, param(ctx, 'id'));
    return ctx.json({ ok: true });
  })
  .post('/foods/:id/favourite', async (ctx) => {
    const a = currentAuth(ctx);
    const { on } = await body(ctx, z.object({ on: z.boolean() }));
    await foods.toggleFavourite(ctx.get('c'), a.user, param(ctx, 'id'), on);
    return ctx.json({ ok: true });
  })
  .post('/recipes', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await foods.createRecipe(ctx.get('c'), a.user, await body(ctx, CreateRecipeRequest)), 201);
  });
