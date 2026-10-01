import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { createHarness, uuid, type Client, type Harness } from './harness';

let h: Harness;
let cl: Client;
const date = '2026-09-30';
beforeAll(async () => {
  h = await createHarness();
  const u = await h.createUser();
  cl = await h.login(u.username, u.password);
});
afterAll(() => h.close());

async function food(q: string) {
  const r = await cl.req('GET', `/foods/search?q=${encodeURIComponent(q)}`);
  expect(r.status).toBe(200);
  return r.json;
}

describe('food search', () => {
  it('tolerates typos and answers quickly', async () => {
    const r = await food('paner');
    expect(r.results.some((f: { name: string }) => /paneer/i.test(f.name))).toBe(true);
    expect(r.tookMs).toBeLessThan(300);
  });
});

describe('logging and sync', () => {
  it('upserts idempotently with last-write-wins', async () => {
    const idli = (await food('idli')).results[0];
    const id = uuid();
    const body = (t: string, grams: number) => ({ date, mealSlot: 'breakfast', loggedAt: t, clientUpdatedAt: t, items: [{ foodId: idli.id, name: idli.name, grams, servings: 1, source: 'search' }] });
    const first = await cl.req('PUT', `/logs/food/${id}`, body('2026-09-30T03:00:00.000Z', 100));
    expect(first.json.status).toBe('applied');
    const replay = await cl.req('PUT', `/logs/food/${id}`, body('2026-09-30T03:00:00.000Z', 100));
    expect(replay.json.status).toBe('stale');
    const older = await cl.req('PUT', `/logs/food/${id}`, body('2026-09-30T02:00:00.000Z', 300));
    expect(older.json.status).toBe('stale');
    expect(older.json.entity.items[0].grams).toBe(100);
    const newer = await cl.req('PUT', `/logs/food/${id}`, body('2026-09-30T04:00:00.000Z', 150));
    expect(newer.json.status).toBe('applied');
    expect(newer.json.entity.items[0].grams).toBe(150);
  });

  it('replays an offline batch twice without duplicating rows', async () => {
    const ops = [0, 1].map((i) => ({
      kind: 'food_log',
      id: uuid(),
      data: { date, mealSlot: 'lunch', loggedAt: `2026-09-30T0${7 + i}:00:00.000Z`, clientUpdatedAt: `2026-09-30T0${7 + i}:00:00.000Z`, items: [{ foodId: null, name: `Thali ${i}`, grams: 400, servings: 1, source: 'quick_add', nutrition: { kcal: 500, protein: 20, carbs: 70, fat: 15, fibre: 6 } }] },
    }));
    const a = await cl.req('POST', '/sync', { ops });
    const b = await cl.req('POST', '/sync', { ops });
    expect(a.json.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied']);
    expect(b.json.results.map((r: { status: string }) => r.status)).toEqual(['stale', 'stale']);
    const day = await cl.req('GET', `/logs?date=${date}`);
    expect(day.json.foodLogs.filter((f: { items: { name: string }[] }) => f.items[0]!.name.startsWith('Thali')).length).toBe(2);
  });

  it('keeps the photo when an edit omits imageId and removes it on null', async () => {
    const me = (await cl.req('GET', '/me')).json;
    const [img] = await h.c.db.insert(s.images).values({ teamId: me.team.id, ownerId: me.user.id, kind: 'food', storageKey: 'test/photo.webp', contentType: 'image/webp', bytes: 10, width: 10, height: 10 }).returning();
    const id = uuid();
    const base = { date, mealSlot: 'dinner', items: [{ foodId: null, name: 'Plate', grams: 300, servings: 1, source: 'quick_add', nutrition: { kcal: 400, protein: 20, carbs: 40, fat: 15, fibre: 5 } }] };
    await cl.req('PUT', `/logs/food/${id}`, { ...base, loggedAt: '2026-09-30T05:00:00.000Z', clientUpdatedAt: '2026-09-30T05:00:00.000Z', imageId: img!.id });
    await cl.req('PUT', `/logs/food/${id}`, { ...base, loggedAt: '2026-09-30T05:00:00.000Z', clientUpdatedAt: '2026-09-30T05:05:00.000Z' });
    expect((await h.c.db.query.foodLogs.findFirst({ where: eq(s.foodLogs.id, id) }))!.imageId).toBe(img!.id);
    await cl.req('PUT', `/logs/food/${id}`, { ...base, loggedAt: '2026-09-30T05:00:00.000Z', clientUpdatedAt: '2026-09-30T05:10:00.000Z', imageId: null });
    expect((await h.c.db.query.foodLogs.findFirst({ where: eq(s.foodLogs.id, id) }))!.imageId).toBeNull();
  });

  it('rejects future dates', async () => {
    const r = await cl.req('PUT', `/logs/weight/${uuid()}`, { date: '2026-10-05', weightKg: 70, clientUpdatedAt: '2026-09-30T05:00:00.000Z' });
    expect(r.status).toBe(400);
  });

  it('computes Today from the logic engine', async () => {
    const walk = (await cl.req('GET', '/activity-types')).json.find((t: { key: string }) => t.key === 'walking');
    const act = await cl.req('PUT', `/logs/activity/${uuid()}`, { date, loggedAt: '2026-09-30T05:00:00.000Z', clientUpdatedAt: '2026-09-30T05:00:00.000Z', typeId: walk.id, durationMin: 30, distanceKm: 3 });
    expect(act.status).toBe(200);
    const t = await cl.req('GET', `/today?date=${date}`);
    expect(t.status).toBe(200);
    const eaten = t.json.foodLogs.reduce((a: number, f: { totals: { kcal: number } }) => a + f.totals.kcal, 0);
    expect(Math.abs(t.json.eaten.kcal - eaten)).toBeLessThan(1);
    // Eat-back is off by default: the budget is the target and burn is reported separately.
    expect(t.json.budgetKcal).toBe(t.json.targets.kcal);
    expect(t.json.remainingKcal).toBe(Math.round(t.json.budgetKcal - t.json.eaten.kcal));
    expect(t.json.burned).toBe(act.json.entity.kcalBurned);
    expect(t.json.streak.current).toBeGreaterThanOrEqual(1);
    for (const b of Object.values(t.json.bands) as { label: string; icon: string }[]) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.icon).toBeTruthy();
    }
  });
});
