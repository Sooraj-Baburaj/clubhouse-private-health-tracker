import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { createHarness, uuid, type Client, type Harness } from './harness';

/*
 * Consistency (SYS-CALC-33 v2) and plan counting: one session per activity a day, sessions on any day of the week,
 * the weekly and monthly scores, and the comparison on a teammate's profile.
 * The clock is Wednesday 30 Sep 2026, 12:00 IST (week of Mon 28 Sep).
 */

let h: Harness;
const people: { id: string; cl: Client }[] = [];
const MON = '2026-09-28';
const TUE = '2026-09-29';
let walkId = '';
let itemId = '';

const walk = (cl: Client, date: string, at: string) => cl.req('PUT', `/logs/activity/${uuid()}`, { date, loggedAt: at, clientUpdatedAt: at, typeId: walkId, durationMin: 30 });
const meal = (cl: Client, date: string) => {
  const at = `${date}T05:00:00.000Z`;
  return cl.req('PUT', `/logs/food/${uuid()}`, { date, mealSlot: 'lunch', loggedAt: at, clientUpdatedAt: at, items: [{ foodId: null, name: 'plate', grams: 300, servings: 1, source: 'quick_add', nutrition: { kcal: 500, protein: 20, carbs: 60, fat: 15, fibre: 4 } }] });
};

beforeAll(async () => {
  h = await createHarness();
  for (let i = 0; i < 2; i++) {
    const u = await h.createUser();
    people.push({ id: u.id, cl: await h.login(u.username, u.password) });
  }
  await h.c.db.update(s.users).set({ createdAt: new Date('2026-09-01T00:00:00Z') }).where(inArray(s.users.id, people.map((p) => p.id)));
  walkId = ((await people[0]!.cl.req('GET', '/activity-types')).json as { id: string; key: string }[]).find((t) => t.key === 'walking')!.id;
  // Member 0: walk 3× a week, planned Mon / Wed / Fri.
  const [plan] = await h.c.db.insert(s.activityPlans).values({ userId: people[0]!.id }).returning();
  const [item] = await h.c.db.insert(s.activityPlanItems).values({ planId: plan!.id, typeId: walkId, perWeek: 3, createdAt: new Date('2026-09-01T00:00:00Z') }).returning();
  itemId = item!.id;
  await h.c.db.insert(s.activityPlanDays).values([0, 2, 4].map((weekday) => ({ itemId, weekday, time: '07:00' })));
});
afterAll(() => h.close());

describe('plan counting and consistency', () => {
  it('counts one planned session per activity a day, on any day of the week', async () => {
    const cl = people[0]!.cl;
    await walk(cl, MON, `${MON}T01:00:00.000Z`);
    await walk(cl, MON, `${MON}T12:00:00.000Z`); // a second walk the same day
    await walk(cl, TUE, `${TUE}T01:00:00.000Z`); // Tuesday: not a planned day
    const plan = (await cl.req('GET', '/activity-plan')).json;
    expect(plan.items.find((i: { itemId: string }) => i.itemId === itemId).done).toBe(2);
    // The Progress bars agree: two sessions, but all three walks' minutes.
    const week = (await cl.req('GET', '/progress/activity')).json.weeks.at(-1);
    expect(week).toMatchObject({ weekStart: MON, sessions: 2, minutes: 90 });
  });

  it('scores the week without holding sessions still to come against you', async () => {
    const cl = people[0]!.cl;
    await meal(cl, MON);
    await meal(cl, TUE);
    const r = (await cl.req('GET', '/progress/consistency')).json;
    expect(r.week).toMatchObject({ period: 'week', start: MON, end: '2026-10-04' });
    // Two sessions done, the third can still land any day from today to Sunday.
    expect(r.week.parts.activity).toMatchObject({ done: 2, due: 2, pct: 100 });
    // Monday and Tuesday logged; today isn't held against them before they log.
    expect(r.week.parts.logging).toMatchObject({ done: 2, due: 2 });
    expect(r.week.parts.habits).toBeNull();
    expect(r.week.score).toBeGreaterThan(0);
    expect(r.month).toMatchObject({ period: 'month', start: '2026-09-01', end: '2026-09-30' });
    expect(r.weeks).toHaveLength(12);
    expect(r.months).toHaveLength(6);
    expect(r.weeks.every((p: object) => !('viewer' in p))).toBe(true);
    // Before they joined: not scored.
    expect(r.months[0].score).toBeNull();
  });

  it('shows a teammate’s consistency with yours alongside, and only yours on your own profile', async () => {
    const [a, b] = people;
    await meal(b!.cl, MON);
    const theirs = (await b!.cl.req('GET', `/team/members/${a!.id}/profile`)).json;
    expect(theirs.consistency.week.score).toBe((await a!.cl.req('GET', '/progress/consistency')).json.week.score);
    const last = theirs.consistency.weeks.at(-1);
    expect(last.score).toBe(theirs.consistency.week.score);
    expect(typeof last.viewer).toBe('number');
    expect(theirs.consistency.months.at(-1)).toHaveProperty('viewer');
    const own = (await a!.cl.req('GET', `/team/members/${a!.id}/profile`)).json;
    expect(own.consistency.weeks.every((p: object) => !('viewer' in p))).toBe(true);
  });

  it('misses a session only once the week can no longer fit it', async () => {
    // Sunday evening with two of three done: today can still fit the third.
    h.clock.set(new Date('2026-10-04T14:00:00.000Z'));
    const r = (await people[0]!.cl.req('GET', '/progress/consistency')).json;
    expect(r.week.parts.activity).toMatchObject({ done: 2, due: 2 });
    // Monday: last week is over and the third session is missed (with Sunday's unlogged day, the score drops).
    h.clock.set(new Date('2026-10-05T06:30:00.000Z'));
    const next = (await people[0]!.cl.req('GET', '/progress/consistency')).json;
    expect(next.weeks.at(-2)).toMatchObject({ start: MON });
    const lastWeek = (await people[0]!.cl.req('GET', `/team/members/${people[0]!.id}/profile`)).json.consistency.weeks.at(-2);
    expect(lastWeek.score).toBeLessThan(r.week.score);
  });
});
