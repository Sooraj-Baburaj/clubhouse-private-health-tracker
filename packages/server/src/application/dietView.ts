import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DietOptionDto, DietPlanSummary, DietResponse, LogOptionRequest, MealSlot, Nutrients, UpsertResult, FoodLogDto } from '@clubhouse/contracts';
import { addDays, weekdayOf, nutritionFor, openSlotsFrom, rankOptions, remainingOf, roundTotals, SLOT_ORDER, slotForTime, sumTotals, ZERO_TOTALS } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { initials } from '../lib/crypto';
import { notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { imageUrlMap, pick, type ImageUrls } from './images';
import { upsertFoodLog } from './logs';
import { loadProfile } from './profile';
import { effectiveTargets } from './targets';
import { getTeam } from './team';

type OptionRow = typeof s.dietMealOptions.$inferSelect;
type PlanRow = typeof s.dietPlans.$inferSelect;

const PREVIOUS_VIEWABLE_DAYS = 30;

export async function publishedPlanFor(c: Container, userId: string): Promise<PlanRow | null> {
  return (await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.userId, userId), eq(s.dietPlans.status, 'published')) })) ?? null;
}

export async function optionsFor(c: Container, planId: string): Promise<OptionRow[]> {
  return c.db.query.dietMealOptions.findMany({ where: eq(s.dietMealOptions.planId, planId), orderBy: (t, { asc }) => [asc(t.mealSlot), asc(t.sortOrder)] });
}

/** How many times the member logged each diet option (items carry the option id). */
export async function timesLoggedByOption(c: Container, userId: string): Promise<Map<string, number>> {
  const rows = await c.db.execute<{ oid: string; n: number }>(
    sql`select it->>'dietOptionId' as oid, count(distinct fl.id)::int as n
        from ${s.foodLogs} fl, jsonb_array_elements(fl.items) it
        where fl.user_id = ${userId} and fl.deleted_at is null and it->>'dietOptionId' is not null
        group by 1`,
  );
  return new Map(rows.map((r) => [r.oid, Number(r.n)]));
}

export async function feedbackFor(c: Container, userId: string) {
  const rows = await c.db.query.dietFeedback.findMany({ where: eq(s.dietFeedback.userId, userId) });
  return new Map(rows.map((r) => [r.optionName.toLowerCase(), r.reaction]));
}

export function optionDto(
  o: OptionRow,
  images: Map<string, ImageUrls>,
  extra: { fits: boolean; bestFit: boolean; reaction: string | undefined; timesLogged: number },
): DietOptionDto {
  return {
    id: o.id,
    planId: o.planId,
    mealSlot: o.mealSlot as MealSlot,
    dayType: o.dayType as DietOptionDto['dayType'],
    name: o.name,
    items: o.items.map((i) => ({ foodId: i.foodId, name: i.name, grams: i.grams, servings: i.servings, servingLabel: i.servingLabel, nutrition: i.nutrition, aiEstimate: !!i.aiEstimate })),
    nutrition: roundTotals(o.nutrition),
    prepNote: o.prepNote,
    imageUrl: pick(images, o.imageId).url,
    fits: extra.fits,
    bestFit: extra.bestFit,
    favourite: extra.reaction === 'favourite',
    notForMe: extra.reaction === 'dislike',
    timesLogged: extra.timesLogged,
  };
}

async function personRef(c: Container, id: string | null) {
  if (!id) return null;
  const u = await c.db.query.users.findFirst({ where: eq(s.users.id, id) });
  return u ? { id: u.id, name: u.displayName, initials: initials(u.displayName), avatarUrl: null } : null;
}

export async function planSummary(c: Container, p: PlanRow, options: OptionRow[]): Promise<DietPlanSummary> {
  return {
    id: p.id,
    name: p.name,
    version: p.version,
    note: p.note,
    publishedBy: await personRef(c, p.publishedBy ?? p.createdBy),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    effectiveFrom: p.effectiveFrom,
    aiGenerated: p.aiGenerated,
    reviewedBy: await personRef(c, p.reviewedBy),
    hasDayTypes: options.some((o) => o.dayType !== 'any'),
  };
}

/** Eaten so far and slots logged for a member-day. */
export async function dayIntake(c: Container, userId: string, date: string) {
  const foods = await c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.userId, userId), eq(s.foodLogs.date, date), isNull(s.foodLogs.deletedAt)) });
  return { eaten: roundTotals(sumTotals(foods.map((f) => f.totals))), loggedSlots: [...new Set(foods.map((f) => f.mealSlot as MealSlot))], foods };
}

/** Training day when a planned activity falls on this weekday or an activity is already logged. */
async function defaultDayType(c: Container, userId: string, date: string): Promise<'training' | 'rest'> {
  const acts = await c.db.select({ id: s.activityLogs.id }).from(s.activityLogs).where(and(eq(s.activityLogs.userId, userId), eq(s.activityLogs.date, date), isNull(s.activityLogs.deletedAt))).limit(1);
  if (acts.length) return 'training';
  const weekday = weekdayOf(date);
  const planned = await c.db
    .select({ id: s.activityPlanDays.itemId })
    .from(s.activityPlanDays)
    .innerJoin(s.activityPlanItems, eq(s.activityPlanItems.id, s.activityPlanDays.itemId))
    .innerJoin(s.activityPlans, eq(s.activityPlans.id, s.activityPlanItems.planId))
    .where(and(eq(s.activityPlans.userId, userId), eq(s.activityPlanDays.weekday, weekday), isNull(s.activityPlanItems.archivedAt)))
    .limit(1);
  return planned.length ? 'training' : 'rest';
}

/** Rank a plan's options per slot against what is left today (APP-DIET-03). */
export function rankPlan(options: OptionRow[], dayType: 'training' | 'rest', remaining: Nutrients, currentSlot: MealSlot, loggedSlots: MealSlot[]) {
  const open = openSlotsFrom(currentSlot, loggedSlots);
  const bySlot = new Map<MealSlot, { option: OptionRow; fits: boolean; bestFit: boolean }[]>();
  for (const slot of SLOT_ORDER) {
    const slotOptions = options.filter((o) => o.mealSlot === slot && (o.dayType === 'any' || o.dayType === dayType));
    const ranked = rankOptions(slot, slotOptions, remaining, open.length ? open : [slot]);
    bySlot.set(
      slot,
      ranked.map((r, i) => ({ option: r.option, fits: r.fits, bestFit: i === 0 && r.fits })),
    );
  }
  return bySlot;
}

async function suggestionsFor(c: Container, user: AuthUser, targets: Nutrients | null, labels: Record<MealSlot, { label: string }>): Promise<DietResponse['suggestions']> {
  // Frequently logged foods first, then a few verified staples per slot.
  const staples: Record<MealSlot, string[]> = {
    breakfast: ['poha', 'idli', 'oats', 'upma', 'boiled egg', 'dosa'],
    morning_snack: ['banana', 'apple', 'roasted chana', 'buttermilk', 'almonds'],
    lunch: ['dal', 'roti', 'rajma', 'chicken curry', 'curd rice', 'brown rice'],
    evening_snack: ['sprouts salad', 'makhana', 'peanuts', 'green tea', 'dhokla'],
    dinner: ['paneer bhurji', 'khichdi', 'grilled fish', 'mixed vegetable', 'chapati', 'moong dal'],
  };
  const out: NonNullable<DietResponse['suggestions']> = [];
  const allNames = Object.values(staples).flat();
  const rows = await c.db
    .select()
    .from(s.foodItems)
    .where(and(isNull(s.foodItems.teamId), isNull(s.foodItems.deletedAt), inArray(sql`lower(${s.foodItems.name})`, allNames)))
    .limit(200);
  const slotShare = { breakfast: 0.25, morning_snack: 0.1, lunch: 0.3, evening_snack: 0.1, dinner: 0.25 } as const;
  for (const slot of SLOT_ORDER) {
    const budget = targets ? targets.kcal * slotShare[slot] : null;
    const foods = rows
      .filter((r) => staples[slot].includes(r.name.toLowerCase()))
      .map((f) => {
        const serving = f.servingOptions.find((o) => o.label === f.defaultServing) ?? f.servingOptions.find((o) => o.label !== '100 g') ?? { label: '100 g', grams: 100 };
        const n = nutritionFor(f.per100g, serving.grams);
        return { id: f.id, name: f.name, servingLabel: serving.label, servingGrams: serving.grams, kcal: Math.round(n.kcal), protein: Math.round(n.protein) };
      })
      .filter((f, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === f.name.toLowerCase()) === i)
      .sort((a, b) => (budget ? Math.abs(a.kcal - budget) - Math.abs(b.kcal - budget) : b.protein - a.protein))
      .slice(0, 3);
    out.push({ slot, label: labels[slot].label, foods });
  }
  void user;
  return out;
}

export async function getDiet(c: Container, user: AuthUser, dateIn: string | undefined, dayTypeIn: 'training' | 'rest' | undefined): Promise<DietResponse> {
  const clock = memberClock(c, user.timezone);
  const date = dateIn && dateIn <= clock.today ? dateIn : clock.today;
  const team = await getTeam(c, user.teamId);
  const profile = await loadProfile(c, user.id);
  const eff = effectiveTargets(profile);
  const targets: Nutrients | null = eff ? { kcal: eff.kcal, protein: eff.protein, carbs: eff.carbs, fat: eff.fat, fibre: eff.fibre } : null;
  const { eaten, loggedSlots } = await dayIntake(c, user.id, date);
  const remaining = targets ? remainingOf(targets, eaten) : null;
  const plan = await publishedPlanFor(c, user.id);
  const dayType = dayTypeIn ?? (await defaultDayType(c, user.id, date));
  const labels = team.settings.mealSlots;
  const currentSlot = date === clock.today ? slotForTime(clock.localTime, labels) : 'breakfast';

  let previous: DietResponse['previous'] = null;
  let updatedBanner: DietResponse['updatedBanner'] = null;
  const slots: DietResponse['slots'] = [];
  if (plan) {
    const options = await optionsFor(c, plan.id);
    const [images, logged, feedback] = await Promise.all([imageUrlMap(c, options.map((o) => o.imageId)), timesLoggedByOption(c, user.id), feedbackFor(c, user.id)]);
    const ranked = rankPlan(options, dayType, remaining ?? ZERO_TOTALS, currentSlot, loggedSlots);
    for (const slot of SLOT_ORDER) {
      const list = ranked.get(slot) ?? [];
      slots.push({
        slot,
        label: labels[slot].label,
        logged: loggedSlots.includes(slot),
        options: list.map((r) => optionDto(r.option, images, { fits: r.fits, bestFit: r.bestFit, reaction: feedback.get(r.option.name.toLowerCase()), timesLogged: logged.get(r.option.id) ?? 0 })),
      });
    }
    if (plan.previousVersionId && plan.publishedAt) {
      const until = addDays(plan.publishedAt.toISOString().slice(0, 10), PREVIOUS_VIEWABLE_DAYS);
      const prev = await c.db.query.dietPlans.findFirst({ where: eq(s.dietPlans.id, plan.previousVersionId) });
      if (prev && until >= clock.today) previous = { id: prev.id, version: prev.version, publishedAt: prev.publishedAt?.toISOString() ?? null, viewableUntil: until };
      // APP-DIET-06: the "updated" banner shows for a week after an update.
      if (addDays(plan.publishedAt.toISOString().slice(0, 10), 7) >= clock.today) {
        const by = await personRef(c, plan.publishedBy ?? plan.createdBy);
        updatedBanner = { by: by?.name ?? 'Your admin', on: plan.publishedAt.toISOString(), note: plan.note };
      }
    }
  } else {
    for (const slot of SLOT_ORDER) slots.push({ slot, label: labels[slot].label, logged: loggedSlots.includes(slot), options: [] });
  }

  // Swap idea comes from today's cached AI summary (never generated here).
  let swapIdea: string | null = null;
  if (plan) {
    const cached = await c.db.query.aiSummaries.findFirst({ where: and(eq(s.aiSummaries.userId, user.id), eq(s.aiSummaries.feature, 'home.summary'), eq(s.aiSummaries.localDate, date)) });
    const idea = (cached?.output as { swapIdea?: string } | undefined)?.swapIdea;
    if (idea && !profile.aiOptOuts.summary) swapIdea = idea;
  }

  return {
    date,
    plan: plan ? await planSummary(c, plan, await optionsFor(c, plan.id)) : null,
    dayType,
    targets,
    remaining: remaining ? roundTotals({ ...remaining, kcal: remaining.kcal }) : null,
    slots,
    previous,
    updatedBanner,
    suggestions: plan ? null : await suggestionsFor(c, user, targets, labels),
    swapIdea,
  };
}

/** APP-DIET-06: read-only view of the previous plan version for 30 days after an update. */
export async function previousPlan(c: Container, user: AuthUser, planId: string): Promise<DietResponse> {
  const plan = await c.db.query.dietPlans.findFirst({ where: and(eq(s.dietPlans.id, planId), eq(s.dietPlans.userId, user.id)) });
  if (!plan) throw notFound('Plan not found.');
  const team = await getTeam(c, user.teamId);
  const clock = memberClock(c, user.timezone);
  const options = await optionsFor(c, plan.id);
  const images = await imageUrlMap(c, options.map((o) => o.imageId));
  const slots: DietResponse['slots'] = SLOT_ORDER.map((slot) => ({
    slot,
    label: team.settings.mealSlots[slot].label,
    logged: false,
    options: options.filter((o) => o.mealSlot === slot).map((o) => optionDto(o, images, { fits: false, bestFit: false, reaction: undefined, timesLogged: 0 })),
  }));
  return { date: clock.today, plan: await planSummary(c, plan, options), dayType: 'rest', targets: null, remaining: null, slots, previous: null, updatedBanner: null, suggestions: null, swapIdea: null };
}

/** APP-DIET-04: log a planned option (optionally with per-item portion factors) as a food log. */
export async function logOption(c: Container, user: AuthUser, optionId: string, input: LogOptionRequest): Promise<UpsertResult<FoodLogDto>> {
  const option = await c.db.query.dietMealOptions.findFirst({ where: eq(s.dietMealOptions.id, optionId) });
  if (!option) throw notFound('That option is no longer in your plan.');
  const plan = await c.db.query.dietPlans.findFirst({ where: eq(s.dietPlans.id, option.planId) });
  if (!plan || plan.userId !== user.id) throw notFound('That option is no longer in your plan.');
  const items = option.items.map((it, i) => {
    const f = input.portions?.[i] ?? 1;
    const n = it.nutrition;
    return {
      foodId: it.foodId,
      name: it.name,
      grams: Math.round(it.grams * f),
      servings: Math.round(it.servings * f * 100) / 100,
      servingLabel: it.servingLabel,
      nutrition: { kcal: n.kcal * f, protein: n.protein * f, carbs: n.carbs * f, fat: n.fat * f, fibre: n.fibre * f },
      source: 'diet' as const,
      dietOptionId: option.id,
      aiEstimate: !!it.aiEstimate,
      confidence: null,
    };
  }).filter((i) => i.grams > 0 || i.nutrition.kcal > 0);
  return upsertFoodLog(c, user, input.logId, {
    date: input.date,
    mealSlot: input.mealSlot ?? (option.mealSlot as MealSlot),
    loggedAt: input.loggedAt,
    items,
    imageId: null,
    clientUpdatedAt: c.clock.now().toISOString(),
  });
}

export async function optionFeedback(c: Container, user: AuthUser, optionId: string, reaction: 'favourite' | 'dislike' | null) {
  const option = await c.db.query.dietMealOptions.findFirst({ where: eq(s.dietMealOptions.id, optionId) });
  if (!option) throw notFound('Option not found.');
  const plan = await c.db.query.dietPlans.findFirst({ where: eq(s.dietPlans.id, option.planId) });
  if (!plan || plan.userId !== user.id) throw notFound('Option not found.');
  if (reaction === null) {
    await c.db.delete(s.dietFeedback).where(and(eq(s.dietFeedback.userId, user.id), eq(s.dietFeedback.optionName, option.name)));
  } else {
    await c.db
      .insert(s.dietFeedback)
      .values({ userId: user.id, optionName: option.name, optionId: option.id, reaction })
      .onConflictDoUpdate({ target: [s.dietFeedback.userId, s.dietFeedback.optionName], set: { reaction, optionId: option.id, updatedAt: c.clock.now() } });
  }
}

