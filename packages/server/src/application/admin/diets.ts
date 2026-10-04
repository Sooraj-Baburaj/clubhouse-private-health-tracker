import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  MEAL_SLOTS,
  type AdminDietListRow,
  type AdminDietOption,
  type AdminDietPlan,
  type BandDto,
  type BulkAssignRequest,
  type CreateDraftRequest,
  type DietDiff,
  type DietFeedbackView,
  type DraftWithAiRequest,
  type MealSlot,
  type Nutrients,
  type UpdatePlanRequest,
  type UpsertOptionRequest,
} from '@clubhouse/contracts';
import { addDays, allBands, localDateOf, nutritionFor, roundTotals, scaleFactor, SLOT_WEIGHTS, startOfLocalDay, ZERO_TOTALS, type NutrientTotals } from '@clubhouse/domain';
import { schema as s, type FoodLogItemJson } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, conflict, notFound, unprocessable } from '../../lib/errors';
import { matchFood } from '../foods';
import { imageUrlMap, pick } from '../images';
import { notifyUser } from '../notify';
import { effectiveTargets } from '../targets';
import { getTeam } from '../team';
import { getMember, logAudit, personMap, personOf, teamUsers, type Actor, type Tx } from './shared';

type PlanRow = typeof s.dietPlans.$inferSelect;
type OptionRow = typeof s.dietMealOptions.$inferSelect;

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', morning_snack: 'Morning snack', lunch: 'Lunch', evening_snack: 'Evening snack', dinner: 'Dinner' };
const sum = (xs: NutrientTotals[]): NutrientTotals => roundTotals(xs.reduce((a, x) => ({ kcal: a.kcal + x.kcal, protein: a.protein + x.protein, carbs: a.carbs + x.carbs, fat: a.fat + x.fat, fibre: a.fibre + x.fibre }), { ...ZERO_TOTALS }));
const scaleN = (n: NutrientTotals, f: number): NutrientTotals => roundTotals({ kcal: n.kcal * f, protein: n.protein * f, carbs: n.carbs * f, fat: n.fat * f, fibre: n.fibre * f });
const rationaleKey = (planId: string) => `diet.rationale:${planId}`;

async function teamPlan(c: Container, teamId: string, planId: string): Promise<PlanRow> {
  const p = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.id, planId), eq(s.dietPlans.teamId, teamId)) });
  if (!p) throw notFound('Diet plan not found.');
  return p;
}

function editable(p: PlanRow) {
  if (p.status === 'published') throw conflict('Published plans are read-only. Create a new draft to change it.', 'plan_published');
  if (p.status === 'archived') throw conflict('This version is archived.', 'plan_archived');
}

async function memberTargets(c: Container, userId: string | null): Promise<Nutrients | null> {
  if (!userId) return null;
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  const eff = p ? effectiveTargets(p) : null;
  return eff ? { kcal: eff.kcal, protein: eff.protein, carbs: eff.carbs, fat: eff.fat, fibre: eff.fibre } : null;
}

/** A typical day per day type: the average option of each slot (options for "any" count on every day type). */
function typicalDay(options: OptionRow[], dayType: 'training' | 'rest' | 'any'): NutrientTotals {
  const perSlot: NutrientTotals[] = [];
  for (const slot of MEAL_SLOTS) {
    const opts = options.filter((o) => o.mealSlot === slot && (o.dayType === 'any' || o.dayType === dayType));
    if (!opts.length) continue;
    perSlot.push(scaleN(sum(opts.map((o) => o.nutrition)), 1 / opts.length));
  }
  return sum(perSlot);
}

function slotWarnings(p: PlanRow, options: OptionRow[], targets: Nutrients | null): string[] {
  const out: string[] = [];
  for (const slot of MEAL_SLOTS) {
    const opts = options.filter((o) => o.mealSlot === slot);
    if (!opts.length) {
      out.push(`${SLOT_LABEL[slot]} has no options yet.`);
      continue;
    }
    if (targets) {
      const ideal = targets.kcal * SLOT_WEIGHTS[slot];
      for (const o of opts) {
        if (ideal > 0 && Math.abs(o.nutrition.kcal - ideal) / ideal > 0.35) out.push(`${SLOT_LABEL[slot]}: “${o.name}” is ${Math.round(o.nutrition.kcal)} kcal; about ${Math.round(ideal / 10) * 10} kcal fits this slot.`);
      }
    }
    const est = opts.reduce((a, o) => a + o.aiEstimateItems, 0);
    if (est) out.push(`${SLOT_LABEL[slot]}: ${est} item${est === 1 ? '' : 's'} use AI estimates — check the numbers or pick database foods.`);
  }
  if (p.aiGenerated) {
    const pending = MEAL_SLOTS.filter((sl) => options.some((o) => o.mealSlot === sl) && !p.reviewChecklist?.[sl]);
    if (pending.length) out.push(`Review ${pending.map((sl) => SLOT_LABEL[sl]).join(', ')} before publishing.`);
  }
  return out;
}

function reviewComplete(p: PlanRow, options: OptionRow[]) {
  if (!p.aiGenerated) return true;
  return MEAL_SLOTS.filter((sl) => options.some((o) => o.mealSlot === sl)).every((sl) => !!p.reviewChecklist?.[sl]);
}

async function optionStats(c: Container, userId: string | null, options: OptionRow[]) {
  const logged = new Map<string, number>();
  const fav = new Map<string, number>();
  const dis = new Map<string, number>();
  if (!userId || !options.length) return { logged, fav, dis };
  const rows = (await c.db.execute(sql`
    select item->>'dietOptionId' as oid, count(distinct fl.id)::int as n
    from ${s.foodLogs} fl, jsonb_array_elements(fl.items) item
    where fl.user_id = ${userId} and fl.deleted_at is null and item ? 'dietOptionId'
    group by 1`)) as unknown as { oid: string | null; n: number }[];
  for (const r of rows) if (r.oid) logged.set(r.oid, Number(r.n));
  const fb = await c.db.query.dietFeedback.findMany({ where: eq(s.dietFeedback.userId, userId) });
  for (const o of options) {
    const hits = fb.filter((f) => f.optionId === o.id || f.optionName === o.name);
    fav.set(o.id, hits.filter((f) => f.reaction === 'favourite').length);
    dis.set(o.id, hits.filter((f) => f.reaction === 'dislike').length);
  }
  return { logged, fav, dis };
}

export async function planDto(c: Container, p: PlanRow): Promise<AdminDietPlan> {
  const options = await c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, p.id), orderBy: [asc(s.dietMealOptions.mealSlot), asc(s.dietMealOptions.sortOrder)] });
  const [people, images, targets, stats, versions, rationale] = await Promise.all([
    personMap(c, [p.userId, p.reviewedBy]),
    imageUrlMap(c, options.map((o) => o.imageId)),
    memberTargets(c, p.userId),
    optionStats(c, p.userId, options),
    p.userId ? c.db.query.dietPlans.findMany({ where: eq(s.dietPlans.userId, p.userId), orderBy: [desc(s.dietPlans.version)] }) : Promise.resolve([p]),
    c.db.query.settingsKv.findFirst({ where: eq(s.settingsKv.key, rationaleKey(p.id)) }),
  ]);
  const team = await getTeam(c, p.teamId);
  const thresholds = team.settings.thresholds;
  const ordered = MEAL_SLOTS.flatMap((slot) => options.filter((o) => o.mealSlot === slot));
  const dayTypes: ('any' | 'training' | 'rest')[] = ['any', ...(['training', 'rest'] as const).filter((d) => options.some((o) => o.dayType === d))];
  const bandTargets = targets;
  return {
    id: p.id,
    userId: p.userId,
    person: personOf(people, p.userId),
    name: p.name,
    version: p.version,
    status: p.status as AdminDietPlan['status'],
    note: p.note,
    aiGenerated: p.aiGenerated,
    aiRationale: typeof rationale?.value === 'string' ? rationale.value : null,
    reviewChecklist: p.reviewChecklist ?? {},
    reviewComplete: reviewComplete(p, options),
    reviewedBy: personOf(people, p.reviewedBy),
    effectiveFrom: p.effectiveFrom,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    options: ordered.map(
      (o): AdminDietOption => ({
        id: o.id,
        mealSlot: o.mealSlot as MealSlot,
        dayType: o.dayType as AdminDietOption['dayType'],
        name: o.name,
        items: o.items.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, servings: i.servings, servingLabel: i.servingLabel, nutrition: i.nutrition, aiEstimate: !!i.aiEstimate })),
        nutrition: o.nutrition,
        prepNote: o.prepNote,
        // The builder shows option photos at 44–84 px, so the thumbnail is plenty.
        imageUrl: pick(images, o.imageId).thumbUrl,
        sortOrder: o.sortOrder,
        aiEstimateItems: o.aiEstimateItems,
        favourites: stats.fav.get(o.id) ?? 0,
        dislikes: stats.dis.get(o.id) ?? 0,
        timesLogged: stats.logged.get(o.id) ?? 0,
      }),
    ),
    targets,
    dayTotals: dayTypes.map((dayType) => {
      const totals = typicalDay(options, dayType);
      const bands: Record<string, BandDto> = {};
      if (bandTargets) for (const [k, b] of Object.entries(allBands(totals, bandTargets, thresholds, true))) bands[k] = { ...b, pct: Math.round(b.pct) };
      return { dayType, totals, bands };
    }),
    slotWarnings: slotWarnings(p, options, targets),
    versions: versions.map((v) => ({ id: v.id, version: v.version, status: v.status, publishedAt: v.publishedAt?.toISOString() ?? null, aiGenerated: v.aiGenerated })),
    isTemplate: p.userId == null,
  };
}

export async function getPlan(c: Container, a: Actor, planId: string) {
  return planDto(c, await teamPlan(c, a.user.teamId, planId));
}

function prefsSummary(p: typeof s.profiles.$inferSelect | undefined): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.dietPrefs.diet !== 'none') parts.push(p.dietPrefs.diet);
  if (p.dietPrefs.allergies.length) parts.push(`allergies: ${p.dietPrefs.allergies.join(', ')}`);
  if (p.dietPrefs.dislikes.length) parts.push(`dislikes: ${p.dietPrefs.dislikes.join(', ')}`);
  if (p.dietPrefs.cuisines.length) parts.push(p.dietPrefs.cuisines.join(', '));
  return parts.join(' · ');
}

export async function listDiets(c: Container, a: Actor): Promise<AdminDietListRow[]> {
  const users = await teamUsers(c, a.user.teamId, { activeOnly: true });
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const [profiles, plans, people] = await Promise.all([
    c.db.query.profiles.findMany({ where: inArray(s.profiles.userId, ids) }),
    c.db.query.dietPlans.findMany({ where: and(eq(s.dietPlans.teamId, a.user.teamId), inArray(s.dietPlans.userId, ids), inArray(s.dietPlans.status, ['published', 'draft'])), orderBy: [desc(s.dietPlans.updatedAt)] }),
    personMap(c, ids),
  ]);
  const publishedIds = plans.filter((p) => p.status === 'published').map((p) => p.id);
  const opts = publishedIds.length ? await c.db.query.dietMealOptions.findMany({ where: inArray(s.dietMealOptions.planId, publishedIds) }) : [];
  return users.map((u) => {
    const prof = profiles.find((p) => p.userId === u.id);
    const eff = prof ? effectiveTargets(prof) : null;
    const pub = plans.find((p) => p.userId === u.id && p.status === 'published');
    const draft = plans.find((p) => p.userId === u.id && p.status === 'draft');
    return {
      person: personOf(people, u.id)!,
      userId: u.id,
      targetKcal: eff?.kcal ?? null,
      published: pub ? { id: pub.id, name: pub.name, version: pub.version, publishedAt: pub.publishedAt?.toISOString() ?? null, aiGenerated: pub.aiGenerated, kcal: Math.round(typicalDay(opts.filter((o) => o.planId === pub.id), 'any').kcal) } : null,
      draft: draft ? { id: draft.id, name: draft.name, updatedAt: draft.updatedAt.toISOString() } : null,
      dietPrefs: prefsSummary(prof),
    };
  });
}

export async function templates(c: Container, a: Actor): Promise<AdminDietPlan[]> {
  const rows = await c.db.query.dietPlans.findMany({ where: and(eq(s.dietPlans.teamId, a.user.teamId), isNull(s.dietPlans.userId), ne(s.dietPlans.status, 'archived')), orderBy: [asc(s.dietPlans.name)] });
  return Promise.all(rows.map((r) => planDto(c, r)));
}

async function nextVersion(tx: Tx | Container['db'], userId: string) {
  const [r] = await tx.select({ v: sql<number>`coalesce(max(${s.dietPlans.version}), 0)::int` }).from(s.dietPlans).where(eq(s.dietPlans.userId, userId));
  return (r?.v ?? 0) + 1;
}

async function copyOptions(tx: Tx, fromPlanId: string, toPlanId: string, factor = 1) {
  const opts = await tx.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, fromPlanId) });
  if (!opts.length) return;
  await tx.insert(s.dietMealOptions).values(
    opts.map((o) => {
      const items = factor === 1 ? o.items : o.items.map((i) => ({ ...i, grams: Math.round(i.grams * factor), nutrition: scaleN(i.nutrition, factor) }));
      return { planId: toPlanId, mealSlot: o.mealSlot, dayType: o.dayType, name: o.name, items, nutrition: factor === 1 ? o.nutrition : sum(items.map((i) => i.nutrition)), prepNote: o.prepNote, imageId: o.imageId, sortOrder: o.sortOrder, aiEstimateItems: o.aiEstimateItems };
    }),
  );
}

async function assertNoDraft(c: Container, userId: string) {
  const d = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.userId, userId), eq(s.dietPlans.status, 'draft')) });
  if (d) throw conflict('This member already has a draft. Open it, or delete it before starting a new one.', 'draft_exists');
}

export async function createDraft(c: Container, a: Actor, input: z.infer<typeof CreateDraftRequest>) {
  const teamId = a.user.teamId;
  let targetKcal: number | null = null;
  let published: PlanRow | undefined;
  if (input.userId) {
    const u = await getMember(c, teamId, input.userId);
    await assertNoDraft(c, u.id);
    targetKcal = (await memberTargets(c, u.id))?.kcal ?? null;
    published = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.userId, u.id), eq(s.dietPlans.status, 'published')) });
  }
  let source: PlanRow | undefined;
  if (input.startFrom === 'current') {
    if (!input.userId) throw badRequest('Templates have no current plan to start from.', 'bad_start');
    if (!published) throw unprocessable('This member has no published plan yet. Start blank or from a template.', 'no_published_plan');
    source = published;
  } else if (input.startFrom === 'copy' || input.startFrom === 'template') {
    if (!input.sourcePlanId) throw badRequest('Pick the plan to start from.', 'source_required', { sourcePlanId: 'Required' });
    source = await teamPlan(c, teamId, input.sourcePlanId);
    if (input.startFrom === 'template' && source.userId) throw badRequest('That plan is not a template.', 'not_template');
  }
  let factor = 1;
  if (source && input.startFrom === 'template' && targetKcal) {
    const srcOpts = await c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, source.id) });
    factor = scaleFactor(typicalDay(srcOpts, 'any').kcal, targetKcal);
  }
  const plan = await c.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.dietPlans)
      .values({
        teamId,
        userId: input.userId,
        name: input.name ?? source?.name ?? (input.userId ? 'Diet plan' : 'New template'),
        version: input.userId ? await nextVersion(tx, input.userId) : 1,
        status: 'draft',
        aiGenerated: false,
        reviewChecklist: {},
        createdBy: a.user.id,
        previousVersionId: published?.id ?? null,
        targetKcal,
      })
      .returning();
    if (source) await copyOptions(tx, source.id, row!.id, factor);
    return row!;
  });
  await logAudit(c, a, { action: 'diet.create_draft', targetType: 'diet_plan', targetId: plan.id, memberId: input.userId, after: { name: plan.name, version: plan.version, startFrom: input.startFrom, sourcePlanId: source?.id ?? null, scale: factor } });
  return planDto(c, plan);
}

export async function updatePlan(c: Container, a: Actor, planId: string, input: z.infer<typeof UpdatePlanRequest>) {
  const p = await teamPlan(c, a.user.teamId, planId);
  if (p.status === 'archived') throw conflict('This version is archived.', 'plan_archived');
  const patch: Partial<typeof s.dietPlans.$inferInsert> = { updatedAt: c.clock.now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.note !== undefined) patch.note = input.note;
  if (input.effectiveFrom !== undefined) patch.effectiveFrom = input.effectiveFrom;
  await c.db.update(s.dietPlans).set(patch).where(eq(s.dietPlans.id, p.id));
  await logAudit(c, a, { action: 'diet.update', targetType: 'diet_plan', targetId: p.id, memberId: p.userId, before: { name: p.name, note: p.note, effectiveFrom: p.effectiveFrom }, after: input });
  return getPlan(c, a, planId);
}

export async function deletePlan(c: Container, a: Actor, planId: string) {
  const p = await teamPlan(c, a.user.teamId, planId);
  if (p.status === 'published' && p.userId) throw conflict('A published plan can’t be deleted. Publish a new version instead.', 'plan_published');
  await c.db.delete(s.dietPlans).where(eq(s.dietPlans.id, p.id));
  await c.db.delete(s.settingsKv).where(eq(s.settingsKv.key, rationaleKey(p.id)));
  await logAudit(c, a, { action: 'diet.delete', targetType: 'diet_plan', targetId: p.id, memberId: p.userId, before: { name: p.name, version: p.version, status: p.status } });
  return { ok: true as const };
}

async function buildItems(c: Container, items: z.infer<typeof UpsertOptionRequest>['items']): Promise<FoodLogItemJson[]> {
  const ids = items.map((i) => i.foodId).filter((x): x is string => !!x);
  const foods = ids.length ? await c.db.query.foodItems.findMany({ where: inArray(s.foodItems.id, [...new Set(ids)]) }) : [];
  return items.map((i) => {
    const food = i.foodId ? foods.find((f) => f.id === i.foodId) : undefined;
    if (i.foodId && !food) throw badRequest(`Food for “${i.name}” was not found.`, 'bad_food');
    const nutrition = i.nutrition ?? (food ? roundTotals(nutritionFor(food.per100g, i.grams)) : null);
    if (!nutrition) throw unprocessable(`Pick a food or enter nutrition for “${i.name}”.`, 'nutrition_required');
    return {
      foodId: i.foodId,
      name: i.name,
      grams: i.grams,
      servings: i.servings,
      servingLabel: i.servingLabel ?? null,
      nutrition,
      source: 'diet' as const,
      aiEstimate: i.aiEstimate ?? (!food || food.source === 'ai'),
      tags: food?.tags ?? [],
    };
  });
}

export async function addOption(c: Container, a: Actor, planId: string, input: z.infer<typeof UpsertOptionRequest>) {
  const p = await teamPlan(c, a.user.teamId, planId);
  editable(p);
  const items = await buildItems(c, input.items);
  const [{ n } = { n: 0 }] = await c.db.select({ n: sql<number>`count(*)::int` }).from(s.dietMealOptions).where(and(eq(s.dietMealOptions.planId, p.id), eq(s.dietMealOptions.mealSlot, input.mealSlot)));
  if (n >= 8) throw unprocessable('A slot can have at most 8 options.', 'too_many_options');
  await keepOptionImage(c, a.user.teamId, input.imageId);
  const [row] = await c.db
    .insert(s.dietMealOptions)
    .values({ planId: p.id, mealSlot: input.mealSlot, dayType: input.dayType, name: input.name, items, nutrition: sum(items.map((i) => i.nutrition)), prepNote: input.prepNote ?? null, imageId: input.imageId ?? null, sortOrder: input.sortOrder ?? n, aiEstimateItems: items.filter((i) => i.aiEstimate).length })
    .returning();
  await c.db.update(s.dietPlans).set({ updatedAt: c.clock.now() }).where(eq(s.dietPlans.id, p.id));
  await logAudit(c, a, { action: 'diet.option_add', targetType: 'diet_option', targetId: row!.id, memberId: p.userId, after: { planId: p.id, slot: input.mealSlot, name: input.name, kcal: row!.nutrition.kcal } });
  return getPlan(c, a, planId);
}

/** Option photos stay for as long as a plan uses them; only member photos expire (SYS-MEDIA-06). */
async function keepOptionImage(c: Container, teamId: string, imageId: string | null | undefined) {
  if (!imageId) return;
  await c.db.update(s.images).set({ kind: 'diet', expiresAt: null }).where(and(eq(s.images.id, imageId), eq(s.images.teamId, teamId), isNull(s.images.purgedAt)));
}

async function teamOption(c: Container, planId: string, optionId: string) {
  const o = await c.db.query.dietMealOptions.findFirst({ where: and(eq(s.dietMealOptions.id, optionId), eq(s.dietMealOptions.planId, planId)) });
  if (!o) throw notFound('Option not found.');
  return o;
}

export async function updateOption(c: Container, a: Actor, planId: string, optionId: string, input: z.infer<typeof UpsertOptionRequest>) {
  const p = await teamPlan(c, a.user.teamId, planId);
  editable(p);
  const o = await teamOption(c, p.id, optionId);
  const items = await buildItems(c, input.items);
  await keepOptionImage(c, a.user.teamId, input.imageId);
  await c.db
    .update(s.dietMealOptions)
    .set({ mealSlot: input.mealSlot, dayType: input.dayType, name: input.name, items, nutrition: sum(items.map((i) => i.nutrition)), prepNote: input.prepNote ?? null, imageId: input.imageId !== undefined ? input.imageId : o.imageId, sortOrder: input.sortOrder ?? o.sortOrder, aiEstimateItems: items.filter((i) => i.aiEstimate).length })
    .where(eq(s.dietMealOptions.id, o.id));
  await c.db.update(s.dietPlans).set({ updatedAt: c.clock.now() }).where(eq(s.dietPlans.id, p.id));
  await logAudit(c, a, { action: 'diet.option_update', targetType: 'diet_option', targetId: o.id, memberId: p.userId, before: { name: o.name, slot: o.mealSlot, kcal: o.nutrition.kcal }, after: { name: input.name, slot: input.mealSlot, kcal: sum(items.map((i) => i.nutrition)).kcal } });
  return getPlan(c, a, planId);
}

export async function deleteOption(c: Container, a: Actor, planId: string, optionId: string) {
  const p = await teamPlan(c, a.user.teamId, planId);
  editable(p);
  const o = await teamOption(c, p.id, optionId);
  await c.db.delete(s.dietMealOptions).where(eq(s.dietMealOptions.id, o.id));
  await c.db.update(s.dietPlans).set({ updatedAt: c.clock.now() }).where(eq(s.dietPlans.id, p.id));
  await logAudit(c, a, { action: 'diet.option_delete', targetType: 'diet_option', targetId: o.id, memberId: p.userId, before: { name: o.name, slot: o.mealSlot } });
  return getPlan(c, a, planId);
}

/** ADM-DIET-12: an AI draft needs every slot opened before it can be published. */
export async function reviewSlot(c: Container, a: Actor, planId: string, slot: MealSlot) {
  const p = await teamPlan(c, a.user.teamId, planId);
  editable(p);
  await c.db.update(s.dietPlans).set({ reviewChecklist: { ...(p.reviewChecklist ?? {}), [slot]: true }, reviewedBy: a.user.id, updatedAt: c.clock.now() }).where(eq(s.dietPlans.id, p.id));
  return getPlan(c, a, planId);
}

async function publishRow(c: Container, a: Actor, p: PlanRow, note: string | null) {
  const now = c.clock.now();
  const member = await getMember(c, a.user.teamId, p.userId!);
  const team = await getTeam(c, a.user.teamId);
  const today = localDateOf(now, member.timezone || team.timezone);
  const previous = await c.db.transaction(async (tx) => {
    const current = await tx.select().from(s.dietPlans).where(and(eq(s.dietPlans.userId, p.userId!), eq(s.dietPlans.status, 'published'))).for('update');
    if (current.length) await tx.update(s.dietPlans).set({ status: 'archived', updatedAt: now }).where(inArray(s.dietPlans.id, current.map((x) => x.id)));
    await tx
      .update(s.dietPlans)
      .set({ status: 'published', note, publishedAt: now, publishedBy: a.user.id, effectiveFrom: p.effectiveFrom ?? today, previousVersionId: current[0]?.id ?? p.previousVersionId, updatedAt: now })
      .where(eq(s.dietPlans.id, p.id));
    return current[0] ?? null;
  });
  await notifyUser(c, member.id, {
    type: 'plan_updated',
    title: 'Your diet plan was updated',
    body: note ? note.slice(0, 160) : `${a.user.displayName} published a new version of your plan.`,
    url: '/diet',
    tag: 'plan_updated',
    dedupeKey: `diet_publish:${p.id}`,
  });
  return previous;
}

export async function publish(c: Container, a: Actor, planId: string, note: string | null) {
  const p = await teamPlan(c, a.user.teamId, planId);
  if (!p.userId) throw badRequest('Templates aren’t published. Assign the template to members instead.', 'template_publish');
  if (p.status !== 'draft') throw conflict('Only drafts can be published.', 'not_draft');
  const options = await c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, p.id) });
  if (!options.length) throw unprocessable('Add at least one option before publishing.', 'empty_plan');
  if (!reviewComplete(p, options)) throw unprocessable('Open every slot of this AI draft to review it before publishing.', 'review_incomplete');
  const previous = await publishRow(c, a, p, note);
  await logAudit(c, a, { action: 'diet.publish', targetType: 'diet_plan', targetId: p.id, memberId: p.userId, before: previous ? { publishedPlanId: previous.id, version: previous.version } : null, after: { planId: p.id, version: p.version, note } });
  return getPlan(c, a, planId);
}

export async function saveAsTemplate(c: Container, a: Actor, planId: string, name: string) {
  const p = await teamPlan(c, a.user.teamId, planId);
  const tpl = await c.db.transaction(async (tx) => {
    const [row] = await tx.insert(s.dietPlans).values({ teamId: a.user.teamId, userId: null, name, version: 1, status: 'draft', reviewChecklist: {}, createdBy: a.user.id, targetKcal: p.targetKcal }).returning();
    await copyOptions(tx, p.id, row!.id);
    return row!;
  });
  await logAudit(c, a, { action: 'diet.save_template', targetType: 'diet_plan', targetId: tpl.id, after: { name, fromPlanId: p.id } });
  return planDto(c, tpl);
}

const describe = (o: OptionRow) => `${Math.round(o.nutrition.kcal)} kcal · ${o.items.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(', ')}`;

/** What changed going from `otherId` to `planId`, keyed by slot + option name. */
export async function diff(c: Container, a: Actor, planId: string, otherId: string): Promise<DietDiff> {
  const [p, o] = await Promise.all([teamPlan(c, a.user.teamId, planId), teamPlan(c, a.user.teamId, otherId)]);
  const [pOpts, oOpts] = await Promise.all([c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, p.id) }), c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, o.id) })]);
  const key = (x: OptionRow) => `${x.mealSlot}|${x.name.trim().toLowerCase()}`;
  const oMap = new Map(oOpts.map((x) => [key(x), x]));
  const pMap = new Map(pOpts.map((x) => [key(x), x]));
  const out: DietDiff = { added: [], removed: [], changed: [] };
  for (const x of pOpts) {
    const prev = oMap.get(key(x));
    if (!prev) out.added.push({ slot: x.mealSlot, name: x.name });
    else if (describe(prev) !== describe(x) || prev.dayType !== x.dayType) out.changed.push({ slot: x.mealSlot, name: x.name, from: describe(prev), to: describe(x) });
  }
  for (const x of oOpts) if (!pMap.has(key(x))) out.removed.push({ slot: x.mealSlot, name: x.name });
  return out;
}

/** ADM-DIET-10: "Draft with AI" through the gateway; items that match the food database use its numbers. */
export async function draftWithAi(c: Container, a: Actor, input: z.infer<typeof DraftWithAiRequest>) {
  const member = await getMember(c, a.user.teamId, input.userId);
  const profile = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, member.id) });
  const eff = profile ? effectiveTargets(profile) : null;
  if (!profile || !eff) throw unprocessable('This member needs targets first (finish onboarding or set them under Goals).', 'no_targets');
  await assertNoDraft(c, member.id);
  const feedback = await c.db.query.dietFeedback.findMany({ where: eq(s.dietFeedback.userId, member.id) });
  const known = await c.db
    .select({ name: s.foodItems.name })
    .from(s.foodItems)
    .where(and(isNull(s.foodItems.deletedAt), isNull(s.foodItems.mergedIntoId), eq(s.foodItems.verified, true), or(isNull(s.foodItems.teamId), eq(s.foodItems.teamId, a.user.teamId))))
    .orderBy(asc(s.foodItems.name))
    .limit(400);
  const targets = { kcal: eff.kcal, protein: eff.protein, carbs: eff.carbs, fat: eff.fat, fibre: eff.fibre };
  const perSlotKcal = Object.fromEntries(MEAL_SLOTS.map((sl) => [sl, Math.round(eff.kcal * SLOT_WEIGHTS[sl])])) as Record<MealSlot, number>;
  const now = c.clock.now();
  const adminToday = localDateOf(now, a.user.timezone);
  const res = await c.ai.callFeature(
    'diet.draft',
    { teamId: a.user.teamId, userId: a.user.id, dayStart: startOfLocalDay(adminToday, a.user.timezone), entity: { type: 'user', id: member.id } },
    {
      memberFirstName: member.displayName.split(/\s+/)[0] ?? member.displayName,
      targets,
      goal: (profile.goalType as 'lose' | 'maintain' | 'gain' | null) ?? 'maintain',
      perSlotKcal,
      optionsPerSlot: input.optionsPerSlot,
      diet: profile.dietPrefs.diet,
      allergies: profile.dietPrefs.allergies,
      dislikes: profile.dietPrefs.dislikes,
      cuisines: profile.dietPrefs.cuisines,
      favourites: feedback.filter((f) => f.reaction === 'favourite').map((f) => f.optionName).slice(0, 30),
      notForMe: feedback.filter((f) => f.reaction === 'dislike').map((f) => f.optionName).slice(0, 30),
      brief: input.brief,
      knownFoods: known.map((k) => k.name),
    },
  );
  if (!res.ok) {
    const msg = res.reason === 'disabled' ? 'AI drafting is switched off. Start from blank, a template or another member’s plan instead.' : `${res.message} Start from blank or a template instead.`;
    throw unprocessable(msg, 'ai_unavailable');
  }
  const draft = res.data;
  const optionRows: Omit<typeof s.dietMealOptions.$inferInsert, 'planId'>[] = [];
  for (const slot of draft.slots) {
    let order = 0;
    for (const opt of slot.options) {
      const items: FoodLogItemJson[] = [];
      for (const it of opt.items) {
        const m = await matchFood(c, a.user, it.matchHint || it.name);
        const nutrition = m ? roundTotals(nutritionFor(m.food.per100g, it.grams)) : roundTotals(nutritionFor(it.estimatePer100g, it.grams));
        items.push({ foodId: m?.food.id ?? null, name: m?.food.name ?? it.name, grams: Math.round(it.grams), servings: 1, servingLabel: it.householdMeasure || null, nutrition, source: 'diet', aiEstimate: !m, tags: m?.food.tags ?? [] });
      }
      if (!items.length) continue;
      optionRows.push({ mealSlot: slot.slot, dayType: 'any', name: opt.name, items, nutrition: sum(items.map((i) => i.nutrition)), prepNote: opt.prepNote || null, sortOrder: order++, aiEstimateItems: items.filter((i) => i.aiEstimate).length });
    }
  }
  const published = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.userId, member.id), eq(s.dietPlans.status, 'published')) });
  const plan = await c.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.dietPlans)
      .values({ teamId: a.user.teamId, userId: member.id, name: draft.planName, version: await nextVersion(tx, member.id), status: 'draft', aiGenerated: true, aiCallId: res.callId, reviewChecklist: {}, createdBy: a.user.id, previousVersionId: published?.id ?? null, targetKcal: eff.kcal })
      .returning();
    if (optionRows.length) await tx.insert(s.dietMealOptions).values(optionRows.map((o) => ({ ...o, planId: row!.id })));
    await tx.insert(s.settingsKv).values({ key: rationaleKey(row!.id), value: draft.rationale, updatedBy: a.user.id }).onConflictDoUpdate({ target: s.settingsKv.key, set: { value: draft.rationale, updatedAt: now } });
    return row!;
  });
  await c.db.update(s.aiCalls).set({ entityType: 'diet_plan', entityId: plan.id }).where(eq(s.aiCalls.id, res.callId));
  await logAudit(c, a, { action: 'diet.ai_draft', targetType: 'diet_plan', targetId: plan.id, memberId: member.id, after: { name: plan.name, options: optionRows.length, aiCallId: res.callId, brief: input.brief } });
  return planDto(c, plan);
}

export async function feedback(c: Container, a: Actor, userId: string): Promise<DietFeedbackView> {
  const u = await getMember(c, a.user.teamId, userId);
  const pub = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.userId, u.id), eq(s.dietPlans.status, 'published')) });
  const options = pub ? await c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, pub.id), orderBy: [asc(s.dietMealOptions.sortOrder)] }) : [];
  const stats = await optionStats(c, u.id, options);
  const team = await getTeam(c, a.user.teamId);
  const today = localDateOf(c.clock.now(), u.timezone || team.timezone);
  const logs = await c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, u.id), isNull(s.foodLogs.deletedAt), sql`${s.foodLogs.date} >= ${addDays(today, -29)}`), columns: { items: true, date: true } });
  let fromPlan = 0;
  let elsewhere = 0;
  for (const l of logs) {
    if (l.items.some((i) => i.source === 'diet' || !!i.dietOptionId)) fromPlan++;
    else elsewhere++;
  }
  return {
    options: MEAL_SLOTS.flatMap((slot) => options.filter((o) => o.mealSlot === slot)).map((o) => ({ name: o.name, slot: o.mealSlot, favourites: stats.fav.get(o.id) ?? 0, dislikes: stats.dis.get(o.id) ?? 0, timesLogged: stats.logged.get(o.id) ?? 0 })),
    adherence: { fromPlan, elsewhere, pct: fromPlan + elsewhere ? Math.round((fromPlan / (fromPlan + elsewhere)) * 100) : 0, days: new Set(logs.map((l) => l.date)).size },
  };
}

/** ADM-DIET-09: copy a template to many members, portions scaled to each member's calories; optionally publish. */
export async function bulkAssign(c: Container, a: Actor, input: z.infer<typeof BulkAssignRequest>) {
  const tpl = await teamPlan(c, a.user.teamId, input.templateId);
  if (tpl.userId) throw badRequest('Pick a template.', 'not_template');
  const tplOpts = await c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, tpl.id) });
  if (!tplOpts.length) throw unprocessable('That template has no options yet.', 'empty_template');
  const tplKcal = typicalDay(tplOpts, 'any').kcal;
  let created = 0;
  const skipped: string[] = [];
  for (const userId of [...new Set(input.userIds)]) {
    const u = await c.db.query.users.findFirst({ where: and(eq(s.users.id, userId), eq(s.users.teamId, a.user.teamId)) });
    if (!u || u.status !== 'active') {
      skipped.push(userId);
      continue;
    }
    const kcal = (await memberTargets(c, u.id))?.kcal ?? null;
    const factor = kcal ? scaleFactor(tplKcal, kcal) : 1;
    const published = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.userId, u.id), eq(s.dietPlans.status, 'published')) });
    const plan = await c.db.transaction(async (tx) => {
      await tx.update(s.dietPlans).set({ status: 'archived', updatedAt: c.clock.now() }).where(and(eq(s.dietPlans.userId, u.id), eq(s.dietPlans.status, 'draft')));
      const [row] = await tx
        .insert(s.dietPlans)
        .values({ teamId: a.user.teamId, userId: u.id, name: tpl.name, version: await nextVersion(tx, u.id), status: 'draft', reviewChecklist: {}, createdBy: a.user.id, previousVersionId: published?.id ?? null, targetKcal: kcal, note: input.note ?? null })
        .returning();
      await copyOptions(tx, tpl.id, row!.id, factor);
      return row!;
    });
    if (input.publish) await publishRow(c, a, plan, input.note ?? null);
    created++;
  }
  await logAudit(c, a, { action: 'diet.bulk_assign', targetType: 'diet_plan', targetId: tpl.id, after: { templateId: tpl.id, userIds: input.userIds, publish: input.publish, created, skipped } });
  return { created };
}
