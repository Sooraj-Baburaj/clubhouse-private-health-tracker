import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { MyPlanResponse, SetPlanDaysRequest, WeekStripDay } from '@clubhouse/contracts';
import { addDays, dateRange, weekdayOf, weekStartOf } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest, conflict } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { recomputeMemberStreaks } from './momentum';
import { notifyAdmins } from './notify';
import { activePlanItems, weekPlanProgress } from './plans';
import { rescheduleUser } from './scheduler';

/** APP-SET-20…24: the member's activity plan, chosen days and this week's strip. */
export async function getMyPlan(c: Container, user: AuthUser): Promise<MyPlanResponse> {
  const clock = memberClock(c, user.timezone);
  const weekStart = weekStartOf(clock.today);
  const { plan, items } = await activePlanItems(c, user.id);
  const [progress, proposals, rest] = await Promise.all([
    weekPlanProgress(c, user.id, weekStart),
    c.db.query.activityPlanProposals.findMany({ where: eq(s.activityPlanProposals.userId, user.id), orderBy: [desc(s.activityPlanProposals.createdAt)], limit: 10 }),
    c.db.query.restWeeks.findFirst({ where: and(eq(s.restWeeks.userId, user.id), eq(s.restWeeks.weekStart, weekStart)) }),
  ]);
  const acts = await c.db
    .select({ log: s.activityLogs, type: s.activityTypes })
    .from(s.activityLogs)
    .innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityLogs.typeId))
    .where(and(eq(s.activityLogs.userId, user.id), gte(s.activityLogs.date, weekStart), lte(s.activityLogs.date, addDays(weekStart, 6)), isNull(s.activityLogs.deletedAt)));
  const restActive = !!rest && (rest.status === 'approved' || rest.status === 'admin' || rest.status === 'pending');

  const week: WeekStripDay[] = dateRange(weekStart, addDays(weekStart, 6)).map((date) => {
    const weekday = weekdayOf(date);
    const planned = progress.items.flatMap((i) => i.days.filter((d) => d.weekday === weekday).map((d) => ({ itemId: i.itemId, typeName: i.typeName, time: d.time })));
    const done = acts.filter((a) => a.log.date === date).map((a) => ({ typeName: a.type.name, durationMin: a.log.durationMin }));
    let status: WeekStripDay['status'];
    if (done.length) status = 'done';
    else if (restActive) status = 'rest';
    else if (date === clock.today) status = 'today';
    else if (date > clock.today) status = planned.length ? 'upcoming' : 'none';
    else status = planned.length ? 'missed' : 'none';
    return { date, weekday, planned, done, status };
  });

  return {
    hasPlan: !!plan && items.length > 0,
    note: plan?.note ?? null,
    items: progress.items.map((i) => ({ ...i, suggestedDays: items.find((x) => x.id === i.itemId)?.suggestedDays ?? [] })),
    weekStart,
    week,
    // SYS-STREAK-06: weekly targets count sessions on any day, so a missed planned day is recoverable.
    anyDayStillCounts: progress.items.some((i) => i.done < i.target),
    proposals: proposals.map((p) => ({ id: p.id, text: p.text, status: p.status, adminReply: p.adminReply, createdAt: p.createdAt.toISOString() })),
    restWeek: rest ? { weekStart: rest.weekStart, status: rest.status } : null,
  };
}

export async function setPlanDays(c: Container, user: AuthUser, input: SetPlanDaysRequest): Promise<MyPlanResponse> {
  const { items } = await activePlanItems(c, user.id);
  const mine = new Set(items.map((i) => i.id));
  for (const it of input.items) if (!mine.has(it.itemId)) throw badRequest('That activity is not in your plan.', 'unknown_item');
  await c.db.transaction(async (tx) => {
    const ids = input.items.map((i) => i.itemId);
    if (ids.length) await tx.delete(s.activityPlanDays).where(inArray(s.activityPlanDays.itemId, ids));
    for (const it of input.items) {
      const unique = new Map(it.days.map((d) => [d.weekday, d.time]));
      if (unique.size) await tx.insert(s.activityPlanDays).values([...unique].map(([weekday, time]) => ({ itemId: it.itemId, weekday, time })));
    }
  });
  await rescheduleUser(c, user.id, 'activity_reminder');
  return getMyPlan(c, user);
}

export async function proposeChange(c: Container, user: AuthUser, text: string) {
  const open = await c.db.query.activityPlanProposals.findMany({ where: and(eq(s.activityPlanProposals.userId, user.id), eq(s.activityPlanProposals.status, 'open')) });
  if (open.length >= 3) throw conflict('You already have a few open proposals. Your admin will get to them soon.', 'too_many_proposals');
  await c.db.insert(s.activityPlanProposals).values({ userId: user.id, text });
  await notifyAdmins(c, user.teamId, { type: 'system', title: 'Activity plan proposal', body: `${user.displayName}: ${text.slice(0, 120)}`, url: '/admin/plans' });
}

/** APP-SET-24: ask for a rest week; it counts as pending (streak frozen) until an admin decides. */
export async function requestRestWeek(c: Container, user: AuthUser, weekStart: string, reason?: string) {
  const clock = memberClock(c, user.timezone);
  if (weekStartOf(weekStart) !== weekStart) throw badRequest('Weeks start on Monday.', 'bad_week');
  if (weekStart < weekStartOf(clock.today)) throw badRequest('Pick this week or a later one.', 'past_week');
  if (weekStart > addDays(weekStartOf(clock.today), 28)) throw badRequest('Pick a week in the next month.', 'far_week');
  const existing = await c.db.query.restWeeks.findFirst({ where: and(eq(s.restWeeks.userId, user.id), eq(s.restWeeks.weekStart, weekStart)) });
  if (existing) throw conflict('You already asked for that week.', 'duplicate');
  await c.db.insert(s.restWeeks).values({ userId: user.id, weekStart, reason: reason ?? null, status: 'pending' });
  await notifyAdmins(c, user.teamId, { type: 'system', title: 'Rest week request', body: `${user.displayName} asked for a rest week from ${weekStart}${reason ? `: ${reason}` : ''}`, url: '/admin/plans' });
  await recomputeMemberStreaks(c, user.id, clock.today);
}
