import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { FOOD_CATALOG_FORMAT, type CatalogFood, type FoodCatalogPage } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';

type FoodRow = typeof s.foodItems.$inferSelect;

/** Rows that committed slightly out of timestamp order are still picked up: every delta re-reads this window. */
export const CATALOG_OVERLAP_MS = 2 * 60_000;

/** The same visibility rule as search: global foods, the team's verified foods and the member's own. */
function scopeOf(f: FoodRow, user: AuthUser): CatalogFood['scope'] | null {
  if (f.deletedAt || f.mergedIntoId) return null;
  if (f.ownerId === user.id) return 'mine';
  if (f.teamId === null) return 'global';
  if (f.teamId === user.teamId && f.verified) return 'team';
  return null;
}

function toCatalog(f: FoodRow, scope: CatalogFood['scope']): CatalogFood {
  return {
    id: f.id,
    name: f.name,
    aliases: f.aliases,
    brand: f.brand,
    scope,
    verified: f.verified,
    aiEstimate: f.source === 'ai',
    per100g: f.per100g,
    servingOptions: f.servingOptions.length ? f.servingOptions : [{ label: '100 g', grams: 100 }],
    defaultServing: f.defaultServing,
    tags: f.tags,
    veg: f.veg,
  };
}

/**
 * Snapshot or delta of the food catalogue for the browser cache (see FoodCatalogPage). Pages are ordered by id so
 * both modes resume with `after`, and a delta also reports ids that left the member's visible set.
 */
export async function catalogPage(c: Container, user: AuthUser, q: { since?: string; after?: string; limit: number }): Promise<FoodCatalogPage> {
  const [{ now }] = (await c.db.execute<{ now: string }>(sql`select now()::text as now`)) as unknown as [{ now: string }];
  const syncedAt = new Date(now).toISOString();
  const delta = !!q.since;
  const inScope = or(isNull(s.foodItems.teamId), eq(s.foodItems.teamId, user.teamId))!;
  const conditions = [inScope];
  if (delta) {
    const from = new Date(new Date(q.since!).getTime() - CATALOG_OVERLAP_MS);
    conditions.push(sql`${s.foodItems.updatedAt} > ${from.toISOString()}::timestamptz`);
  } else {
    // A full snapshot only needs what is visible right now.
    conditions.push(isNull(s.foodItems.deletedAt), isNull(s.foodItems.mergedIntoId));
    conditions.push(or(isNull(s.foodItems.teamId), eq(s.foodItems.ownerId, user.id), eq(s.foodItems.verified, true))!);
  }
  if (q.after) conditions.push(gt(s.foodItems.id, q.after));
  const rows = await c.db.select().from(s.foodItems).where(and(...conditions)).orderBy(asc(s.foodItems.id)).limit(q.limit + 1);
  const more = rows.length > q.limit;
  const page = more ? rows.slice(0, q.limit) : rows;
  const items: CatalogFood[] = [];
  const removed: string[] = [];
  for (const f of page) {
    const scope = scopeOf(f, user);
    if (scope) items.push(toCatalog(f, scope));
    else if (delta) removed.push(f.id);
  }
  return { format: FOOD_CATALOG_FORMAT, items, removed, syncedAt, next: more ? page[page.length - 1]!.id : null };
}
