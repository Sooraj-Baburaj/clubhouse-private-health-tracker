import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { createHarness, uuid, type Client, type Harness } from './harness';

/* Dishes made of ingredients, photo-only meals ("finish later"), foods with portions and saved recipes. */

let h: Harness;
let cl: Client;
let other: Client;
let meId: string;
const date = '2026-09-30';
const at = '2026-09-30T05:00:00.000Z';

beforeAll(async () => {
  h = await createHarness();
  const u = await h.createUser();
  const o = await h.createUser();
  meId = u.id;
  cl = await h.login(u.username, u.password);
  other = await h.login(o.username, o.password);
});
afterAll(() => h.close());

async function food(q: string) {
  const r = await cl.req('GET', `/foods/search?q=${encodeURIComponent(q)}`);
  return r.json.results[0] as { id: string; name: string; per100g: { kcal: number }; tags: string[] };
}

async function photo(ownerId: string, clientId: string | null = null) {
  const me = (await cl.req('GET', '/me')).json;
  const [img] = await h.c.db.insert(s.images).values({ teamId: me.team.id, ownerId, clientId, kind: 'food', storageKey: `test/${uuid()}.webp`, contentType: 'image/webp', bytes: 10, width: 10, height: 10 }).returning();
  return img!;
}

describe('dishes', () => {
  it('logs a dish as one item: ingredients × eaten ÷ batch, with the ingredients kept and their tags', async () => {
    const banana = await food('banana');
    const apple = await food('apple');
    const components = [
      { foodId: banana.id, name: banana.name, grams: 120, servings: 1, servingLabel: '1 piece' },
      { foodId: apple.id, name: apple.name, grams: 150, servings: 1, servingLabel: '1 medium' },
      { foodId: null, name: 'Honey', grams: 7, servings: 1, servingLabel: '1 tsp', nutrition: { kcal: 21, protein: 0, carbs: 5.7, fat: 0, fibre: 0 } },
    ];
    const r = await cl.req('PUT', `/logs/food/${uuid()}`, { date, mealSlot: 'morning_snack', loggedAt: at, clientUpdatedAt: at, items: [{ foodId: null, name: 'Fruit salad', grams: 0, servings: 1, source: 'manual', components, batchServings: 2 }] });
    expect(r.status).toBe(200);
    const item = r.json.entity.items[0];
    const whole = (banana.per100g.kcal * 120) / 100 + (apple.per100g.kcal * 150) / 100 + 21;
    expect(item.nutrition.kcal).toBeCloseTo(whole / 2, 0);
    expect(item.grams).toBeCloseTo((120 + 150 + 7) / 2, 0);
    expect(item.components).toHaveLength(3);
    expect(item.batchServings).toBe(2);
    expect(item.tags).toEqual(expect.arrayContaining(banana.tags));
  });

  it('rejects an ingredient from someone else’s private foods', async () => {
    const mine = await other.req('POST', '/foods', { name: 'Secret chikki', basis: { unit: 'piece', amount: 1, grams: 20 }, nutrients: { kcal: 100, protein: 3, carbs: 12, fat: 5, fibre: 1 }, portions: [] });
    const r = await cl.req('PUT', `/logs/food/${uuid()}`, { date, mealSlot: 'lunch', loggedAt: at, clientUpdatedAt: at, items: [{ foodId: null, name: 'Mix', grams: 0, servings: 1, source: 'manual', components: [{ foodId: mine.json.id, name: 'Secret chikki', grams: 20, servings: 1 }] }] });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('unknown_food');
  });
});

describe('photo-only meals', () => {
  it('saves a snapped meal with its photo only; it counts for the logging streak but not the in-range one', async () => {
    const img = await photo(meId);
    const id = uuid();
    const r = await cl.req('PUT', `/logs/food/${id}`, { date: '2026-09-29', mealSlot: 'dinner', loggedAt: '2026-09-29T14:00:00.000Z', clientUpdatedAt: at, items: [], imageId: img.id, pendingDetails: true });
    expect(r.status).toBe(200);
    expect(r.json.entity.pendingDetails).toBe(true);
    const fact = await h.c.db.query.dayFacts.findFirst({ where: and(eq(s.dayFacts.userId, meId), eq(s.dayFacts.date, '2026-09-29')) });
    expect(fact).toMatchObject({ logged: true, inRange: false, snapOnly: 1, mealsOnTime: 0, points: 5 });
    // Finishing it later clears the flag.
    const done = await cl.req('PUT', `/logs/food/${id}`, { date: '2026-09-29', mealSlot: 'dinner', loggedAt: '2026-09-29T14:00:00.000Z', clientUpdatedAt: '2026-09-30T05:01:00.000Z', items: [{ foodId: null, name: 'Thali', grams: 400, servings: 1, source: 'quick_add', nutrition: { kcal: 600, protein: 22, carbs: 80, fat: 18, fibre: 8 } }] });
    expect(done.json.entity.pendingDetails).toBe(false);
    expect(done.json.entity.imageId).toBe(img.id);
  });

  it('needs the photo, and the photo must be yours', async () => {
    const none = await cl.req('PUT', `/logs/food/${uuid()}`, { date, mealSlot: 'lunch', loggedAt: at, clientUpdatedAt: at, items: [], pendingDetails: true });
    expect(none.status).toBe(400);
    expect(none.json.code).toBe('empty_log');
    const otherMe = (await other.req('GET', '/me')).json;
    const theirs = await photo(otherMe.user.id);
    const stolen = await cl.req('PUT', `/logs/food/${uuid()}`, { date, mealSlot: 'lunch', loggedAt: at, clientUpdatedAt: at, items: [], pendingDetails: true, imageId: theirs.id });
    expect(stolen.status).toBe(400);
    expect(stolen.json.code).toBe('bad_image');
  });

  it('finds a photo queued offline by the client id it was uploaded with', async () => {
    const clientId = uuid();
    const img = await photo(meId, clientId);
    const r = await cl.req('PUT', `/logs/food/${uuid()}`, { date, mealSlot: 'evening_snack', loggedAt: at, clientUpdatedAt: at, items: [], pendingDetails: true, imageClientId: clientId });
    expect(r.status).toBe(200);
    expect(r.json.entity.imageId).toBe(img.id);
  });
});

describe('foods with portions', () => {
  it('creates a food from one portion and keeps nutrition per 100 g', async () => {
    const r = await cl.req('POST', '/foods', { name: 'Whey protein', brand: 'MuscleBlaze', basis: { unit: 'scoop', amount: 1, grams: 32 }, nutrients: { kcal: 120, protein: 24, carbs: 3, fat: 1.6, fibre: 0 }, portions: [{ unit: 'tbsp', amount: 1, grams: 8 }] });
    expect(r.status).toBe(201);
    expect(r.json.per100g.kcal).toBe(375);
    expect(r.json.servingOptions.map((o: { label: string }) => o.label)).toEqual(['1 scoop', '1 tbsp', '100 g']);
    expect(r.json.servingLabel).toBe('1 scoop');
    const edited = await cl.req('PUT', `/foods/${r.json.id}`, { name: 'Whey protein', basis: { unit: 'scoop', amount: 1, grams: 33 }, nutrients: { kcal: 124, protein: 25, carbs: 3, fat: 1.6, fibre: 0 }, portions: [] });
    expect(edited.status).toBe(200);
    expect(edited.json.servingOptions[0]).toMatchObject({ label: '1 scoop', grams: 33 });
    await h.c.db.update(s.foodItems).set({ verified: true }).where(eq(s.foodItems.id, r.json.id));
    const locked = await cl.req('PUT', `/foods/${r.json.id}`, { name: 'Whey', basis: { unit: 'scoop', amount: 1, grams: 30 }, nutrients: { kcal: 110, protein: 20, carbs: 3, fat: 1, fibre: 0 }, portions: [] });
    expect(locked.json.code).toBe('food_verified');
  });

  it('still accepts the one-serving shape from older apps', async () => {
    const r = await cl.req('POST', '/foods', { name: 'Old app chikki', servingLabel: '1 piece', servingGrams: 20, perServing: { kcal: 100, protein: 3, carbs: 12, fat: 5, fibre: 1 } });
    expect(r.status).toBe(201);
    expect(r.json.servingOptions.map((o: { label: string }) => o.label)).toEqual(['1 piece', '100 g']);
  });

  it('logs a food with no known weight by its unit, with exact per-unit nutrition', async () => {
    const r = await cl.req('POST', '/foods', { name: 'Amma’s laddoo', basis: { unit: 'piece', amount: 1, grams: null }, nutrients: { kcal: 180, protein: 3, carbs: 22, fat: 9, fibre: 1 }, portions: [] });
    expect(r.json.servingOptions).toEqual([{ label: '1 piece', grams: 100, unit: 'piece', amount: 1, estimated: true }]);
    expect(r.json.perServing.kcal).toBe(180);
  });
});

describe('recipes', () => {
  it('saves a dish as a recipe that is searchable, editable and removable', async () => {
    const banana = await food('banana');
    const body = { name: 'Banana shake', makes: 2, components: [{ foodId: banana.id, name: banana.name, grams: 240, servings: 2, servingLabel: '2 pieces' }, { foodId: null, name: 'Milk', grams: 400, servings: 1, servingLabel: '2 glasses', nutrition: { kcal: 250, protein: 13, carbs: 19, fat: 13, fibre: 0 } }] };
    const r = await cl.req('POST', '/recipes', body);
    expect(r.status).toBe(201);
    expect(r.json.makes).toBe(2);
    expect(r.json.components).toHaveLength(2);
    expect(r.json.foodId).toBeTruthy();
    const mine = (await cl.req('GET', '/foods/mine')).json;
    expect(mine.recipes.some((x: { id: string }) => x.id === r.json.id)).toBe(true);
    expect(mine.foods.some((f: { id: string }) => f.id === r.json.foodId)).toBe(false);
    const found = (await cl.req('GET', `/foods/search?q=${encodeURIComponent('Banana shake')}`)).json.results[0];
    expect(found.recipeId).toBe(r.json.id);
    const upd = await cl.req('PUT', `/recipes/${r.json.id}`, { ...body, makes: 4 });
    expect(Math.abs(upd.json.perServing.kcal - r.json.perServing.kcal / 2)).toBeLessThanOrEqual(1);
    expect((await other.req('GET', `/recipes/${r.json.id}`)).status).toBe(404);
    expect((await cl.req('DELETE', `/recipes/${r.json.id}`)).status).toBe(200);
    expect((await cl.req('GET', `/foods/${r.json.foodId}`)).status).toBe(404);
  });
});

describe('AI reading', () => {
  it('reads "2 rotis" as one roti twice, with near matches and the database numbers when it matches', async () => {
    const me = (await cl.req('GET', '/me')).json;
    await h.c.db
      .insert(s.aiSettings)
      .values({ teamId: me.team.id, globalOn: true, features: { 'food.text': { on: true, model: 'mock', dailyCap: 50 } }, budget: { monthlyCapUsd: 50, alertAtPercent: 80, atCapBehaviour: 'disable' } })
      .onConflictDoUpdate({ target: s.aiSettings.teamId, set: { globalOn: true, features: { 'food.text': { on: true, model: 'mock', dailyCap: 50 } } } });
    const r = await cl.req('POST', '/ai/food-text', { text: '2 rotis and dal', slot: 'lunch' });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    const roti = r.json.items.find((i: { name: string }) => /roti/i.test(i.name));
    expect(roti).toBeTruthy();
    // One unit and a count, so the member changes how many, not the label.
    expect(roti.quantity).toBe(2);
    expect(roti.servingLabel).toMatch(/^1 /);
    expect(roti.servingOptions[0].label).toBe(roti.servingLabel);
    expect(Math.round(roti.servingOptions[0].grams * 2)).toBe(roti.grams);
    for (const i of r.json.items) {
      expect(['global', 'team', 'mine', null]).toContain(i.scope);
      expect(Array.isArray(i.alternatives)).toBe(true);
    }
  });
});
