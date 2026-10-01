import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { z } from 'zod';
import { CreateFoodRequest, CreateRecipeRequest, FoodCatalogQuery, FoodSearchQuery } from '@clubhouse/contracts';
import { catalogPage } from '../../../application/foodCatalog';
import { signalUser } from '../../../application/realtime';
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
  // A full snapshot is a few hundred KB of JSON; gzip brings it to roughly a fifth.
  .use('/foods/catalog', compress())
  .get('/foods/catalog', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await catalogPage(ctx.get('c'), a.user, query(ctx, FoodCatalogQuery)));
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
    const food = await foods.createFood(ctx.get('c'), a.user, await body(ctx, CreateFoodRequest));
    // The member's other devices pick the new food up in their offline catalogue.
    await signalUser(ctx.get('c'), a.user.id, 'foods.changed').catch(() => undefined);
    return ctx.json(food, 201);
  })
  .delete('/foods/:id', async (ctx) => {
    const a = currentAuth(ctx);
    await foods.deleteMyFood(ctx.get('c'), a.user, param(ctx, 'id'));
    await signalUser(ctx.get('c'), a.user.id, 'foods.changed').catch(() => undefined);
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
