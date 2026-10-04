import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { FOOD_TAGS, type AdminFoodRow, type AdminFoodUpdate, type FoodTag } from '@clubhouse/contracts';
import { normaliseName } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, notFound } from '../../lib/errors';
import { recipeIdOf } from '../foodCatalog';
import { logAudit, parseCsv, personMap, personOf, type Actor } from './shared';

type FoodRow = typeof s.foodItems.$inferSelect;

/** Foods an admin curates: global foods plus everything created inside the team (team_id set). */
const inTeam = (teamId: string) => or(isNull(s.foodItems.teamId), eq(s.foodItems.teamId, teamId))!;

async function teamFood(c: Container, teamId: string, id: string): Promise<FoodRow> {
  const f = await c.db.query.foodItems.findFirst({ where: and(eq(s.foodItems.id, id), inTeam(teamId), isNull(s.foodItems.deletedAt)) });
  if (!f) throw notFound('Food not found.');
  return f;
}

async function toRows(c: Container, foods: FoodRow[]): Promise<AdminFoodRow[]> {
  if (!foods.length) return [];
  const recipeIds = foods.map(recipeIdOf).filter((x): x is string => !!x);
  const [people, uses, recipes] = await Promise.all([
    personMap(c, foods.map((f) => f.ownerId)),
    c.db.select({ foodId: s.foodUsage.foodId, n: sql<number>`coalesce(sum(${s.foodUsage.uses}), 0)::int` }).from(s.foodUsage).where(inArray(s.foodUsage.foodId, foods.map((f) => f.id))).groupBy(s.foodUsage.foodId),
    recipeIds.length ? c.db.query.recipes.findMany({ where: inArray(s.recipes.id, recipeIds) }) : Promise.resolve([] as (typeof s.recipes.$inferSelect)[]),
  ]);
  const recipeFor = (f: FoodRow): AdminFoodRow['recipe'] => {
    const r = recipes.find((x) => x.id === recipeIdOf(f));
    if (!r) return null;
    return {
      makes: r.servings,
      ingredients: r.items.map((i) => ({ name: i.name, portion: i.servingLabel ?? `${Math.round(i.grams)} g`, grams: Math.round(i.grams), kcal: Math.round(i.nutrition?.kcal ?? 0) })),
    };
  };
  return foods.map((f) => ({
    id: f.id,
    name: f.name,
    brand: f.brand,
    source: f.source,
    verified: f.verified,
    owner: personOf(people, f.ownerId),
    team: f.teamId != null,
    per100g: f.per100g,
    servingOptions: f.servingOptions,
    defaultServing: f.defaultServing,
    tags: f.tags,
    category: f.category,
    confidence: f.confidence,
    uses: uses.find((u) => u.foodId === f.id)?.n ?? 0,
    createdAt: f.createdAt.toISOString(),
    recipe: recipeFor(f),
  }));
}

export async function listFoods(c: Container, a: Actor, q: { q?: string; source?: string; verified?: '0' | '1'; limit: number }) {
  const conds: SQL[] = [inTeam(a.user.teamId), isNull(s.foodItems.deletedAt), isNull(s.foodItems.mergedIntoId)];
  if (q.q?.trim()) {
    const like = `%${normaliseName(q.q).replace(/[%_]/g, '')}%`;
    conds.push(or(sql`${s.foodItems.searchText} like ${like}`, sql`${s.foodItems.name} ilike ${`%${q.q.trim().replace(/[%_]/g, '')}%`}`)!);
  }
  if (q.source) conds.push(eq(s.foodItems.source, q.source));
  if (q.verified) conds.push(eq(s.foodItems.verified, q.verified === '1'));
  // Curation queue first: team-created, unverified, newest.
  const rows = await c.db
    .select()
    .from(s.foodItems)
    .where(and(...conds))
    .orderBy(sql`(${s.foodItems.teamId} is not null) desc`, s.foodItems.verified, desc(s.foodItems.createdAt))
    .limit(q.limit);
  return toRows(c, rows);
}

export async function updateFood(c: Container, a: Actor, id: string, input: z.infer<typeof AdminFoodUpdate>) {
  const f = await teamFood(c, a.user.teamId, id);
  // A recipe's numbers come from its ingredients; overwriting them here would drift from the member's recipe.
  if (recipeIdOf(f) && (input.per100g !== undefined || input.servingOptions !== undefined || input.defaultServing !== undefined))
    throw badRequest('A recipe’s nutrition and portions come from its ingredients. The member edits it in the app.', 'recipe_readonly');
  const patch: Partial<typeof s.foodItems.$inferInsert> = { updatedAt: c.clock.now(), adminEdited: true };
  if (input.name !== undefined) {
    patch.name = input.name;
    patch.searchText = normaliseName([input.name, ...f.aliases].join(' '));
  }
  if (input.brand !== undefined) patch.brand = input.brand;
  if (input.per100g !== undefined) patch.per100g = input.per100g;
  if (input.servingOptions !== undefined) patch.servingOptions = input.servingOptions;
  if (input.defaultServing !== undefined) patch.defaultServing = input.defaultServing;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.category !== undefined) patch.category = input.category;
  if (input.verified !== undefined) patch.verified = input.verified;
  const [row] = await c.db.update(s.foodItems).set(patch).where(eq(s.foodItems.id, f.id)).returning();
  await logAudit(c, a, { action: 'food.update', targetType: 'food', targetId: f.id, memberId: f.ownerId, before: { name: f.name, brand: f.brand, per100g: f.per100g, servingOptions: f.servingOptions, tags: f.tags, verified: f.verified }, after: input });
  return (await toRows(c, [row!]))[0]!;
}

/** Merge a duplicate into the food to keep: usage moves over, the duplicate disappears from search. Logs keep their snapshots. */
export async function mergeFoods(c: Container, a: Actor, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw badRequest('Pick two different foods.', 'same_food');
  const [src, dst] = await Promise.all([teamFood(c, a.user.teamId, sourceId), teamFood(c, a.user.teamId, targetId)]);
  await c.db.transaction(async (tx) => {
    const usage = await tx.query.foodUsage.findMany({ where: eq(s.foodUsage.foodId, src.id) });
    for (const u of usage) {
      await tx
        .insert(s.foodUsage)
        .values({ ...u, foodId: dst.id })
        .onConflictDoUpdate({ target: [s.foodUsage.userId, s.foodUsage.foodId], set: { uses: sql`${s.foodUsage.uses} + ${u.uses}`, favourite: sql`${s.foodUsage.favourite} or ${u.favourite}` } });
    }
    await tx.delete(s.foodUsage).where(eq(s.foodUsage.foodId, src.id));
    await tx.update(s.foodItems).set({ mergedIntoId: dst.id, updatedAt: c.clock.now() }).where(eq(s.foodItems.id, src.id));
  });
  await logAudit(c, a, { action: 'food.merge', targetType: 'food', targetId: dst.id, before: { source: { id: src.id, name: src.name } }, after: { mergedInto: { id: dst.id, name: dst.name } } });
}

/** A member's or AI-estimated food becomes a verified team food everyone can find. */
export async function promoteFood(c: Container, a: Actor, id: string) {
  const f = await teamFood(c, a.user.teamId, id);
  const [row] = await c.db.update(s.foodItems).set({ teamId: f.teamId ?? a.user.teamId, verified: true, adminEdited: true, updatedAt: c.clock.now() }).where(eq(s.foodItems.id, f.id)).returning();
  await logAudit(c, a, { action: 'food.promote', targetType: 'food', targetId: f.id, memberId: f.ownerId, before: { verified: f.verified, teamId: f.teamId }, after: { verified: true, teamId: row!.teamId } });
  return (await toRows(c, [row!]))[0]!;
}

export async function deleteFood(c: Container, a: Actor, id: string) {
  const f = await teamFood(c, a.user.teamId, id);
  await c.db.update(s.foodItems).set({ deletedAt: c.clock.now() }).where(eq(s.foodItems.id, f.id));
  await logAudit(c, a, { action: 'food.delete', targetType: 'food', targetId: f.id, memberId: f.ownerId, before: { name: f.name, source: f.source } });
}

const num = (v: string | undefined) => (v == null || v.trim() === '' ? NaN : Number(v));
const col = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(r).find((x) => x.trim().toLowerCase().replace(/[\s-]/g, '_') === k);
    if (hit !== undefined && r[hit]?.trim()) return r[hit]!.trim();
  }
  return '';
};

/**
 * CSV import of team foods. Columns: name, brand, kcal, protein, carbs, fat, fibre (per 100 g), serving_label +
 * serving_grams or serving_options (JSON), default_serving, tags (| separated), category, external_id.
 * Rows with an external_id upsert by it; otherwise a team food with the same name is updated.
 */
export async function importFoods(c: Container, a: Actor, csv: string) {
  const rows = parseCsv(csv);
  if (!rows.length) throw badRequest('The CSV needs a header row and at least one food.', 'empty_csv');
  if (rows.length > 5000) throw badRequest('Import at most 5,000 foods at a time.', 'too_many_rows');
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const line = i + 2;
    const name = col(r, 'name');
    const per100g = { kcal: num(col(r, 'kcal', 'calories')), protein: num(col(r, 'protein')), carbs: num(col(r, 'carbs', 'carbohydrates')), fat: num(col(r, 'fat')), fibre: num(col(r, 'fibre', 'fiber')) };
    if (!name) {
      errors.push(`Line ${line}: name is required.`);
      continue;
    }
    if (Object.values(per100g).some((v) => !Number.isFinite(v) || v < 0) || per100g.kcal > 950) {
      errors.push(`Line ${line} (${name}): kcal, protein, carbs, fat and fibre per 100 g must be numbers.`);
      continue;
    }
    let servingOptions: { label: string; grams: number }[] = [{ label: '100 g', grams: 100 }];
    const optsJson = col(r, 'serving_options');
    const label = col(r, 'serving_label');
    const grams = num(col(r, 'serving_grams'));
    try {
      if (optsJson) servingOptions = (JSON.parse(optsJson) as { label: string; grams: number }[]).filter((o) => o && typeof o.label === 'string' && Number(o.grams) > 0).map((o) => ({ label: o.label.slice(0, 40), grams: Number(o.grams) }));
      else if (label && grams > 0) servingOptions = [{ label: label.slice(0, 40), grams }, { label: '100 g', grams: 100 }];
    } catch {
      errors.push(`Line ${line} (${name}): serving_options is not valid JSON.`);
      continue;
    }
    if (!servingOptions.length) servingOptions = [{ label: '100 g', grams: 100 }];
    const tags = col(r, 'tags')
      .split(/[|;]/)
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter((t): t is FoodTag => (FOOD_TAGS as readonly string[]).includes(t));
    const externalId = col(r, 'external_id', 'id') || null;
    const values = {
      teamId: a.user.teamId,
      ownerId: null,
      name: name.slice(0, 120),
      brand: col(r, 'brand').slice(0, 60) || null,
      searchText: normaliseName(name),
      per100g,
      servingOptions,
      defaultServing: col(r, 'default_serving') || servingOptions[0]!.label,
      tags,
      category: col(r, 'category').slice(0, 40) || null,
      source: 'admin',
      externalId: externalId ? `${a.user.teamId}:${externalId}` : null,
      verified: true,
      adminEdited: true,
      createdBy: a.user.id,
    };
    try {
      const existing = values.externalId
        ? await c.db.query.foodItems.findFirst({ where: and(eq(s.foodItems.source, 'admin'), eq(s.foodItems.externalId, values.externalId)) })
        : await c.db.query.foodItems.findFirst({ where: and(eq(s.foodItems.teamId, a.user.teamId), sql`lower(${s.foodItems.name}) = ${name.toLowerCase()}`, isNull(s.foodItems.deletedAt), isNull(s.foodItems.mergedIntoId)) });
      if (existing) {
        await c.db.update(s.foodItems).set({ ...values, updatedAt: c.clock.now() }).where(eq(s.foodItems.id, existing.id));
        updated++;
      } else {
        await c.db.insert(s.foodItems).values(values);
        inserted++;
      }
    } catch (e) {
      errors.push(`Line ${line} (${name}): ${(e as Error).message.slice(0, 120)}`);
    }
  }
  await logAudit(c, a, { action: 'food.import', targetType: 'food', after: { total: rows.length, inserted, updated, errors: errors.length } });
  return { total: rows.length, inserted, updated, errors: errors.slice(0, 200) };
}
