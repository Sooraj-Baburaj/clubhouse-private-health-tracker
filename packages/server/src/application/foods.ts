import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { CreateFoodRequest, CreateRecipeRequest, FoodSearchResponse, FoodSearchResult, RecipeDto, UsualFood } from '@clubhouse/contracts';
import { normaliseName, nutritionFor, per100gFromServing, roundTotals, type Per100g } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest, notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';

type FoodRow = typeof s.foodItems.$inferSelect;
type UsageRow = typeof s.foodUsage.$inferSelect;

function servingFor(f: FoodRow, usage?: Pick<UsageRow, 'lastGrams' | 'lastServingLabel'> | null) {
  if (usage?.lastGrams) return { label: usage.lastServingLabel ?? `${Math.round(usage.lastGrams)} g`, grams: usage.lastGrams };
  const def = f.servingOptions.find((o) => o.label === f.defaultServing) ?? f.servingOptions.find((o) => o.label !== '100 g') ?? f.servingOptions[0];
  return def ?? { label: '100 g', grams: 100 };
}

export function toSearchResult(f: FoodRow, userId: string, group: FoodSearchResult['group'], usage?: UsageRow | null): FoodSearchResult {
  const serving = servingFor(f, usage);
  const options = f.servingOptions.length ? f.servingOptions : [{ label: '100 g', grams: 100 }];
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    group,
    verified: f.verified,
    aiEstimate: f.source === 'ai',
    servingLabel: serving.label,
    servingGrams: serving.grams,
    perServing: roundTotals(nutritionFor(f.per100g, serving.grams)),
    per100g: f.per100g,
    servingOptions: options,
    tags: f.tags,
    favourite: !!usage?.favourite,
  };
}

/** Foods a member may see: global seed/USDA, their team's verified foods, and their own. */
const visibleTo = (user: AuthUser) =>
  sql`${s.foodItems.deletedAt} is null and ${s.foodItems.mergedIntoId} is null and (${s.foodItems.teamId} is null or (${s.foodItems.teamId} = ${user.teamId} and ${s.foodItems.verified} = true) or ${s.foodItems.ownerId} = ${user.id})`;

/**
 * SYS-DB-02 / APP-HOME-25: typo-tolerant search (pg_trgm word similarity) ranked by recents, favourites,
 * team-verified, then global, with relevance breaking ties within a group.
 */
export async function searchFoods(c: Container, user: AuthUser, qRaw: string, limit = 25): Promise<FoodSearchResponse> {
  const t0 = performance.now();
  const q = normaliseName(qRaw);
  if (!q) {
    const usuals = await recentFoods(c, user, limit);
    return { query: qRaw, results: usuals, tookMs: Math.round(performance.now() - t0) };
  }
  const trgm = await c.trgmSchema();
  const ws = sql.raw(`"${trgm}".word_similarity`);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const prefix = `${q.replace(/[%_]/g, '')}%`;
  const rows = await c.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', '0.3', true)`);
    return tx
      .select({
        food: s.foodItems,
        usage: s.foodUsage,
        sim: sql<number>`greatest(${ws}(${q}, ${s.foodItems.searchText}), case when ${s.foodItems.searchText} like ${prefix} then 1.0 when ${s.foodItems.searchText} like ${like} then 0.8 else 0 end)`.as('sim'),
      })
      .from(s.foodItems)
      .leftJoin(s.foodUsage, and(eq(s.foodUsage.foodId, s.foodItems.id), eq(s.foodUsage.userId, user.id)))
      .where(sql`${visibleTo(user)} and (${q} ${sql.raw(`OPERATOR("${trgm}".<%)`)} ${s.foodItems.searchText} or ${s.foodItems.searchText} like ${like})`)
      .orderBy(sql`sim desc`, s.foodItems.name)
      .limit(80);
  });
  const now = c.clock.now().getTime();
  const scored = rows.map((r) => {
    const recent = !!r.usage?.lastUsedAt && now - r.usage.lastUsedAt.getTime() < 60 * 86400_000;
    const group: FoodSearchResult['group'] = recent ? 'recent' : r.usage?.favourite ? 'favourite' : r.food.ownerId === user.id ? 'mine' : r.food.teamId ? 'team' : 'global';
    const boost = { recent: 0.35, favourite: 0.3, mine: 0.2, team: 0.2, global: 0 }[group];
    const verifiedBoost = r.food.verified ? 0.05 : 0;
    return { r, group, score: Number(r.sim) + boost + verifiedBoost };
  });
  scored.sort((a, b) => b.score - a.score || a.r.food.name.length - b.r.food.name.length);
  const results = scored.slice(0, limit).map(({ r, group }) => toSearchResult(r.food, user.id, group, r.usage));
  return { query: qRaw, results, tookMs: Math.round(performance.now() - t0) };
}

export async function recentFoods(c: Container, user: AuthUser, limit = 20): Promise<FoodSearchResult[]> {
  const rows = await c.db
    .select({ food: s.foodItems, usage: s.foodUsage })
    .from(s.foodUsage)
    .innerJoin(s.foodItems, eq(s.foodItems.id, s.foodUsage.foodId))
    .where(and(eq(s.foodUsage.userId, user.id), isNull(s.foodItems.deletedAt)))
    .orderBy(desc(s.foodUsage.favourite), desc(s.foodUsage.lastUsedAt))
    .limit(limit);
  return rows.map((r) => toSearchResult(r.food, user.id, r.usage.favourite ? 'favourite' : 'recent', r.usage));
}

/** "Your usuals": the most-logged foods of the last 30 days (design: chips on the search-first screen). */
export async function usualFoods(c: Container, user: AuthUser): Promise<UsualFood[]> {
  const since = new Date(c.clock.now().getTime() - 30 * 86400_000);
  const rows = await c.db
    .select({ food: s.foodItems, usage: s.foodUsage })
    .from(s.foodUsage)
    .innerJoin(s.foodItems, eq(s.foodItems.id, s.foodUsage.foodId))
    .where(and(eq(s.foodUsage.userId, user.id), gt(s.foodUsage.lastUsedAt, since), isNull(s.foodItems.deletedAt)))
    .orderBy(desc(s.foodUsage.uses))
    .limit(6);
  return rows.map(({ food, usage }) => {
    const sv = servingFor(food, usage);
    return { id: food.id, name: food.name, servingLabel: sv.label, servingGrams: sv.grams, kcal: Math.round(nutritionFor(food.per100g, sv.grams).kcal) };
  });
}

export async function getFood(c: Container, user: AuthUser, id: string) {
  const row = await c.db.select({ food: s.foodItems, usage: s.foodUsage }).from(s.foodItems).leftJoin(s.foodUsage, and(eq(s.foodUsage.foodId, s.foodItems.id), eq(s.foodUsage.userId, user.id))).where(and(eq(s.foodItems.id, id), visibleTo(user))).limit(1);
  const r = row[0];
  if (!r) throw notFound('Food not found.');
  return { ...toSearchResult(r.food, user.id, r.food.ownerId === user.id ? 'mine' : r.food.teamId ? 'team' : 'global', r.usage), category: r.food.category, source: r.food.source, createdByMe: r.food.createdBy === user.id };
}

/** SYS-DB-03: members create private custom foods (per serving → stored per 100 g). */
export async function createFood(c: Container, user: AuthUser, input: CreateFoodRequest) {
  const per100g = per100gFromServing(input.perServing, input.servingGrams);
  const options = [{ label: input.servingLabel, grams: input.servingGrams }];
  if (input.servingGrams !== 100) options.push({ label: '100 g', grams: 100 });
  const [row] = await c.db
    .insert(s.foodItems)
    .values({
      teamId: user.teamId,
      ownerId: user.id,
      name: input.name,
      brand: input.brand ?? null,
      searchText: normaliseName([input.name, input.brand ?? ''].join(' ')),
      per100g,
      servingOptions: options,
      defaultServing: input.servingLabel,
      tags: input.tags ?? [],
      veg: input.veg ?? null,
      source: 'member',
      verified: false,
      createdBy: user.id,
    })
    .returning();
  return toSearchResult(row!, user.id, 'mine', null);
}

export async function toggleFavourite(c: Container, user: AuthUser, foodId: string, favourite: boolean) {
  await c.db
    .insert(s.foodUsage)
    .values({ userId: user.id, foodId, uses: 0, favourite })
    .onConflictDoUpdate({ target: [s.foodUsage.userId, s.foodUsage.foodId], set: { favourite } });
}

/** Recipes are stored with their items and also as a searchable member food ("1 serving"). */
export async function createRecipe(c: Container, user: AuthUser, input: CreateRecipeRequest): Promise<RecipeDto> {
  const foods = await c.db.select().from(s.foodItems).where(inArray(s.foodItems.id, input.items.map((i) => i.foodId)));
  const byId = new Map(foods.map((f) => [f.id, f]));
  const items = input.items.map((i) => {
    const f = byId.get(i.foodId);
    if (!f) throw badRequest('One of the foods no longer exists.', 'unknown_food');
    return { foodId: f.id, name: f.name, grams: i.grams, n: nutritionFor(f.per100g, i.grams) };
  });
  const total = items.reduce((a, x) => ({ kcal: a.kcal + x.n.kcal, protein: a.protein + x.n.protein, carbs: a.carbs + x.n.carbs, fat: a.fat + x.n.fat, fibre: a.fibre + x.n.fibre }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
  const totalGrams = items.reduce((a, x) => a + x.grams, 0);
  const perServing = roundTotals({ kcal: total.kcal / input.servings, protein: total.protein / input.servings, carbs: total.carbs / input.servings, fat: total.fat / input.servings, fibre: total.fibre / input.servings });
  const servingGrams = Math.round((totalGrams / input.servings) * 10) / 10;
  return c.db.transaction(async (tx) => {
    const [recipe] = await tx
      .insert(s.recipes)
      .values({ teamId: user.teamId, ownerId: user.id, name: input.name, items: items.map(({ foodId, name, grams }) => ({ foodId, name, grams })), servings: input.servings, perServing })
      .returning();
    const per100g: Per100g = per100gFromServing(perServing, servingGrams);
    await tx.insert(s.foodItems).values({
      teamId: user.teamId,
      ownerId: user.id,
      name: input.name,
      searchText: normaliseName(input.name),
      per100g,
      servingOptions: [{ label: '1 serving', grams: servingGrams }, { label: '100 g', grams: 100 }],
      defaultServing: '1 serving',
      category: 'recipe',
      source: 'member',
      externalId: `recipe:${recipe!.id}`,
      verified: false,
      createdBy: user.id,
    });
    return { id: recipe!.id, name: recipe!.name, servings: recipe!.servings, perServing, items: recipe!.items, mine: true };
  });
}

export async function listMyFoods(c: Container, user: AuthUser) {
  const foods = await c.db.query.foodItems.findMany({ where: and(eq(s.foodItems.ownerId, user.id), isNull(s.foodItems.deletedAt)), orderBy: [desc(s.foodItems.createdAt)], limit: 100 });
  const recipes = await c.db.query.recipes.findMany({ where: and(eq(s.recipes.ownerId, user.id), isNull(s.recipes.deletedAt)), orderBy: [desc(s.recipes.createdAt)] });
  return { foods: foods.map((f) => toSearchResult(f, user.id, 'mine', null)), recipes: recipes.map((r) => ({ id: r.id, name: r.name, servings: r.servings, perServing: r.perServing, items: r.items, mine: true })) };
}

export async function deleteMyFood(c: Container, user: AuthUser, id: string) {
  const f = await c.db.query.foodItems.findFirst({ where: and(eq(s.foodItems.id, id), eq(s.foodItems.ownerId, user.id)) });
  if (!f) throw notFound('Food not found.');
  await c.db.update(s.foodItems).set({ deletedAt: c.clock.now() }).where(eq(s.foodItems.id, id));
}

/** Resolve foods for a log: returns per-100 g values and tags for the ids that are visible to the member. */
export async function foodsByIds(c: Container, ids: string[]) {
  if (!ids.length) return new Map<string, FoodRow>();
  const rows = await c.db.select().from(s.foodItems).where(inArray(s.foodItems.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Best database match for an AI-recognised item (SYS-AI-20). Returns null when similarity is too low. */
export async function matchFood(c: Container, user: AuthUser, hint: string): Promise<{ food: FoodRow; similarity: number } | null> {
  const q = normaliseName(hint);
  if (!q) return null;
  const trgm = await c.trgmSchema();
  const sim = sql.raw(`"${trgm}".similarity`);
  const ws = sql.raw(`"${trgm}".word_similarity`);
  const rows = await c.db
    // Word similarity on the full search text finds candidates; similarity to the name itself and exact name/alias
    // hits decide between them (so "dal" prefers "Dal fry" over "Baati", whose alias merely mentions dal).
    .select({
      food: s.foodItems,
      score: sql<number>`(0.6 * ${ws}(${q}, ${s.foodItems.searchText}) + 0.4 * ${sim}(${q}, lower(${s.foodItems.name}))
        + case when lower(${s.foodItems.name}) = ${q} or exists (select 1 from unnest(${s.foodItems.aliases}) a where lower(a) = ${q}) then 0.5 else 0 end
        + case when lower(${s.foodItems.name}) like ${q + ' %'} or lower(${s.foodItems.name}) like ${'% ' + q} then 0.1 else 0 end)`.as('score'),
    })
    .from(s.foodItems)
    .where(sql`${visibleTo(user)} and ${s.foodItems.source} <> 'ai'`)
    .orderBy(sql`score desc`, sql`length(${s.foodItems.name})`)
    .limit(1);
  const r = rows[0];
  if (!r || Number(r.score) < 0.45) return null;
  return { food: r.food, similarity: Number(r.score) };
}
