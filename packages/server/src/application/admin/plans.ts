import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { AdminPlanRow, AdminRestWeekRequest, AssignPlanTemplateRequest, PersonRef, PlanItemDto, ProposalReplyRequest, UpsertPlanRequest } from '@clubhouse/contracts';
import { addDays, weekdayOf, weekStartOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { refreshCurrentWeek } from '../board';
import { badRequest, notFound } from '../../lib/errors';
import { recomputeMemberStreaks } from '../momentum';
import { notifyUser } from '../notify';
import { activePlanItems, weekPlanProgress } from '../plans';
import { rescheduleUser } from '../scheduler';
import { getTeam } from '../team';
import { getMember, logAudit, personMap, personOf, teamUsers, type Actor } from './shared';
import { localDateOf } from '@clubhouse/domain';

type PlanInput = z.infer<typeof UpsertPlanRequest>;

function memberToday(c: Container, tz: string) {
  return localDateOf(c.clock.now(), tz);
}

/** Plan items with this week's progress and the admin-suggested days (PlanItemDto). */
export async function planItemsDto(c: Container, userId: string, weekStart: string): Promise<PlanItemDto[]> {
  const [{ items }, progress] = await Promise.all([activePlanItems(c, userId), weekPlanProgress(c, userId, weekStart)]);
  return progress.items.map((i) => ({ ...i, suggestedDays: items.find((x) => x.id === i.itemId)?.suggestedDays ?? [] }));
}

/** Done vs planned for the last `n` weeks (ADM-PLAN-06 adherence), oldest first. */
export async function planWeeks(c: Container, userId: string, today: string, n = 12): Promise<{ weekStart: string; done: number; planned: number }[]> {
  const current = weekStartOf(today);
  const out: { weekStart: string; done: number; planned: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const w = addDays(current, -7 * i);
    const p = await weekPlanProgress(c, userId, w);
    const weekly = p.items.filter((x) => x.target > 0);
    out.push({ weekStart: w, done: weekly.reduce((a, x) => a + Math.min(x.done, x.target), 0), planned: weekly.reduce((a, x) => a + x.target, 0) });
  }
  return out;
}

/** Weekdays the member picked for any plan item. */
export async function usualDays(c: Container, userId: string): Promise<number[]> {
  const { items } = await activePlanItems(c, userId);
  if (!items.length) return [];
  const days = await c.db.query.activityPlanDays.findMany({ where: inArray(s.activityPlanDays.itemId, items.map((i) => i.id)) });
  return [...new Set(days.map((d) => d.weekday))].sort((a, b) => a - b);
}

export async function listPlans(c: Container, a: Actor): Promise<AdminPlanRow[]> {
  const team = await getTeam(c, a.user.teamId);
  const users = await teamUsers(c, a.user.teamId, { activeOnly: true });
  const people = await personMap(c, users.map((u) => u.id));
  const ids = users.map((u) => u.id);
  const [proposals, rests] = ids.length
    ? await Promise.all([
        c.db.query.activityPlanProposals.findMany({ where: and(inArray(s.activityPlanProposals.userId, ids), eq(s.activityPlanProposals.status, 'open')) }),
        c.db.query.restWeeks.findMany({ where: and(inArray(s.restWeeks.userId, ids), eq(s.restWeeks.status, 'pending')) }),
      ])
    : [[], []];
  const rows: AdminPlanRow[] = [];
  for (const u of users) {
    const today = memberToday(c, u.timezone || team.timezone);
    const ws = weekStartOf(today);
    const { items } = await activePlanItems(c, u.id);
    const progress = await weekPlanProgress(c, u.id, ws);
    const planDays = items.length ? await c.db.query.activityPlanDays.findMany({ where: inArray(s.activityPlanDays.itemId, items.map((i) => i.id)) }) : [];
    const logs = await c.db
      .select({ date: s.activityLogs.date })
      .from(s.activityLogs)
      .where(and(eq(s.activityLogs.userId, u.id), gte(s.activityLogs.date, ws), lte(s.activityLogs.date, addDays(ws, 6)), isNull(s.activityLogs.deletedAt)));
    const doneDays = new Set(logs.map((l) => weekdayOf(l.date)));
    const plannedDays = new Set(planDays.map((d) => d.weekday));
    const weekly = progress.items.filter((x) => x.target > 0);
    rows.push({
      person: personOf(people, u.id)!,
      userId: u.id,
      items: items.map((i) => ({ typeName: i.type.name, perWeek: i.perWeek, perMonth: i.perMonth })),
      days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, planned: plannedDays.has(d), done: doneDays.has(d) })),
      done: weekly.reduce((acc, x) => acc + Math.min(x.done, x.target), 0),
      planned: weekly.reduce((acc, x) => acc + x.target, 0),
      pendingProposals: proposals.filter((p) => p.userId === u.id).length,
      restWeekPending: rests.some((r) => r.userId === u.id),
    });
  }
  return rows;
}

export async function getPlan(c: Container, a: Actor, userId: string) {
  const u = await getMember(c, a.user.teamId, userId);
  const team = await getTeam(c, a.user.teamId);
  const today = memberToday(c, u.timezone || team.timezone);
  const plan = await c.db.query.activityPlans.findFirst({ where: eq(s.activityPlans.userId, userId) });
  return {
    items: await planItemsDto(c, userId, weekStartOf(today)),
    note: plan?.note ?? null,
    weeks: await planWeeks(c, userId, today),
    usualDays: await usualDays(c, userId),
  };
}

async function validateTypes(c: Container, teamId: string, typeIds: string[]) {
  if (!typeIds.length) return;
  const rows = await c.db.query.activityTypes.findMany({ where: and(inArray(s.activityTypes.id, [...new Set(typeIds)]), or(isNull(s.activityTypes.teamId), eq(s.activityTypes.teamId, teamId))) });
  if (rows.length !== new Set(typeIds).size) throw badRequest('One of the activity types was not found.', 'bad_activity_type');
}

/** Replace a member's plan items: matching ids are updated, new ones added, missing ones archived (progress comes from logs). */
async function writePlan(c: Container, a: Actor, userId: string, input: PlanInput) {
  const now = c.clock.now();
  let plan = await c.db.query.activityPlans.findFirst({ where: eq(s.activityPlans.userId, userId) });
  const before = plan ? { note: plan.note, items: (await activePlanItems(c, userId)).items.map((i) => ({ id: i.id, typeId: i.typeId, perWeek: i.perWeek, perMonth: i.perMonth, targetMin: i.targetMin })) } : null;
  await c.db.transaction(async (tx) => {
    if (!plan) [plan] = await tx.insert(s.activityPlans).values({ userId, note: input.note ?? null, createdBy: a.user.id }).returning();
    else if (input.note !== undefined) await tx.update(s.activityPlans).set({ note: input.note, updatedAt: now }).where(eq(s.activityPlans.id, plan.id));
    else await tx.update(s.activityPlans).set({ updatedAt: now }).where(eq(s.activityPlans.id, plan.id));
    const existing = await tx.query.activityPlanItems.findMany({ where: and(eq(s.activityPlanItems.planId, plan!.id), isNull(s.activityPlanItems.archivedAt)) });
    const keep = new Set<string>();
    let order = 0;
    for (const item of input.items) {
      const values = { typeId: item.typeId, perWeek: item.perWeek ?? null, perMonth: item.perMonth ?? null, targetMin: item.targetMin ?? null, note: item.note ?? null, suggestedDays: item.suggestedDays ?? [], sortOrder: order++ };
      const match = item.id ? existing.find((e) => e.id === item.id) : undefined;
      if (match) {
        keep.add(match.id);
        await tx.update(s.activityPlanItems).set(values).where(eq(s.activityPlanItems.id, match.id));
      } else {
        await tx.insert(s.activityPlanItems).values({ ...values, planId: plan!.id });
      }
    }
    const archive = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (archive.length) await tx.update(s.activityPlanItems).set({ archivedAt: now }).where(inArray(s.activityPlanItems.id, archive));
  });
  await rescheduleUser(c, userId, 'activity_reminder');
  // The weekly plan bonus on the leaderboard follows the new plan.
  await refreshCurrentWeek(c, userId);
  return { before, after: { note: input.note ?? before?.note ?? null, items: input.items } };
}

export async function upsertPlan(c: Container, a: Actor, userId: string, input: PlanInput) {
  const u = await getMember(c, a.user.teamId, userId);
  await validateTypes(c, a.user.teamId, input.items.map((i) => i.typeId));
  const { before, after } = await writePlan(c, a, userId, input);
  await logAudit(c, a, { action: 'plan.update', targetType: 'activity_plan', targetId: userId, memberId: u.id, before, after });
  await notifyUser(c, userId, { type: 'plan_updated', title: 'Your activity plan was updated', body: `${a.user.displayName} updated your weekly activity plan.`, url: '/settings/activity-plan', tag: 'plan_updated' });
}

export async function assignPlan(c: Container, a: Actor, input: z.infer<typeof AssignPlanTemplateRequest>) {
  await validateTypes(c, a.user.teamId, input.items.map((i) => i.typeId));
  let updated = 0;
  for (const userId of [...new Set(input.userIds)]) {
    const u = await c.db.query.users.findFirst({ where: and(eq(s.users.id, userId), eq(s.users.teamId, a.user.teamId)) });
    if (!u || u.status !== 'active') continue;
    await writePlan(c, a, userId, { note: input.note, items: input.items.map((i) => ({ ...i, id: undefined })) });
    updated++;
  }
  await logAudit(c, a, { action: 'plan.assign', targetType: 'activity_plan', after: { userIds: input.userIds, items: input.items, updated } });
  return { updated };
}

export async function ranking(c: Container, a: Actor): Promise<{ person: PersonRef; done: number; planned: number; pct: number }[]> {
  const rows = await listPlans(c, a);
  return rows
    .filter((r) => r.planned > 0)
    .map((r) => ({ person: r.person, done: r.done, planned: r.planned, pct: Math.round((Math.min(r.done, r.planned) / r.planned) * 100) }))
    .sort((x, y) => y.pct - x.pct || y.done - x.done);
}

export async function proposals(c: Container, a: Actor) {
  const users = await teamUsers(c, a.user.teamId);
  if (!users.length) return [];
  const rows = await c.db.query.activityPlanProposals.findMany({ where: inArray(s.activityPlanProposals.userId, users.map((u) => u.id)), orderBy: [desc(s.activityPlanProposals.createdAt)], limit: 200 });
  const people = await personMap(c, rows.map((r) => r.userId));
  return rows
    .sort((x, y) => Number(y.status === 'open') - Number(x.status === 'open'))
    .map((r) => ({ id: r.id, person: personOf(people, r.userId)!, text: r.text, status: r.status, adminReply: r.adminReply, createdAt: r.createdAt.toISOString() }));
}

async function teamProposal(c: Container, teamId: string, id: string) {
  const row = await c.db.select({ p: s.activityPlanProposals }).from(s.activityPlanProposals).innerJoin(s.users, eq(s.users.id, s.activityPlanProposals.userId)).where(and(eq(s.activityPlanProposals.id, id), eq(s.users.teamId, teamId))).limit(1);
  if (!row[0]) throw notFound('Proposal not found.');
  return row[0].p;
}

export async function replyProposal(c: Container, a: Actor, id: string, input: z.infer<typeof ProposalReplyRequest>) {
  const p = await teamProposal(c, a.user.teamId, id);
  await c.db.update(s.activityPlanProposals).set({ status: input.status, adminReply: input.reply ?? null, handledBy: a.user.id, handledAt: c.clock.now() }).where(eq(s.activityPlanProposals.id, id));
  await logAudit(c, a, { action: 'plan.proposal_reply', targetType: 'plan_proposal', targetId: id, memberId: p.userId, before: { status: p.status }, after: { status: input.status, reply: input.reply ?? null } });
  const word = input.status === 'accepted' ? 'accepted' : input.status === 'declined' ? 'declined' : 'replied to';
  await notifyUser(c, p.userId, { type: 'plan_updated', title: `Your plan request was ${word}`, body: input.reply || `${a.user.displayName} ${word} your activity plan request.`, url: '/settings/activity-plan', tag: 'plan_proposal' });
}

export async function restWeeks(c: Container, a: Actor) {
  const users = await teamUsers(c, a.user.teamId);
  if (!users.length) return [];
  const rows = await c.db.query.restWeeks.findMany({ where: inArray(s.restWeeks.userId, users.map((u) => u.id)), orderBy: [desc(s.restWeeks.weekStart)], limit: 200 });
  const people = await personMap(c, rows.map((r) => r.userId));
  return rows
    .sort((x, y) => Number(y.status === 'pending') - Number(x.status === 'pending'))
    .map((r) => ({ id: r.id, person: personOf(people, r.userId)!, weekStart: r.weekStart, status: r.status, reason: r.reason }));
}

async function recomputeFor(c: Container, userId: string) {
  const u = await c.db.query.users.findFirst({ where: eq(s.users.id, userId) });
  if (!u) return;
  const team = await getTeam(c, u.teamId);
  await recomputeMemberStreaks(c, userId, memberToday(c, u.timezone || team.timezone));
  // A rest week keeps the leaderboard's weekly plan bonus.
  await refreshCurrentWeek(c, userId);
}

export async function decideRestWeek(c: Container, a: Actor, id: string, status: 'approved' | 'declined') {
  const row = await c.db.select({ r: s.restWeeks }).from(s.restWeeks).innerJoin(s.users, eq(s.users.id, s.restWeeks.userId)).where(and(eq(s.restWeeks.id, id), eq(s.users.teamId, a.user.teamId))).limit(1);
  const r = row[0]?.r;
  if (!r) throw notFound('Rest week not found.');
  await c.db.update(s.restWeeks).set({ status, decidedBy: a.user.id }).where(eq(s.restWeeks.id, id));
  await logAudit(c, a, { action: 'plan.rest_week_decide', targetType: 'rest_week', targetId: id, memberId: r.userId, before: { status: r.status }, after: { status } });
  await recomputeFor(c, r.userId);
  await notifyUser(c, r.userId, { type: 'plan_updated', title: status === 'approved' ? 'Rest week approved' : 'Rest week not approved', body: status === 'approved' ? `Enjoy the break — the week of ${r.weekStart} won’t count against your activity streak.` : `${a.user.displayName} didn’t approve the rest week of ${r.weekStart}.`, url: '/settings/activity-plan', tag: 'rest_week' });
}

export async function setRestWeek(c: Container, a: Actor, input: z.infer<typeof AdminRestWeekRequest>) {
  const u = await getMember(c, a.user.teamId, input.userId);
  if (weekStartOf(input.weekStart) !== input.weekStart) throw badRequest('Pick the Monday that starts the week.', 'not_week_start', { weekStart: 'Must be a Monday' });
  const existing = await c.db.query.restWeeks.findFirst({ where: and(eq(s.restWeeks.userId, u.id), eq(s.restWeeks.weekStart, input.weekStart)) });
  if (existing) await c.db.update(s.restWeeks).set({ status: 'approved', reason: input.reason ?? existing.reason, decidedBy: a.user.id }).where(eq(s.restWeeks.id, existing.id));
  else await c.db.insert(s.restWeeks).values({ userId: u.id, weekStart: input.weekStart, status: 'approved', reason: input.reason ?? null, decidedBy: a.user.id });
  await logAudit(c, a, { action: 'plan.rest_week_set', targetType: 'rest_week', targetId: existing?.id ?? null, memberId: u.id, before: existing ? { status: existing.status } : null, after: { weekStart: input.weekStart, status: 'approved', reason: input.reason ?? null } });
  await recomputeFor(c, u.id);
}

