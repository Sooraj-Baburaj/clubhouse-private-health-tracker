import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { ActivityLogDto, ActivityLogUpsert, ActivityTypeDto, ChangesResponse, FoodLogDto, FoodLogUpsert, SyncOp, SyncResult, UpsertResult, WeightEntryDto, WeightUpsert } from '@clubhouse/contracts';
import { addDays, computeBurn, needsRecompute, nutritionFor, roundTotals, sumTotals, type ActivityTypeDef } from '@clubhouse/domain';
import { schema as s, type FoodLogItemJson } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest, notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { afterLogSaved, emptyEffects } from './effects';
import { foodsByIds } from './foods';
import { upsertCheckin } from './habits';
import { imageUrlMap } from './images';
import { activityLogDto, foodLogDto, weightDto } from './mappers';
import { isAddedLate } from './momentum';
import { activePlanItems } from './plans';
import { recomputeTargets } from './targets';

function checkDate(c: Container, user: AuthUser, date: string) {
  const { today } = memberClock(c, user.timezone);
  if (date > addDays(today, 1)) throw badRequest('You can’t log for a future day.', 'future_date', { date: 'Future date' });
  if (date < addDays(today, -366)) throw badRequest('That date is too far back.', 'too_old', { date: 'Too far back' });
}

export async function listActivityTypes(c: Container, user: AuthUser): Promise<ActivityTypeDto[]> {
  const rows = await c.db.query.activityTypes.findMany({
    where: and(eq(s.activityTypes.enabled, true), or(isNull(s.activityTypes.teamId), eq(s.activityTypes.teamId, user.teamId))),
    orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)],
  });
  return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, icon: r.icon, met: r.met, metBands: r.metBands, inputs: r.inputs as ActivityTypeDto['inputs'], defaultDurationMin: r.defaultDurationMin }));
}

/* ───────── Food ───────── */

async function resolveItems(c: Container, user: AuthUser, input: FoodLogUpsert): Promise<FoodLogItemJson[]> {
  const foods = await foodsByIds(c, input.items.map((i) => i.foodId).filter((x): x is string => !!x));
  return input.items.map((i) => {
    if (i.foodId) {
      const f = foods.get(i.foodId);
      if (!f || (f.ownerId && f.ownerId !== user.id && !f.verified)) throw badRequest(`“${i.name}” is no longer available.`, 'unknown_food');
      return {
        foodId: f.id,
        name: i.name || f.name,
        grams: i.grams,
        servings: i.servings,
        servingLabel: i.servingLabel ?? null,
        nutrition: roundTotals(nutritionFor(f.per100g, i.grams)),
        source: i.source,
        dietOptionId: i.dietOptionId ?? null,
        aiEstimate: f.source === 'ai',
        confidence: i.confidence ?? null,
        tags: f.tags,
      };
    }
    if (!i.nutrition) throw badRequest(`Add calories for “${i.name}”.`, 'nutrition_required');
    return { foodId: null, name: i.name, grams: i.grams, servings: i.servings, servingLabel: i.servingLabel ?? null, nutrition: roundTotals(i.nutrition), source: i.source, dietOptionId: i.dietOptionId ?? null, aiEstimate: !!i.aiEstimate, confidence: i.confidence ?? null, tags: [] };
  });
}

export async function upsertFoodLog(c: Container, user: AuthUser, id: string, input: FoodLogUpsert, opts: { skipEffects?: boolean } = {}): Promise<UpsertResult<FoodLogDto>> {
  checkDate(c, user, input.date);
  const existing = await c.db.query.foodLogs.findFirst({ where: eq(s.foodLogs.id, id) });
  if (existing && existing.userId !== user.id) throw notFound('Log not found.');
  if (!input.deleted && input.items.length === 0) throw badRequest('Add at least one food.', 'empty_log');
  const items = input.deleted && existing ? existing.items : await resolveItems(c, user, input);
  const totals = roundTotals(sumTotals(items.map((i) => i.nutrition)));
  const now = c.clock.now();
  const clientUpdatedAt = new Date(Math.min(new Date(input.clientUpdatedAt).getTime(), now.getTime() + 5 * 60_000));
  const values = {
    id,
    userId: user.id,
    teamId: user.teamId,
    date: input.date,
    mealSlot: input.mealSlot,
    loggedAt: new Date(input.loggedAt),
    items,
    totals,
    // Omitted imageId keeps the saved photo; null removes it (edits don't resend the photo).
    imageId: input.imageId !== undefined ? input.imageId : (existing?.imageId ?? null),
    aiCallId: input.aiCallId ?? null,
    aiGenerated: items.some((i) => i.source === 'ai'),
    confidence: items.some((i) => i.confidence != null) ? Math.min(...items.map((i) => i.confidence ?? 1)) : null,
    note: input.note ?? null,
    addedLate: existing?.addedLate ?? isAddedLate(input.date, user.timezone, now),
    clientUpdatedAt,
    serverUpdatedAt: now,
    deletedAt: input.deleted ? now : null,
  };
  const [row] = await c.db
    .insert(s.foodLogs)
    .values(values)
    .onConflictDoUpdate({ target: s.foodLogs.id, set: { ...values, id: undefined, userId: undefined, teamId: undefined, addedLate: undefined }, setWhere: sql`${s.foodLogs.userId} = ${user.id} and ${s.foodLogs.clientUpdatedAt} < ${clientUpdatedAt.toISOString()}::timestamptz` })
    .returning();
  const images = await imageUrlMap(c, [row?.imageId ?? existing?.imageId]);
  if (!row) return { status: 'stale', entity: foodLogDto(existing!, images), effects: emptyEffects() };

  if (!input.deleted) {
    for (const it of items.filter((i) => i.foodId)) {
      await c.db
        .insert(s.foodUsage)
        .values({ userId: user.id, foodId: it.foodId!, uses: 1, lastUsedAt: now, lastGrams: it.grams, lastServingLabel: it.servingLabel })
        .onConflictDoUpdate({ target: [s.foodUsage.userId, s.foodUsage.foodId], set: { uses: sql`${s.foodUsage.uses} + ${existing ? 0 : 1}`, lastUsedAt: now, lastGrams: it.grams, lastServingLabel: it.servingLabel } });
    }
    if (input.aiCallId) await c.db.update(s.aiCalls).set({ entityType: 'food_log', entityId: id }).where(and(eq(s.aiCalls.id, input.aiCallId), eq(s.aiCalls.userId, user.id)));
  }
  const effects = opts.skipEffects ? emptyEffects() : await afterLogSaved(c, user, { kind: 'food', id, date: input.date, isNew: !existing, deleted: !!input.deleted, row, prevDate: existing?.date });
  return { status: 'applied', entity: foodLogDto(row, images), effects };
}

/* ───────── Activity ───────── */

export async function upsertActivityLog(c: Container, user: AuthUser, id: string, input: ActivityLogUpsert, opts: { skipEffects?: boolean } = {}): Promise<UpsertResult<ActivityLogDto>> {
  checkDate(c, user, input.date);
  const existing = await c.db.query.activityLogs.findFirst({ where: eq(s.activityLogs.id, id) });
  if (existing && existing.userId !== user.id) throw notFound('Log not found.');
  const type = await c.db.query.activityTypes.findFirst({ where: and(eq(s.activityTypes.id, input.typeId), or(isNull(s.activityTypes.teamId), eq(s.activityTypes.teamId, user.teamId))) });
  if (!type) throw badRequest('Unknown activity type.', 'unknown_activity');
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) });
  const weight = profile?.weightKg ?? 70;
  const def: ActivityTypeDef = { key: type.key, met: type.met, metBands: type.metBands, inputs: type.inputs as ActivityTypeDef['inputs'] };
  const burn = computeBurn(def, { durationMin: input.durationMin, distanceKm: input.distanceKm, intensity: input.intensity, focus: input.focus }, weight);
  let planItemId = input.planItemId ?? null;
  const { items } = await activePlanItems(c, user.id);
  if (planItemId && !items.some((i) => i.id === planItemId)) planItemId = null;
  if (!planItemId) planItemId = items.find((i) => i.typeId === type.id)?.id ?? null;
  const now = c.clock.now();
  const clientUpdatedAt = new Date(Math.min(new Date(input.clientUpdatedAt).getTime(), now.getTime() + 5 * 60_000));
  const values = {
    id,
    userId: user.id,
    teamId: user.teamId,
    date: input.date,
    loggedAt: new Date(input.loggedAt),
    typeId: type.id,
    durationMin: input.durationMin,
    distanceKm: input.distanceKm ?? null,
    intensity: input.intensity ?? null,
    focus: input.focus ?? null,
    kcalBurned: input.kcalOverride ?? burn.kcal,
    kcalOverridden: input.kcalOverride != null,
    met: burn.met,
    planItemId,
    // Omitted imageId keeps the saved photo; null removes it (edits don't resend the photo).
    imageId: input.imageId !== undefined ? input.imageId : (existing?.imageId ?? null),
    note: input.note ?? null,
    addedLate: existing?.addedLate ?? isAddedLate(input.date, user.timezone, now),
    clientUpdatedAt,
    serverUpdatedAt: now,
    deletedAt: input.deleted ? now : null,
  };
  const [row] = await c.db
    .insert(s.activityLogs)
    .values(values)
    .onConflictDoUpdate({ target: s.activityLogs.id, set: { ...values, id: undefined, userId: undefined, teamId: undefined, addedLate: undefined }, setWhere: sql`${s.activityLogs.userId} = ${user.id} and ${s.activityLogs.clientUpdatedAt} < ${clientUpdatedAt.toISOString()}::timestamptz` })
    .returning();
  if (!row) return { status: 'stale', entity: activityLogDto(existing!, type), effects: emptyEffects() };
  const effects = opts.skipEffects ? emptyEffects() : await afterLogSaved(c, user, { kind: 'activity', id, date: input.date, isNew: !existing, deleted: !!input.deleted, row, prevDate: existing?.date });
  return { status: 'applied', entity: activityLogDto(row, type), effects };
}

/* ───────── Weight ───────── */

export async function upsertWeight(c: Container, user: AuthUser, id: string, input: WeightUpsert, opts: { skipEffects?: boolean } = {}): Promise<UpsertResult<WeightEntryDto>> {
  checkDate(c, user, input.date);
  const now = c.clock.now();
  const clientUpdatedAt = new Date(Math.min(new Date(input.clientUpdatedAt).getTime(), now.getTime() + 5 * 60_000));
  // One live entry per day, latest wins: a new id for an existing day updates that day's entry.
  const sameDay = await c.db.query.weightEntries.findFirst({ where: and(eq(s.weightEntries.userId, user.id), eq(s.weightEntries.date, input.date), isNull(s.weightEntries.deletedAt)) });
  const byId = await c.db.query.weightEntries.findFirst({ where: eq(s.weightEntries.id, id) });
  if (byId && byId.userId !== user.id) throw notFound('Entry not found.');
  const target = byId ?? sameDay;
  let row: typeof s.weightEntries.$inferSelect | undefined;
  if (target) {
    if (target.clientUpdatedAt >= clientUpdatedAt) return { status: 'stale', entity: weightDto(target), effects: emptyEffects() };
    [row] = await c.db
      .update(s.weightEntries)
      .set({ date: input.date, weightKg: input.weightKg, note: input.note ?? null, clientUpdatedAt, serverUpdatedAt: now, deletedAt: input.deleted ? now : null })
      .where(eq(s.weightEntries.id, target.id))
      .returning();
  } else {
    [row] = await c.db
      .insert(s.weightEntries)
      .values({ id, userId: user.id, teamId: user.teamId, date: input.date, weightKg: input.weightKg, note: input.note ?? null, addedLate: isAddedLate(input.date, user.timezone, now), clientUpdatedAt, serverUpdatedAt: now, deletedAt: input.deleted ? now : null })
      .returning();
  }
  // Profile weight = latest live weigh-in; targets recompute on a ≥ 2 kg move (SYS-CALC-06).
  const latest = await c.db.query.weightEntries.findFirst({ where: and(eq(s.weightEntries.userId, user.id), isNull(s.weightEntries.deletedAt)), orderBy: [desc(s.weightEntries.date)] });
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, user.id) });
  if (latest && profile && latest.weightKg !== profile.weightKg) {
    await c.db.update(s.profiles).set({ weightKg: latest.weightKg, updatedAt: now }).where(eq(s.profiles.userId, user.id));
    const hasOverride = profile.targetOverrides && Object.values(profile.targetOverrides).some((v) => v != null);
    if (!hasOverride && needsRecompute(profile.targetsWeightKg, latest.weightKg, false)) await recomputeTargets(c, user.id, memberClock(c, user.timezone).today);
  }
  const effects = opts.skipEffects ? emptyEffects() : await afterLogSaved(c, user, { kind: 'weight', id: row!.id, date: input.date, isNew: !target, deleted: !!input.deleted, row: row!, prevDate: target?.date });
  return { status: 'applied', entity: weightDto(row!), effects };
}

/* ───────── Reads, sync ───────── */

export async function logsForDate(c: Container, user: AuthUser, userId: string, date: string) {
  const [foods, acts, weight] = await Promise.all([
    c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, userId), eq(s.foodLogs.date, date), isNull(s.foodLogs.deletedAt)), orderBy: [desc(s.foodLogs.loggedAt)] }),
    c.db.select({ log: s.activityLogs, type: s.activityTypes }).from(s.activityLogs).innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityLogs.typeId)).where(and(eq(s.activityLogs.userId, userId), eq(s.activityLogs.date, date), isNull(s.activityLogs.deletedAt))).orderBy(desc(s.activityLogs.loggedAt)),
    c.db.query.weightEntries.findFirst({ where: and(eq(s.weightEntries.userId, userId), eq(s.weightEntries.date, date), isNull(s.weightEntries.deletedAt)) }),
  ]);
  const images = await imageUrlMap(c, foods.map((f) => f.imageId));
  return {
    foodLogs: foods.map((f) => foodLogDto(f, images)),
    activityLogs: acts.map((a) => activityLogDto(a.log, a.type)),
    weight: weight ? weightDto(weight) : null,
    raw: { foods, acts: acts.map((a) => a.log) },
  };
}

export async function sync(c: Container, user: AuthUser, ops: SyncOp[]): Promise<SyncResult> {
  const results: SyncResult['results'] = [];
  const touchedDates = new Set<string>();
  for (const op of ops) {
    try {
      if (op.kind === 'habit_checkin') {
        // Habit ticks have no log side effects (streaks are computed on read).
        const r = await upsertCheckin(c, user, op.id, op.data);
        results.push({ kind: op.kind, id: op.id, status: r.status, entity: r.entity });
        continue;
      }
      const r =
        op.kind === 'food_log'
          ? await upsertFoodLog(c, user, op.id, op.data, { skipEffects: ops.length > 1 })
          : op.kind === 'activity_log'
            ? await upsertActivityLog(c, user, op.id, op.data, { skipEffects: ops.length > 1 })
            : await upsertWeight(c, user, op.id, op.data, { skipEffects: ops.length > 1 });
      results.push({ kind: op.kind, id: op.id, status: r.status, entity: r.entity });
      if (r.status === 'applied') touchedDates.add(op.data.date);
    } catch (e) {
      results.push({ kind: op.kind, id: op.id, status: 'rejected', error: (e as Error).message });
    }
  }
  // Side effects once per batch, per touched day (streaks, facts, triggers for the newest log).
  if (ops.length > 1) {
    for (const date of [...touchedDates].sort()) await afterLogSaved(c, user, { kind: 'batch', id: `batch:${date}`, date, isNew: true, deleted: false, row: null });
  }
  return { results, cursor: c.clock.now().toISOString() };
}

export async function changesSince(c: Container, user: AuthUser, since: string | null, limit = 500): Promise<ChangesResponse> {
  const from = since ? new Date(since) : new Date(c.clock.now().getTime() - 7 * 86400_000);
  const [foods, acts, weights] = await Promise.all([
    c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, user.id), gt(s.foodLogs.serverUpdatedAt, from)), limit }),
    c.db.select({ log: s.activityLogs, type: s.activityTypes }).from(s.activityLogs).innerJoin(s.activityTypes, eq(s.activityTypes.id, s.activityLogs.typeId)).where(and(eq(s.activityLogs.userId, user.id), gt(s.activityLogs.serverUpdatedAt, from))).limit(limit),
    c.db.query.weightEntries.findMany({ where: and(eq(s.weightEntries.userId, user.id), gt(s.weightEntries.serverUpdatedAt, from)), limit }),
  ]);
  const images = await imageUrlMap(c, foods.map((f) => f.imageId));
  const all = [...foods.map((f) => f.serverUpdatedAt), ...acts.map((a) => a.log.serverUpdatedAt), ...weights.map((w) => w.serverUpdatedAt)];
  const cursor = all.length ? new Date(Math.max(...all.map((d) => d.getTime()))).toISOString() : (since ?? from.toISOString());
  return { foodLogs: foods.map((f) => foodLogDto(f, images)), activityLogs: acts.map((a) => activityLogDto(a.log, a.type)), weights: weights.map(weightDto), cursor };
}

export async function recentWeights(c: Container, userId: string, days: number, today: string) {
  return c.db.query.weightEntries.findMany({
    where: and(eq(s.weightEntries.userId, userId), isNull(s.weightEntries.deletedAt), sql`${s.weightEntries.date} >= ${addDays(today, -days)}`),
    orderBy: (t, { asc }) => [asc(t.date)],
  });
}

export async function getFoodLog(c: Container, userId: string, id: string) {
  const row = await c.db.query.foodLogs.findFirst({ where: and(eq(s.foodLogs.id, id), eq(s.foodLogs.userId, userId)) });
  if (!row) throw notFound('Log not found.');
  return foodLogDto(row, await imageUrlMap(c, [row.imageId]));
}

