import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { addDays } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';

export interface PlanItemProgress {
  itemId: string;
  typeId: string;
  typeKey: string;
  typeName: string;
  icon: string;
  perWeek: number | null;
  perMonth: number | null;
  targetMin: number | null;
  note: string | null;
  done: number;
  target: number;
  days: { weekday: number; time: string }[];
}

export async function activePlanItems(c: Container, userId: string) {
  const plan = await c.db.query.activityPlans.findFirst({ where: eq(s.activityPlans.userId, userId) });
  if (!plan) return { plan: null, items: [] as (typeof s.activityPlanItems.$inferSelect & { type: typeof s.activityTypes.$inferSelect })[] };
  const items = await c.db
    .select({ item: s.activityPlanItems, type: s.activityTypes })
    .from(s.activityPlanItems)
    .innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityPlanItems.typeId))
    .where(and(eq(s.activityPlanItems.planId, plan.id), isNull(s.activityPlanItems.archivedAt)))
    .orderBy(asc(s.activityPlanItems.sortOrder));
  return { plan, items: items.map((r) => ({ ...r.item, type: r.type })) };
}

/** Attribute each activity log to at most one plan item: its explicit item, else the first item of the same type. */
export function attributeLogs(items: { id: string; typeId: string }[], logs: { id: string; typeId: string; planItemId: string | null }[]) {
  const counts = new Map<string, number>(items.map((i) => [i.id, 0]));
  for (const l of logs) {
    const target = (l.planItemId && counts.has(l.planItemId) ? l.planItemId : null) ?? items.find((i) => i.typeId === l.typeId)?.id;
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

/** Sessions done vs planned for the week (APP-SET-21, ADM-PLAN-03). Progress comes from logs, so a plan change never lowers it. */
export async function weekPlanProgress(c: Container, userId: string, weekStart: string): Promise<{ items: PlanItemProgress[]; met: boolean; hasWeeklyItems: boolean }> {
  const { items } = await activePlanItems(c, userId);
  if (!items.length) return { items: [], met: false, hasWeeklyItems: false };
  const logs = await c.db
    .select({ id: s.activityLogs.id, typeId: s.activityLogs.typeId, planItemId: s.activityLogs.planItemId })
    .from(s.activityLogs)
    .where(and(eq(s.activityLogs.userId, userId), gte(s.activityLogs.date, weekStart), lte(s.activityLogs.date, addDays(weekStart, 6)), isNull(s.activityLogs.deletedAt)));
  const counts = attributeLogs(items, logs);
  const days = await c.db.query.activityPlanDays.findMany({ where: inArray(s.activityPlanDays.itemId, items.map((i) => i.id)) });
  const out: PlanItemProgress[] = items.map((i) => ({
    itemId: i.id,
    typeId: i.typeId,
    typeKey: i.type.key,
    typeName: i.type.name,
    icon: i.type.icon,
    perWeek: i.perWeek,
    perMonth: i.perMonth,
    targetMin: i.targetMin,
    note: i.note,
    done: counts.get(i.id) ?? 0,
    target: i.perWeek ?? Math.ceil((i.perMonth ?? 0) / 4),
    days: days.filter((d) => d.itemId === i.id).map((d) => ({ weekday: d.weekday, time: d.time })).sort((a, b) => a.weekday - b.weekday),
  }));
  const weekly = out.filter((i) => i.perWeek != null && i.perWeek > 0);
  return { items: out, met: weekly.length > 0 && weekly.every((i) => i.done >= i.target), hasWeeklyItems: weekly.length > 0 };
}
