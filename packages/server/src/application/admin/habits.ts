import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { HABIT_TEMPLATES, type AdminHabitAdherence, type AdminHabitDto, type AdminHabitInput, type AdminHabitsResponse, type HabitGroup, type HabitKind } from '@clubhouse/contracts';
import { addDays, adherencePct, habitAdherence, isHabitComplete, isHabitShownOn, weekStartOf, type HabitValues } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { badRequest, notFound } from '../../lib/errors';
import { byListOrder, habitRule, loadValues, type HabitRow } from '../habits';
import { rescheduleUser } from '../scheduler';
import { getTeam } from '../team';
import { logAudit, personMap, personOf, teamClock, teamUsers, type Actor, type Tx } from './shared';

const EMPTY: HabitValues = new Map();

/** Kind decides target and unit: a tick is 1, a rating is 1–5, minutes are minutes. */
function normalize(input: AdminHabitInput): AdminHabitInput {
  const kind = input.kind;
  const schedule = {
    type: input.schedule.type,
    days: input.schedule.type === 'days' ? [...new Set(input.schedule.days)].sort((a, b) => a - b) : [],
    perWeek: input.schedule.perWeek,
  };
  return {
    ...input,
    name: input.name.trim(),
    note: input.note?.trim() || null,
    target: kind === 'check' ? 1 : kind === 'scale' ? 5 : input.target,
    unit: kind === 'check' ? '' : kind === 'scale' ? '1–5' : kind === 'duration' ? 'min' : input.unit.trim() || 'times',
    schedule,
    memberIds: input.assign === 'all' ? [] : [...new Set(input.memberIds)],
  };
}

async function teamHabits(c: Container, teamId: string): Promise<HabitRow[]> {
  const rows = await c.db.query.habits.findMany({ where: and(eq(s.habits.teamId, teamId), isNull(s.habits.archivedAt)), orderBy: [asc(s.habits.sortOrder), asc(s.habits.createdAt)] });
  return rows.sort(byListOrder);
}

async function getHabit(c: Container, teamId: string, id: string): Promise<HabitRow> {
  const h = await c.db.query.habits.findFirst({ where: and(eq(s.habits.id, id), eq(s.habits.teamId, teamId), isNull(s.habits.archivedAt)) });
  if (!h) throw notFound('Habit not found.');
  return h;
}

async function assignmentsOf(c: Container, habitIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!habitIds.length) return out;
  const rows = await c.db.query.habitAssignments.findMany({ where: inArray(s.habitAssignments.habitId, habitIds) });
  for (const r of rows) out.set(r.habitId, [...(out.get(r.habitId) ?? []), r.userId]);
  return out;
}

/** Who a habit is for, among the team's active members. */
function assignees(h: HabitRow, assigned: Map<string, string[]>, memberIds: string[]): string[] {
  if (h.assignAll) return memberIds;
  const picked = new Set(assigned.get(h.id) ?? []);
  return memberIds.filter((id) => picked.has(id));
}

function dto(h: HabitRow, memberIds: string[], hasCheckins: boolean, adherence14: number | null): AdminHabitDto {
  return {
    id: h.id,
    name: h.name,
    icon: h.icon,
    hue: h.hue,
    group: h.group as HabitGroup,
    kind: h.kind as HabitKind,
    target: h.target,
    unit: h.unit,
    schedule: h.schedule,
    assign: h.assignAll ? 'all' : 'some',
    memberIds,
    required: h.required,
    reminderTime: h.reminderTime,
    note: h.note,
    startsOn: h.startsOn,
    endsOn: h.endsOn,
    enabled: h.enabled,
    hasCheckins,
    adherence14,
    updatedAt: h.updatedAt.toISOString(),
  };
}

/** Catalogue with 14-day adherence per habit, plus the KPI row (active, team adherence, required kept today). */
export async function listHabits(c: Container, a: Actor): Promise<AdminHabitsResponse> {
  const team = await getTeam(c, a.user.teamId);
  const { today } = teamClock(c, team);
  const [habits, users] = await Promise.all([teamHabits(c, team.id), teamUsers(c, team.id, { activeOnly: true })]);
  const ids = habits.map((h) => h.id);
  const userIds = users.map((u) => u.id);
  const from = addDays(today, -14);
  const to = addDays(today, -1);
  const [assigned, { byUser }, counts] = await Promise.all([
    assignmentsOf(c, ids),
    loadValues(c, userIds, ids, weekStartOf(from), today),
    ids.length ? c.db.select({ habitId: s.habitCheckins.habitId, n: count() }).from(s.habitCheckins).where(inArray(s.habitCheckins.habitId, ids)).groupBy(s.habitCheckins.habitId) : Promise.resolve([]),
  ]);
  const withCheckins = new Set(counts.filter((r) => Number(r.n) > 0).map((r) => r.habitId));

  let teamKept = 0;
  let teamScheduled = 0;
  const rows = habits.map((h) => {
    const who = assignees(h, assigned, userIds);
    let kept = 0;
    let scheduled = 0;
    for (const uid of who) {
      const r = habitAdherence(habitRule(h), byUser.get(uid) ?? EMPTY, from, to);
      kept += r.kept;
      scheduled += r.scheduled;
    }
    if (h.enabled) {
      teamKept += kept;
      teamScheduled += scheduled;
    }
    return dto(h, h.assignAll ? [] : (assigned.get(h.id) ?? []), withCheckins.has(h.id), adherencePct({ kept, scheduled }));
  });

  // Required habits kept today, per member who has any due.
  const required = habits.filter((h) => h.enabled && h.required);
  let keptToday = 0;
  const pending: string[] = [];
  for (const u of users) {
    const values = byUser.get(u.id) ?? EMPTY;
    const due = required.filter((h) => assignees(h, assigned, [u.id]).length && isHabitShownOn(habitRule(h), values, today) && h.schedule.type !== 'weekly');
    if (!due.length) continue;
    if (due.every((h) => isHabitComplete(h.kind as HabitKind, values.get(h.id)?.get(today) ?? 0, h.target))) keptToday++;
    else pending.push(u.displayName.split(' ')[0] ?? u.displayName);
  }

  return {
    habits: rows,
    kpis: {
      active: habits.filter((h) => h.enabled).length,
      required: required.length,
      off: habits.filter((h) => !h.enabled).length,
      teamAdherence: adherencePct({ kept: teamKept, scheduled: teamScheduled }),
      requiredToday: { kept: keptToday, total: keptToday + pending.length, pending },
    },
  };
}

async function validateMembers(c: Container, teamId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await c.db.query.users.findMany({ where: and(inArray(s.users.id, ids), eq(s.users.teamId, teamId)), columns: { id: true } });
  if (rows.length !== ids.length) throw badRequest('One of the members wasn’t found.', 'bad_member', { memberIds: 'Unknown member' });
}

async function rescheduleTeam(c: Container, teamId: string) {
  const users = await teamUsers(c, teamId, { activeOnly: true });
  for (const u of users) await rescheduleUser(c, u.id, 'habit_reminder');
}

function rowValues(input: AdminHabitInput) {
  return {
    name: input.name,
    icon: input.icon,
    hue: input.hue,
    group: input.group,
    kind: input.kind,
    target: input.target,
    unit: input.unit,
    schedule: input.schedule,
    assignAll: input.assign === 'all',
    required: input.required,
    reminderTime: input.reminderTime,
    note: input.note,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
  };
}

async function writeAssignments(tx: Tx, habitId: string, input: AdminHabitInput) {
  await tx.delete(s.habitAssignments).where(eq(s.habitAssignments.habitId, habitId));
  if (input.assign === 'some' && input.memberIds.length) await tx.insert(s.habitAssignments).values(input.memberIds.map((userId) => ({ habitId, userId })));
}

async function one(c: Container, a: Actor, id: string): Promise<AdminHabitDto> {
  const r = await listHabits(c, a);
  const h = r.habits.find((x) => x.id === id);
  if (!h) throw notFound('Habit not found.');
  return h;
}

export async function createHabit(c: Container, a: Actor, raw: AdminHabitInput): Promise<AdminHabitDto> {
  const input = normalize(raw);
  await validateMembers(c, a.user.teamId, input.memberIds);
  const [{ n } = { n: 0 }] = await c.db.select({ n: count() }).from(s.habits).where(eq(s.habits.teamId, a.user.teamId));
  const id = await c.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.habits)
      .values({ ...rowValues(input), teamId: a.user.teamId, sortOrder: Number(n), createdBy: a.user.id, updatedBy: a.user.id })
      .returning({ id: s.habits.id });
    await writeAssignments(tx, row!.id, input);
    return row!.id;
  });
  await logAudit(c, a, { action: 'habit.create', targetType: 'habit', targetId: id, after: input });
  await rescheduleTeam(c, a.user.teamId);
  return one(c, a, id);
}

export async function updateHabit(c: Container, a: Actor, id: string, raw: AdminHabitInput): Promise<AdminHabitDto> {
  const before = await getHabit(c, a.user.teamId, id);
  const input = normalize(raw);
  await validateMembers(c, a.user.teamId, input.memberIds);
  const beforeMembers = (await assignmentsOf(c, [id])).get(id) ?? [];
  await c.db.transaction(async (tx) => {
    await tx.update(s.habits).set({ ...rowValues(input), updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.habits.id, id));
    await writeAssignments(tx, id, input);
  });
  const { id: _id, teamId: _team, createdAt: _c, updatedAt: _u, ...beforeFields } = before;
  await logAudit(c, a, { action: 'habit.update', targetType: 'habit', targetId: id, before: { ...beforeFields, memberIds: beforeMembers }, after: input });
  await rescheduleTeam(c, a.user.teamId);
  return one(c, a, id);
}

/** Switch a habit off for everyone (history stays) or back on. */
export async function setHabitEnabled(c: Container, a: Actor, id: string, enabled: boolean): Promise<AdminHabitDto> {
  const h = await getHabit(c, a.user.teamId, id);
  await c.db.update(s.habits).set({ enabled, updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.habits.id, id));
  await logAudit(c, a, { action: 'habit.toggle', targetType: 'habit', targetId: id, before: { enabled: h.enabled }, after: { enabled } });
  await rescheduleTeam(c, a.user.teamId);
  return one(c, a, id);
}

/** Archive keeps every check-in (habits are never deleted once members have ticked them). */
export async function archiveHabit(c: Container, a: Actor, id: string): Promise<void> {
  const h = await getHabit(c, a.user.teamId, id);
  await c.db.update(s.habits).set({ archivedAt: c.clock.now(), updatedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.habits.id, id));
  await logAudit(c, a, { action: 'habit.archive', targetType: 'habit', targetId: id, before: { name: h.name, enabled: h.enabled } });
  await rescheduleTeam(c, a.user.teamId);
}

/** Add a starter template for everyone, starting today. */
export async function addTemplate(c: Container, a: Actor, key: string): Promise<AdminHabitDto> {
  const t = HABIT_TEMPLATES.find((x) => x.key === key);
  if (!t) throw notFound('Template not found.');
  const existing = await teamHabits(c, a.user.teamId);
  if (existing.some((h) => h.name.toLowerCase() === t.input.name.toLowerCase())) throw badRequest(`“${t.input.name}” is already in the catalogue.`, 'habit_exists');
  const team = await getTeam(c, a.user.teamId);
  return createHabit(c, a, { ...t.input, assign: 'all', memberIds: [], startsOn: teamClock(c, team).today, endsOn: null });
}

/** Member × habit heatmap over the last 4 finished weeks of days: share of scheduled days kept (no check-in detail). */
export async function adherence(c: Container, a: Actor): Promise<AdminHabitAdherence> {
  const team = await getTeam(c, a.user.teamId);
  const { today } = teamClock(c, team);
  const from = addDays(today, -28);
  const to = addDays(today, -1);
  const [habits, users] = await Promise.all([teamHabits(c, team.id), teamUsers(c, team.id, { activeOnly: true })]);
  const on = habits.filter((h) => h.enabled);
  const userIds = users.map((u) => u.id);
  const [assigned, { byUser }, people] = await Promise.all([assignmentsOf(c, on.map((h) => h.id)), loadValues(c, userIds, on.map((h) => h.id), weekStartOf(from), to), personMap(c, userIds)]);
  const rows = users.map((u) => {
    const values = byUser.get(u.id) ?? EMPTY;
    const cells = on.map((h) => {
      if (!assignees(h, assigned, [u.id]).length) return null;
      const r = habitAdherence(habitRule(h), values, from, to);
      return { pct: adherencePct(r), kept: r.kept, scheduled: r.scheduled };
    });
    const pcts = cells.map((x) => x?.pct).filter((x): x is number => x != null);
    return { person: personOf(people, u.id)!, cells, avg: pcts.length ? Math.round(pcts.reduce((s1, x) => s1 + x, 0) / pcts.length) : null };
  });
  return { from, to, habits: on.map((h) => ({ id: h.id, name: h.name, icon: h.icon, hue: h.hue })), rows };
}
