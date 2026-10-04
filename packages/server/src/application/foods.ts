import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { CreateFoodRequest, FoodDetail, FoodDraft, FoodLogComponentDto, FoodSearchResponse, FoodSearchResult, LegacyCreateFoodRequest, RecipeDto, RecipeRequest, ServingOptionDto, UsualFood } from '@clubhouse/contracts';
import { buildFood, dishNutrition, normaliseName, nutritionFor, per100gFromServing, round1, roundTotals, type NutrientTotals } from '@clubhouse/domain';
import { schema as s, type RecipeItemJson } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest, notFound } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { recipeIdOf } from './foodCatalog';
import { imageUrlMap, pick } from './images';

type FoodRow = typeof s.foodItems.$inferSelect;
type UsageRow = typeof s.foodUsage.$inferSelect;
type RecipeRow = typeof s.recipes.$inferSelect;

function servingFor(f: FoodRow, usage?: Pick<UsageRow, 'lastGrams' | 'lastServingLabel'> | null) {
  if (usage?.lastGrams) return { label: usage.lastServingLabel ?? `${Math.round(usage.lastGrams)} g`, grams: usage.lastGrams };
  const def = f.servingOptions.find((o) => o.label === f.defaultServing) ?? f.servingOptions.find((o) => o.label !== '100 g') ?? f.servingOptions[0];
  return def ?? { label: '100 g', grams: 100 };
}

const scopeOf = (f: FoodRow, userId: string): FoodSearchResult['scope'] => (f.ownerId === userId ? 'mine' : f.teamId ? 'team' : 'global');

export function toSearchResult(f: FoodRow, userId: string, group: FoodSearchResult['group'], usage?: UsageRow | null): FoodSearchResult {
  const serving = servingFor(f, usage);
  const options = f.servingOptions.length ? f.servingOptions : [{ label: '100 g', grams: 100 }];
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    group,
    scope: scopeOf(f, userId),
    verified: f.verified,
    aiEstimate: f.source === 'ai',
    servingLabel: serving.label,
    servingGrams: serving.grams,
    perServing: roundTotals(nutritionFor(f.per100g, serving.grams)),
    per100g: f.per100g,
    servingOptions: options,
    tags: f.tags,
    favourite: !!usage?.favourite,
    recipeId: recipeIdOf(f),
  };
}

/** Foods a member may see: global seed/USDA, their team's verified foods, and their own. */
const visibleTo = (user: AuthUser) =>
  sql`${s.foodItems.deletedAt} is null and ${s.foodItems.mergedIntoId} is null and (${s.foodItems.teamId} is null or (${s.foodItems.teamId} = ${user.teamId} and ${s.foodItems.verified} = true) or ${s.foodItems.ownerId} = ${user.id})`;

/** Whether a member may log a food they have the id of (their own, the team's verified ones, the global catalogue). */
export const canLog = (f: FoodRow, user: AuthUser) => (f.teamId === null || f.teamId === user.teamId) && (!f.ownerId || f.ownerId === user.id || f.verified);

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

export async function getFood(c: Container, user: AuthUser, id: string): Promise<FoodDetail> {
  const row = await c.db.select({ food: s.foodItems, usage: s.foodUsage }).from(s.foodItems).leftJoin(s.foodUsage, and(eq(s.foodUsage.foodId, s.foodItems.id), eq(s.foodUsage.userId, user.id))).where(and(eq(s.foodItems.id, id), visibleTo(user))).limit(1);
  const r = row[0];
  if (!r) throw notFound('Food not found.');
  const mine = r.food.ownerId === user.id;
  return {
    ...toSearchResult(r.food, user.id, mine ? 'mine' : r.food.teamId ? 'team' : 'global', r.usage),
    category: r.food.category,
    source: r.food.source,
    createdByMe: r.food.createdBy === user.id,
    editable: mine && !r.food.verified && r.food.category !== 'recipe',
    usual: r.usage?.lastGrams ? { label: r.usage.lastServingLabel ?? `${Math.round(r.usage.lastGrams)} g`, grams: r.usage.lastGrams } : null,
  };
}

const isDraft = (input: CreateFoodRequest): input is FoodDraft => 'basis' in input;

function foodValues(d: FoodDraft) {
  const built = buildFood(d);
  return {
    name: d.name,
    brand: d.brand ?? null,
    searchText: normaliseName([d.name, d.brand ?? ''].join(' ')),
    per100g: built.per100g,
    servingOptions: built.servingOptions,
    defaultServing: built.defaultServing,
    tags: d.tags ?? [],
    veg: d.veg ?? null,
  };
}

/** An app installed before portions sends one serving (label, grams and its nutrition): stored as it always was. */
function legacyValues(input: LegacyCreateFoodRequest) {
  const options: ServingOptionDto[] = [{ label: input.servingLabel, grams: input.servingGrams }];
  if (input.servingGrams !== 100) options.push({ label: '100 g', grams: 100 });
  return {
    name: input.name,
    brand: input.brand ?? null,
    searchText: normaliseName([input.name, input.brand ?? ''].join(' ')),
    per100g: per100gFromServing(input.perServing, input.servingGrams),
    servingOptions: options,
    defaultServing: input.servingLabel,
    tags: input.tags ?? [],
    veg: input.veg ?? null,
  };
}

/** SYS-DB-03: members create private custom foods: nutrition for one portion → stored per 100 g, with portions. */
export async function createFood(c: Container, user: AuthUser, input: CreateFoodRequest) {
  const values = isDraft(input) ? foodValues(input) : legacyValues(input);
  const [row] = await c.db
    .insert(s.foodItems)
    .values({ teamId: user.teamId, ownerId: user.id, ...values, source: 'member', verified: false, createdBy: user.id })
    .returning();
  return toSearchResult(row!, user.id, 'mine', null);
}

/** Members edit their own foods until an admin verifies them; past logs keep the nutrition they were saved with. */
export async function updateFood(c: Container, user: AuthUser, id: string, draft: FoodDraft) {
  const f = await c.db.query.foodItems.findFirst({ where: and(eq(s.foodItems.id, id), eq(s.foodItems.ownerId, user.id), isNull(s.foodItems.deletedAt)) });
  if (!f) throw notFound('Food not found.');
  if (f.verified) throw badRequest('Your admin has checked this food, so it can’t be changed here any more.', 'food_verified');
  if (f.category === 'recipe') throw badRequest('Edit the recipe instead.', 'food_is_recipe');
  const [row] = await c.db
    .update(s.foodItems)
    .set({ ...foodValues(draft), updatedAt: c.clock.now() })
    .where(eq(s.foodItems.id, id))
    .returning();
  return toSearchResult(row!, user.id, 'mine', null);
}

export async function toggleFavourite(c: Container, user: AuthUser, foodId: string, favourite: boolean) {
  await c.db
    .insert(s.foodUsage)
    .values({ userId: user.id, foodId, uses: 0, favourite })
    .onConflictDoUpdate({ target: [s.foodUsage.userId, s.foodUsage.foodId], set: { favourite } });
}

/* ───────── Recipes (saved dishes) ───────── */

/** Ingredients as logged: foods are re-read for their nutrition; quick adds keep theirs. */
export async function resolveComponents(c: Container, user: AuthUser, components: RecipeRequest['components']): Promise<(FoodLogComponentDto & { tags: string[] })[]> {
  const foods = await foodsByIds(c, components.map((i) => i.foodId).filter((x): x is string => !!x));
  return components.map((i) => {
    if (i.foodId) {
      const f = foods.get(i.foodId);
      if (!f || !canLog(f, user)) throw badRequest(`“${i.name}” is no longer available.`, 'unknown_food');
      // Ingredients keep 0.1 precision: a dish is rounded once, as a whole.
      return { foodId: f.id, name: i.name || f.name, grams: i.grams, servings: i.servings, servingLabel: i.servingLabel ?? null, nutrition: nutritionFor(f.per100g, i.grams), aiEstimate: f.source === 'ai', tags: f.tags };
    }
    if (!i.nutrition) throw badRequest(`Add calories for “${i.name}”.`, 'nutrition_required');
    const n = i.nutrition;
    return { foodId: null, name: i.name, grams: i.grams, servings: i.servings, servingLabel: i.servingLabel ?? null, nutrition: { kcal: round1(n.kcal), protein: round1(n.protein), carbs: round1(n.carbs), fat: round1(n.fat), fibre: round1(n.fibre) }, aiEstimate: !!i.aiEstimate, tags: [] };
  });
}

/** Rows saved before dishes had only food, name and grams: their nutrition comes from the foods. */
async function componentsOf(c: Container, rows: RecipeRow[]): Promise<Map<string, FoodLogComponentDto[]>> {
  const legacyIds = rows.flatMap((r) => r.items.filter((i) => !i.nutrition && i.foodId).map((i) => i.foodId!));
  const foods = await foodsByIds(c, legacyIds);
  const out = new Map<string, FoodLogComponentDto[]>();
  for (const r of rows) {
    out.set(
      r.id,
      r.items.map((i: RecipeItemJson) => {
        const f = i.foodId ? foods.get(i.foodId) : undefined;
        const nutrition: NutrientTotals = i.nutrition ?? (f ? roundTotals(nutritionFor(f.per100g, i.grams)) : { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });
        return { foodId: i.foodId, name: i.name, grams: i.grams, servings: i.servings ?? 1, servingLabel: i.servingLabel ?? `${Math.round(i.grams)} g`, nutrition, aiEstimate: !!i.aiEstimate };
      }),
    );
  }
  return out;
}

async function recipeDtos(c: Container, user: AuthUser, rows: RecipeRow[]): Promise<RecipeDto[]> {
  if (!rows.length) return [];
  const [components, foods, images] = await Promise.all([
    componentsOf(c, rows),
    c.db
      .select({ id: s.foodItems.id, externalId: s.foodItems.externalId })
      .from(s.foodItems)
      .where(and(inArray(s.foodItems.externalId, rows.map((r) => `recipe:${r.id}`)), isNull(s.foodItems.deletedAt))),
    imageUrlMap(c, rows.map((r) => r.imageId)),
  ]);
  const foodFor = new Map(foods.map((f) => [f.externalId, f.id]));
  return rows.map((r) => {
    const img = pick(images, r.imageId);
    return { id: r.id, name: r.name, makes: r.servings, perServing: r.perServing, components: components.get(r.id) ?? [], foodId: foodFor.get(`recipe:${r.id}`) ?? null, imageUrl: img.thumbUrl ?? img.url, mine: r.ownerId === user.id, updatedAt: r.updatedAt.toISOString() };
  });
}

async function checkRecipeImage(c: Container, user: AuthUser, imageId: string | null | undefined) {
  if (!imageId) return;
  const img = await c.db.query.images.findFirst({ where: and(eq(s.images.id, imageId), eq(s.images.ownerId, user.id)) });
  if (!img) throw badRequest('Upload the photo first.', 'bad_image');
}

/** The recipe's searchable food ("1 serving"), kept in step with the recipe. */
function recipeFoodValues(name: string, perServing: NutrientTotals, servingGrams: number) {
  const known = servingGrams > 0;
  const grams = known ? servingGrams : 100;
  const options: ServingOptionDto[] = [{ label: '1 serving', grams, unit: 'serving', amount: 1, ...(known ? {} : { estimated: true }) }];
  if (known) options.push({ label: '100 g', grams: 100, unit: 'g', amount: 100 });
  return { name, searchText: normaliseName(name), per100g: per100gFromServing(perServing, grams), servingOptions: options, defaultServing: '1 serving' };
}

async function recipeBody(c: Container, user: AuthUser, input: RecipeRequest) {
  const parts = await resolveComponents(c, user, input.components);
  const dish = dishNutrition(parts, input.makes, 1);
  const items: RecipeItemJson[] = parts.map(({ foodId, name, grams, servings, servingLabel, nutrition, aiEstimate }) => ({ foodId, name, grams, servings, servingLabel, nutrition, aiEstimate }));
  return { items, perServing: roundTotals(dish.nutrition), servingGrams: Math.round((dish.totalGrams / input.makes) * 10) / 10 };
}

/** Recipes are stored with their ingredients and also as a searchable member food ("1 serving"). */
export async function createRecipe(c: Container, user: AuthUser, input: RecipeRequest): Promise<RecipeDto> {
  await checkRecipeImage(c, user, input.imageId);
  const body = await recipeBody(c, user, input);
  const recipe = await c.db.transaction(async (tx) => {
    const [r] = await tx.insert(s.recipes).values({ teamId: user.teamId, ownerId: user.id, name: input.name, items: body.items, servings: input.makes, perServing: body.perServing, imageId: input.imageId ?? null }).returning();
    await tx.insert(s.foodItems).values({
      teamId: user.teamId,
      ownerId: user.id,
      ...recipeFoodValues(input.name, body.perServing, body.servingGrams),
      category: 'recipe',
      source: 'member',
      externalId: `recipe:${r!.id}`,
      verified: false,
      createdBy: user.id,
    });
    return r!;
  });
  return (await recipeDtos(c, user, [recipe]))[0]!;
}

async function ownRecipe(c: Container, user: AuthUser, id: string) {
  const r = await c.db.query.recipes.findFirst({ where: and(eq(s.recipes.id, id), eq(s.recipes.ownerId, user.id), isNull(s.recipes.deletedAt)) });
  if (!r) throw notFound('Recipe not found.');
  return r;
}

export async function getRecipe(c: Container, user: AuthUser, id: string): Promise<RecipeDto> {
  return (await recipeDtos(c, user, [await ownRecipe(c, user, id)]))[0]!;
}

export async function updateRecipe(c: Container, user: AuthUser, id: string, input: RecipeRequest): Promise<RecipeDto> {
  await ownRecipe(c, user, id);
  await checkRecipeImage(c, user, input.imageId);
  const body = await recipeBody(c, user, input);
  const now = c.clock.now();
  const [r] = await c.db.transaction(async (tx) => {
    const updated = await tx
      .update(s.recipes)
      .set({ name: input.name, items: body.items, servings: input.makes, perServing: body.perServing, ...(input.imageId !== undefined ? { imageId: input.imageId } : {}), updatedAt: now })
      .where(eq(s.recipes.id, id))
      .returning();
    await tx
      .update(s.foodItems)
      .set({ ...recipeFoodValues(input.name, body.perServing, body.servingGrams), updatedAt: now })
      .where(and(eq(s.foodItems.externalId, `recipe:${id}`), eq(s.foodItems.ownerId, user.id)));
    return updated;
  });
  return (await recipeDtos(c, user, [r!]))[0]!;
}

export async function deleteRecipe(c: Container, user: AuthUser, id: string) {
  await ownRecipe(c, user, id);
  const now = c.clock.now();
  await c.db.transaction(async (tx) => {
    await tx.update(s.recipes).set({ deletedAt: now }).where(eq(s.recipes.id, id));
    await tx.update(s.foodItems).set({ deletedAt: now, updatedAt: now }).where(and(eq(s.foodItems.externalId, `recipe:${id}`), eq(s.foodItems.ownerId, user.id)));
  });
}

export async function listMyFoods(c: Container, user: AuthUser) {
  const foods = await c.db.query.foodItems.findMany({ where: and(eq(s.foodItems.ownerId, user.id), isNull(s.foodItems.deletedAt)), orderBy: [desc(s.foodItems.createdAt)], limit: 100 });
  const recipes = await c.db.query.recipes.findMany({ where: and(eq(s.recipes.ownerId, user.id), isNull(s.recipes.deletedAt)), orderBy: [desc(s.recipes.updatedAt)] });
  // Recipes are listed as recipes; their searchable stand-in foods aren't repeated as foods.
  return { foods: foods.filter((f) => f.category !== 'recipe').map((f) => toSearchResult(f, user.id, 'mine', null)), recipes: await recipeDtos(c, user, recipes) };
}

export async function deleteMyFood(c: Container, user: AuthUser, id: string) {
  const f = await c.db.query.foodItems.findFirst({ where: and(eq(s.foodItems.id, id), eq(s.foodItems.ownerId, user.id)) });
  if (!f) throw notFound('Food not found.');
  const recipeId = recipeIdOf(f);
  if (recipeId) return deleteRecipe(c, user, recipeId);
  await c.db.update(s.foodItems).set({ deletedAt: c.clock.now(), updatedAt: c.clock.now() }).where(eq(s.foodItems.id, id));
}

/** Resolve foods for a log: returns per-100 g values and tags for the ids that are visible to the member. */
export async function foodsByIds(c: Container, ids: string[]) {
  if (!ids.length) return new Map<string, FoodRow>();
  const rows = await c.db.select().from(s.foodItems).where(inArray(s.foodItems.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r]));
}

/** The match score threshold for an AI-recognised item to count as a database food (SYS-AI-20). */
const MATCH_MIN = 0.45;
/** Weaker matches still offered as "Did you mean". */
const ALTERNATIVE_MIN = 0.3;

/** Best database matches for an AI-recognised item, best first, down to the alternatives threshold. */
export async function matchFoods(c: Container, user: AuthUser, hint: string, limit = 4): Promise<{ food: FoodRow; similarity: number }[]> {
  const q = normaliseName(hint);
  if (!q) return [];
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
    .where(sql`${visibleTo(user)} and ${s.foodItems.source} <> 'ai' and coalesce(${s.foodItems.category}, '') <> 'recipe'`)
    .orderBy(sql`score desc`, sql`length(${s.foodItems.name})`)
    .limit(limit);
  return rows.map((r) => ({ food: r.food, similarity: Number(r.score) })).filter((r) => r.similarity >= ALTERNATIVE_MIN);
}

/** Best database match for an AI-recognised item (SYS-AI-20). Returns null when similarity is too low. */
export async function matchFood(c: Container, user: AuthUser, hint: string): Promise<{ food: FoodRow; similarity: number } | null> {
  const [best] = await matchFoods(c, user, hint, 1);
  return best && best.similarity >= MATCH_MIN ? best : null;
}

export { MATCH_MIN };
