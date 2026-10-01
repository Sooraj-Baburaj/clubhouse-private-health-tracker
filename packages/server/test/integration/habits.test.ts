import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { deliverNotifications } from '../../src/application/jobs/deliver';
import { createHarness, uuid, type Client, type Harness } from './harness';

// Harness clock: Wed 2026-09-30 12:00 in Asia/Kolkata.
const TODAY = '2026-09-30';
const YESTERDAY = '2026-09-29';

let h: Harness;
let admin: Client;
let member: Client;
let other: Client;
let memberId: string;

const habit = (x: Record<string, unknown> = {}) => ({
  name: 'Night skin care',
  icon: '🌙',
  hue: 290,
  group: 'Evening',
  kind: 'check',
  target: 1,
  unit: '',
  schedule: { type: 'daily', days: [], perWeek: 3 },
  assign: 'all',
  memberIds: [],
  required: true,
  reminderTime: null,
  note: 'Double cleanse, then moisturiser.',
  startsOn: '2026-09-28',
  endsOn: null,
  ...x,
});

const tick = (cl: Client, habitId: string, value: number, at: string, date = TODAY, id = uuid()) => cl.req('PUT', `/habits/checkins/${id}`, { habitId, date, value, clientUpdatedAt: at });

beforeAll(async () => {
  h = await createHarness();
  const a = await h.createUser({ role: 'admin' });
  const m = await h.createUser();
  const o = await h.createUser();
  memberId = m.id;
  admin = await h.login(a.username, a.password);
  member = await h.login(m.username, m.password);
  other = await h.login(o.username, o.password);
});
afterAll(() => h.close());

describe('admin catalogue', () => {
  it('creates, validates and lists habits with KPIs', async () => {
    const bad = await admin.req('POST', '/admin/habits', habit({ schedule: { type: 'days', days: [], perWeek: 3 } }));
    expect(bad.status).toBe(400);
    const created = await admin.req('POST', '/admin/habits', habit());
    expect(created.status).toBe(200);
    expect(created.json).toMatchObject({ name: 'Night skin care', assign: 'all', enabled: true, hasCheckins: false });
    const list = await admin.req('GET', '/admin/habits');
    expect(list.json.kpis).toMatchObject({ active: 1, required: 1, off: 0 });
  });

  it('adds a template once and normalises kind units', async () => {
    const r = await admin.req('POST', '/admin/habits/templates/water');
    expect(r.json).toMatchObject({ name: 'Drink water', kind: 'count', target: 8, unit: 'glasses', required: false });
    const again = await admin.req('POST', '/admin/habits/templates/water');
    expect(again.status).toBe(400);
  });

  it('keeps members out', async () => {
    expect((await member.req('GET', '/admin/habits')).status).toBe(403);
  });
});

describe('member checklist', () => {
  it('shows assigned habits only', async () => {
    const picked = await admin.req('POST', '/admin/habits', habit({ name: 'Read', icon: '📖', kind: 'duration', target: 20, unit: 'min', assign: 'some', memberIds: [memberId], required: false }));
    expect(picked.json.memberIds).toEqual([memberId]);
    const mine = await member.req('GET', '/habits');
    const theirs = await other.req('GET', '/habits');
    expect(mine.json.items.map((i: { name: string }) => i.name).sort()).toEqual(['Drink water', 'Night skin care', 'Read']);
    expect(theirs.json.items.map((i: { name: string }) => i.name)).not.toContain('Read');
    expect(mine.json).toMatchObject({ date: TODAY, editable: true, done: 0, total: 3 });
  });

  it('ticks with last-write-wins and one row per day', async () => {
    const day = await member.req('GET', '/habits');
    const skin = day.json.items.find((i: { name: string }) => i.name === 'Night skin care');
    const id = uuid();
    expect((await tick(member, skin.id, 1, '2026-09-30T06:00:00.000Z', TODAY, id)).json.status).toBe('applied');
    expect((await tick(member, skin.id, 0, '2026-09-30T05:00:00.000Z', TODAY, id)).json.status).toBe('stale');
    // A different client id for the same habit and day updates the same row.
    const other = await tick(member, skin.id, 1, '2026-09-30T06:10:00.000Z');
    expect(other.json.entity.id).toBe(id);
    const after = await member.req('GET', '/habits');
    expect(after.json.items.find((i: { id: string }) => i.id === skin.id)).toMatchObject({ done: true, value: 1, checkinId: id });
    expect(after.json.done).toBe(1);
  });

  it('marks yesterday as added later and refuses older days', async () => {
    const day = await member.req('GET', `/habits?date=${YESTERDAY}`);
    expect(day.json.editable).toBe(true);
    const skin = day.json.items.find((i: { name: string }) => i.name === 'Night skin care');
    const r = await tick(member, skin.id, 1, '2026-09-30T06:20:00.000Z', YESTERDAY);
    expect(r.json.entity.addedLate).toBe(true);
    expect((await tick(member, skin.id, 1, '2026-09-30T06:20:00.000Z', '2026-09-20')).status).toBe(400);
    expect((await tick(member, skin.id, 1, '2026-09-30T06:20:00.000Z', '2026-10-01')).status).toBe(400);
  });

  it('counts the habits streak from required habits only', async () => {
    const day = await member.req('GET', '/habits');
    // Yesterday and today done (habit started Monday; Monday was missed, which spends grace or pauses).
    expect(day.json.streak.current).toBeGreaterThanOrEqual(2);
  });

  it('clamps values by kind and completes counts at the target', async () => {
    const day = await member.req('GET', '/habits');
    const water = day.json.items.find((i: { name: string }) => i.name === 'Drink water');
    const r = await tick(member, water.id, 8, '2026-09-30T06:30:00.000Z');
    expect(r.json.entity).toMatchObject({ value: 8, done: true });
  });

  it('syncs offline ticks and replays them idempotently', async () => {
    const day = await member.req('GET', '/habits');
    const read = day.json.items.find((i: { name: string }) => i.name === 'Read');
    const ops = [{ kind: 'habit_checkin', id: uuid(), data: { habitId: read.id, date: TODAY, value: 20, clientUpdatedAt: '2026-09-30T06:35:00.000Z' } }];
    const a = await member.req('POST', '/sync', { ops });
    const b = await member.req('POST', '/sync', { ops });
    expect(a.json.results[0].status).toBe('applied');
    expect(b.json.results[0].status).toBe('stale');
    expect((await member.req('GET', '/habits')).json.done).toBe(3);
  });

  it('hides optional habits only and returns detail', async () => {
    const day = await member.req('GET', '/habits');
    const skin = day.json.items.find((i: { name: string }) => i.name === 'Night skin care');
    const water = day.json.items.find((i: { name: string }) => i.name === 'Drink water');
    expect((await member.req('PATCH', `/habits/${skin.id}/prefs`, { hidden: true })).status).toBe(400);
    expect((await member.req('PATCH', `/habits/${water.id}/prefs`, { hidden: true })).status).toBe(200);
    const after = await member.req('GET', '/habits');
    expect(after.json.hidden.map((x: { name: string }) => x.name)).toEqual(['Drink water']);
    expect(after.json.items.some((i: { id: string }) => i.id === water.id)).toBe(false);
    await member.req('PATCH', `/habits/${water.id}/prefs`, { hidden: false });

    const detail = await member.req('GET', `/habits/${skin.id}`);
    expect(detail.json.cells).toHaveLength(35);
    expect(detail.json.cells.find((c: { date: string }) => c.date === TODAY).state).toBe('done');
    expect(detail.json.habit.note).toBe('Double cleanse, then moisturiser.');
  });

  it('summarises the week', async () => {
    const w = await member.req('GET', '/habits/week');
    expect(w.json.days).toHaveLength(7);
    expect(w.json.days.at(-1)).toMatchObject({ date: TODAY, done: 3, total: 3 });
  });
});

describe('admin adherence and lifecycle', () => {
  it('shows adherence without check-in detail and archives instead of deleting', async () => {
    const adh = await admin.req('GET', '/admin/habits/adherence');
    expect(adh.json.habits.length).toBe(3);
    const row = adh.json.rows.find((r: { person: { id: string } }) => r.person.id === memberId);
    expect(row.cells).toHaveLength(3);
    const list = await admin.req('GET', '/admin/habits');
    const skin = list.json.habits.find((x: { name: string }) => x.name === 'Night skin care');
    expect(skin.hasCheckins).toBe(true);
    const off = await admin.req('POST', `/admin/habits/${skin.id}/enabled`, { enabled: false });
    expect(off.json.enabled).toBe(false);
    expect((await member.req('GET', '/habits')).json.items.some((i: { id: string }) => i.id === skin.id)).toBe(false);
    expect((await admin.req('POST', `/admin/habits/${skin.id}/archive`)).status).toBe(200);
    expect((await admin.req('GET', '/admin/habits')).json.habits.some((x: { id: string }) => x.id === skin.id)).toBe(false);
    const audit = await h.c.db.query.auditLogs.findMany({ where: and(eq(s.auditLogs.teamId, h.teamId), eq(s.auditLogs.targetType, 'habit')) });
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['habit.create', 'habit.toggle', 'habit.archive']));
  });
});

describe('habit reminders', () => {
  it('bundles the open habits due at a time and skips done ones', async () => {
    const a = await admin.req('POST', '/admin/habits', habit({ name: 'Floss', icon: '🦷', reminderTime: '21:00', required: false }));
    await admin.req('POST', '/admin/habits', habit({ name: 'Journal', icon: '✍️', reminderTime: '21:00', required: false }));
    const sched = await h.c.db.query.notificationSchedules.findFirst({ where: and(eq(s.notificationSchedules.userId, memberId), eq(s.notificationSchedules.type, 'habit_reminder')) });
    expect(sched?.nextSendAt?.toISOString()).toBe('2026-09-30T15:30:00.000Z');
    await tick(member, a.json.id, 1, '2026-09-30T06:40:00.000Z');
    h.clock.set(new Date('2026-09-30T15:30:30.000Z'));
    await deliverNotifications(h.c, { source: 'test', deadline: Date.now() + 20_000 });
    const sent = await h.c.db.query.notifications.findMany({ where: and(eq(s.notifications.userId, memberId), eq(s.notifications.type, 'habit_reminder')) });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.title).toBe('✍️ Journal');
    expect(sent[0]!.data.habitIds).toHaveLength(1);
  });
});
