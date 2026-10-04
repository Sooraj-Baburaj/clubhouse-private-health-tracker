import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { teamMorning } from '../../src/application/board';
import { runJobStep } from '../../src/application/jobs';
import { createHarness, uuid, type Client, type Harness } from './harness';

/*
 * Crew leaderboard: points from on-time logs, hidden members, the privacy of the payload, and the Monday close.
 * The clock starts Wednesday 30 Sep 2026, 12:00 IST (week of Mon 28 Sep).
 */

let h: Harness;
const people: { id: string; cl: Client }[] = [];
const MON = '2026-09-28';

const quick = (date: string, slot: string, kcal: number, protein: number, at: string) => ({
  date,
  mealSlot: slot,
  loggedAt: at,
  clientUpdatedAt: at,
  items: [{ foodId: null, name: `${slot} plate`, grams: 300, servings: 1, source: 'quick_add', nutrition: { kcal, protein, carbs: kcal / 8, fat: kcal / 30, fibre: 4 } }],
});

beforeAll(async () => {
  h = await createHarness();
  for (let i = 0; i < 4; i++) {
    const u = await h.createUser();
    people.push({ id: u.id, cl: await h.login(u.username, u.password) });
  }
  // Members joined well before this week (createdAt is the database's real now otherwise).
  await h.c.db.update(s.users).set({ createdAt: new Date('2026-09-01T00:00:00Z') }).where(inArray(s.users.id, people.map((p) => p.id)));
  const target = async (cl: Client) => (await cl.req('GET', '/me')).json.targets as { kcal: number; protein: number };
  // Member 0: three meals on track Monday and Tuesday; member 1: one meal a day; member 2: Monday only; member 3 logs nothing.
  for (const [i, days] of [
    [0, [MON, '2026-09-29']],
    [1, [MON, '2026-09-29', '2026-09-30']],
    [2, [MON]],
  ] as const) {
    const t = await target(people[i]!.cl);
    for (const date of days) {
      const slots = i === 1 ? ['lunch'] : ['breakfast', 'lunch', 'dinner'];
      for (const slot of slots) {
        const r = await people[i]!.cl.req('PUT', `/logs/food/${uuid()}`, quick(date, slot, Math.round(t.kcal / 3), Math.round(t.protein / 3), `${date}T05:00:00.000Z`));
        expect(r.status).toBe(200);
      }
    }
  }
});
afterAll(() => h.close());

const deepKeys = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => deepKeys(x, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      deepKeys(x, out);
    }
  return out;
};

describe('crew leaderboard', () => {
  it('ranks the week from on-time logs and never carries calories, grams, foods or weight', async () => {
    const r = await people[0]!.cl.req('GET', '/team/board');
    expect(r.status).toBe(200);
    const b = r.json;
    expect(b.enabled).toBe(true);
    expect(b.week.start).toBe(MON);
    const mine = b.rows.find((x: { isMe: boolean }) => x.isMe);
    // Two settled days of 3 meals with calories and protein on track: 2 × 70.
    expect(mine.points).toBe(140);
    expect(mine.rank).toBe(1);
    expect(b.me.rank).toBe(1);
    expect(b.me.gap?.kind).toBe('ahead');
    expect(b.rows.map((x: { points: number }) => x.points)).toEqual([...b.rows.map((x: { points: number }) => x.points)].sort((a, c) => c - a));
    const keys = deepKeys(b);
    for (const k of ['kcal', 'grams', 'weightKg', 'totals', 'items', 'eaten', 'nutrition']) expect(keys.has(k), k).toBe(false);
  });

  it('a log saved returns the points it earned and the live rank', async () => {
    const r = await people[3]!.cl.req('PUT', `/logs/food/${uuid()}`, quick('2026-09-30', 'breakfast', 300, 10, '2026-09-30T04:00:00.000Z'));
    // A meal (+10), and the onboarding weigh-in earlier that day (+10) lands with the day's first log.
    expect(r.json.effects.points).toMatchObject({ gained: 20, total: 20 });
    expect(r.json.effects.points.rank).toBeGreaterThan(0);
  });

  it('leaves a hidden member out of everyone else’s board but shows them their would-be rank', async () => {
    const hidden = people[2]!;
    await hidden.cl.req('PATCH', '/profile/preferences', { privacy: { showOnBoard: false } });
    const others = (await people[0]!.cl.req('GET', '/team/board')).json;
    expect(others.rows.some((x: { person: { id: string } }) => x.person.id === hidden.id)).toBe(false);
    expect(others.solid.some((x: { person: { id: string } }) => x.person.id === hidden.id)).toBe(false);
    const own = (await hidden.cl.req('GET', '/team/board')).json;
    expect(own.me.status).toBe('hidden');
    expect(own.me.rank).toBeNull();
    expect(own.me.wouldBeRank).toBeGreaterThan(0);
    expect((await people[0]!.cl.req('GET', `/team/members/${hidden.id}/points`)).status).toBe(404);
    await hidden.cl.req('PATCH', '/profile/preferences', { privacy: { showOnBoard: true } });
  });

  it('shows how points were earned on your own card only', async () => {
    const mine = (await people[0]!.cl.req('GET', `/team/members/${people[0]!.id}/points`)).json;
    expect(mine.days[0].items.map((i: { label: string }) => i.label)).toEqual(['3 meals', 'Calories on track', 'Protein on track']);
    const theirs = (await people[1]!.cl.req('GET', `/team/members/${people[0]!.id}/points`)).json;
    expect(theirs.days[0].items).toBeNull();
    expect(theirs.parts.meals).toBe(60);
  });

  it('closes the week on Monday morning: final ranks, awards, one chat post and a results notification each', async () => {
    h.clock.set(new Date('2026-10-05T00:30:00.000Z')); // Monday 06:00 IST: Sunday has settled for everyone
    expect((await runJobStep(h.c, 'rollover', 'test')).ok).toBe(true);
    expect((await runJobStep(h.c, 'team_rollover', 'test')).ok).toBe(true);
    const result = await h.c.db.query.boardWeekResults.findFirst({ where: and(eq(s.boardWeekResults.teamId, h.teamId), eq(s.boardWeekResults.weekStart, MON)) });
    expect(result?.rankedCount).toBe(4);
    expect(result?.awards.find((a) => a.key === 'winner')?.userId).toBe(people[0]!.id);
    const rows = await h.c.db.query.boardWeeks.findMany({ where: and(eq(s.boardWeeks.teamId, h.teamId), eq(s.boardWeeks.weekStart, MON)) });
    expect(rows.every((r) => r.final)).toBe(true);
    expect(rows.find((r) => r.userId === people[0]!.id)?.finalRank).toBe(1);
    const posts = await h.c.db.query.messages.findMany({ where: eq(s.messages.systemKind, 'board_results') });
    expect(posts.filter((m) => m.meta.weekStart === MON)).toHaveLength(1);
    const notes = await h.c.db.query.notifications.findMany({ where: and(inArray(s.notifications.userId, people.map((p) => p.id)), eq(s.notifications.type, 'board_results')) });
    expect(notes).toHaveLength(4);

    // Idempotent: another morning for the same day closes nothing and posts nothing.
    expect((await teamMorning(h.c, h.teamId, '2026-10-04')).closed).toBe(false);
    expect((await h.c.db.query.messages.findMany({ where: eq(s.messages.systemKind, 'board_results') })).filter((m) => m.meta.weekStart === MON)).toHaveLength(1);

    // The new week starts at 0 with last week's results attached.
    const b = (await people[1]!.cl.req('GET', '/team/board')).json;
    expect(b.week.start).toBe('2026-10-05');
    expect(b.rows.every((x: { points: number }) => x.points === 0)).toBe(true);
    expect(b.lastWeek.weekStart).toBe(MON);
    expect(b.lastWeek.podium[0].person.id).toBe(people[0]!.id);
  });

  it('a closed week never changes again', async () => {
    const before = await h.c.db.query.boardWeeks.findFirst({ where: and(eq(s.boardWeeks.weekStart, MON), eq(s.boardWeeks.userId, people[3]!.id)) });
    // A Sunday log saved on Monday (inside the 48-hour window) still counts for streaks, not the closed week.
    await people[3]!.cl.req('PUT', `/logs/food/${uuid()}`, quick('2026-10-04', 'dinner', 600, 30, '2026-10-04T14:00:00.000Z'));
    const after = await h.c.db.query.boardWeeks.findFirst({ where: and(eq(s.boardWeeks.weekStart, MON), eq(s.boardWeeks.userId, people[3]!.id)) });
    expect(after?.points).toBe(before?.points);
  });

  it('can be switched off by an admin', async () => {
    const admin = await h.createUser({ role: 'admin' });
    const acl = await h.login(admin.username, admin.password);
    const r = await acl.req('PATCH', '/admin/settings', { featureFlags: { leaderboard: false } });
    expect(r.status).toBe(200);
    const b = (await people[0]!.cl.req('GET', '/team/board')).json;
    expect(b.enabled).toBe(false);
    expect(b.rows).toEqual([]);
    await acl.req('PATCH', '/admin/settings', { featureFlags: { leaderboard: true } });
  });
});
