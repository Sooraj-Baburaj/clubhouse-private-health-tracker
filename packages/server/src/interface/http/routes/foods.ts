import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { z } from 'zod';
import { FoodCatalogQuery, FoodDraft, FoodSearchQuery, LegacyCreateFoodRequest, RecipeRequest } from '@clubhouse/contracts';
import { catalogPage } from '../../../application/foodCatalog';
import { signalUser } from '../../../application/realtime';
import * as foods from '../../../application/foods';
import { currentAuth } from '../middleware/session';
import { writeLimit } from '../middleware/writeLimit';
import type { AppEnv } from '../types';
import { body, jsonBody, param, parseBody, query } from '../validate';

/** The member's other devices pick food changes up in their offline catalogue. */
const foodsChanged = (c: Parameters<typeof signalUser>[0], userId: string) => signalUser(c, userId, 'foods.changed').catch(() => undefined);

export const foodRoutes = new Hono<AppEnv>()
  .use('/foods/*', writeLimit)
  .use('/recipes', writeLimit)
  .use('/recipes/*', writeLimit)
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
    // Portions (v2) carry a `basis`; apps installed before them send one serving.
    const raw = await jsonBody(ctx);
    const input = raw && typeof raw === 'object' && 'basis' in raw ? parseBody(raw, FoodDraft) : parseBody(raw, LegacyCreateFoodRequest);
    const food = await foods.createFood(ctx.get('c'), a.user, input);
    await foodsChanged(ctx.get('c'), a.user.id);
    return ctx.json(food, 201);
  })
  .put('/foods/:id', async (ctx) => {
    const a = currentAuth(ctx);
    const food = await foods.updateFood(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, FoodDraft));
    await foodsChanged(ctx.get('c'), a.user.id);
    return ctx.json(food);
  })
  .delete('/foods/:id', async (ctx) => {
    const a = currentAuth(ctx);
    await foods.deleteMyFood(ctx.get('c'), a.user, param(ctx, 'id'));
    await foodsChanged(ctx.get('c'), a.user.id);
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
    const recipe = await foods.createRecipe(ctx.get('c'), a.user, await body(ctx, RecipeRequest));
    await foodsChanged(ctx.get('c'), a.user.id);
    return ctx.json(recipe, 201);
  })
  .get('/recipes/:id', async (ctx) => {
    const a = currentAuth(ctx);
    return ctx.json(await foods.getRecipe(ctx.get('c'), a.user, param(ctx, 'id')));
  })
  .put('/recipes/:id', async (ctx) => {
    const a = currentAuth(ctx);
    const recipe = await foods.updateRecipe(ctx.get('c'), a.user, param(ctx, 'id'), await body(ctx, RecipeRequest));
    await foodsChanged(ctx.get('c'), a.user.id);
    return ctx.json(recipe);
  })
  .delete('/recipes/:id', async (ctx) => {
    const a = currentAuth(ctx);
    await foods.deleteRecipe(ctx.get('c'), a.user, param(ctx, 'id'));
    await foodsChanged(ctx.get('c'), a.user.id);
    return ctx.json({ ok: true });
  });
