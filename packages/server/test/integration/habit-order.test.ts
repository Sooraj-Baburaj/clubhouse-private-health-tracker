import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './harness';

let h: Harness;
let admin: Client;
let member: Client;
let other: Client;
let memberId: string;
const ids: Record<string, string> = {};

const habit = (name: string, group = 'Morning') => ({
  name,
  icon: '✨',
  hue: 290,
  group,
  kind: 'check',
  target: 1,
  unit: '',
  schedule: { type: 'daily', days: [], perWeek: 3 },
  assign: 'all',
  memberIds: [],
  required: false,
  reminderTime: null,
  note: null,
  startsOn: '2026-09-28',
  endsOn: null,
});

const names = (r: { json: { items: { name: string }[] } }) => r.json.items.map((i) => i.name);

beforeAll(async () => {
  h = await createHarness();
  const a = await h.createUser({ role: 'admin' });
  const m = await h.createUser();
  const o = await h.createUser();
  memberId = m.id;
  admin = await h.login(a.username, a.password);
  member = await h.login(m.username, m.password);
  other = await h.login(o.username, o.password);
  for (const [n, g] of [['A', 'Evening'], ['B', 'Morning'], ['C', 'Home']] as const) ids[n] = (await admin.req('POST', '/admin/habits', habit(n, g))).json.id;
});
afterAll(() => h.close());

describe('habit order', () => {
  it('follows the team order (not the group) and appends new habits', async () => {
    expect(names(await member.req('GET', '/habits'))).toEqual(['A', 'B', 'C']);
  });

  it('lets the admin rearrange and rejects a partial list', async () => {
    expect((await admin.req('PUT', '/admin/habits/order', { ids: [ids.C, ids.A] })).status).toBe(400);
    const r = await admin.req('PUT', '/admin/habits/order', { ids: [ids.C, ids.A, ids.B] });
    expect(r.json.habits.map((x: { name: string }) => x.name)).toEqual(['C', 'A', 'B']);
    expect(names(await member.req('GET', '/habits'))).toEqual(['C', 'A', 'B']);
  });

  it('keeps a member’s own order until synced, and shows it to the admin', async () => {
    const saved = await member.req('PUT', '/habits/order', { ids: [ids.B, ids.C] });
    expect(saved.json.customOrder).toBe(true);
    const day = await member.req('GET', '/habits');
    // Unplaced habits follow in team order after the arranged ones.
    expect(names(day)).toEqual(['B', 'C', 'A']);
    expect(day.json).toMatchObject({ customOrder: true });
    expect(day.json.arrangement.map((x: { name: string }) => x.name)).toEqual(['B', 'C', 'A']);
    // Other members still follow the team.
    expect(names(await other.req('GET', '/habits'))).toEqual(['C', 'A', 'B']);

    await admin.req('PUT', '/admin/habits/order', { ids: [ids.A, ids.B, ids.C] });
    expect(names(await member.req('GET', '/habits'))).toEqual(['B', 'C', 'A']);
    const list = await admin.req('GET', '/admin/habits');
    expect(list.json.customOrders).toHaveLength(1);
    expect(list.json.customOrders[0]).toMatchObject({ person: { id: memberId }, matchesTeam: false });
    expect(list.json.customOrders[0].order.map((x: { name: string }) => x.name)).toEqual(['B', 'C', 'A']);

    const sync = await admin.req('POST', '/admin/habits/order/sync', { userIds: [memberId] });
    expect(sync.json.synced).toBe(1);
    expect(names(await member.req('GET', '/habits'))).toEqual(['A', 'B', 'C']);
    expect((await admin.req('GET', '/admin/habits')).json.customOrders).toEqual([]);
  });

  it('treats an arrangement equal to the team order as following the team', async () => {
    const r = await member.req('PUT', '/habits/order', { ids: [ids.A, ids.B, ids.C] });
    expect(r.json.customOrder).toBe(false);
    await member.req('PUT', '/habits/order', { ids: [ids.C, ids.B, ids.A] });
    expect((await member.req('PUT', '/habits/order', { ids: null })).json.customOrder).toBe(false);
    expect(names(await member.req('GET', '/habits'))).toEqual(['A', 'B', 'C']);
  });

  it('auto-syncs members whose order the admin catches up with', async () => {
    await member.req('PUT', '/habits/order', { ids: [ids.C, ids.B, ids.A] });
    const r = await admin.req('PUT', '/admin/habits/order', { ids: [ids.C, ids.B, ids.A] });
    expect(r.json.customOrders).toEqual([]);
    expect((await member.req('GET', '/habits')).json.customOrder).toBe(false);
  });

  it('puts new habits at the end and refuses unknown ids from members', async () => {
    await admin.req('POST', '/admin/habits', habit('D'));
    expect(names(await member.req('GET', '/habits'))).toEqual(['C', 'B', 'A', 'D']);
    expect((await member.req('PUT', '/habits/order', { ids: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(400);
  });
});
