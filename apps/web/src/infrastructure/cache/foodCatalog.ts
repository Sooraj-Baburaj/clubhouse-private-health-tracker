import { api } from '@clubhouse/client';
import { FOOD_CATALOG_FORMAT, type CatalogFood, type FoodSearchResult } from '@clubhouse/contracts';
import { nutritionFor, roundTotals } from '@clubhouse/domain';
import { db } from '../idb';
import { SyncedCollection } from './engine';
import { indexFood, searchFoods, type IndexedFood, type SearchOptions } from './foodSearch';

/**
 * The food catalogue (~2,000+ foods) cached in IndexedDB for instant, offline search. First sync downloads it in
 * pages; afterwards only foods changed since the last sync come down (admin edits, merges, new member foods).
 */

const byId = new Map<string, IndexedFood>();
let list: IndexedFood[] = [];

function rebuildList() {
  list = [...byId.values()];
}

export const foodCatalog = new SyncedCollection({
  name: 'foods',
  format: FOOD_CATALOG_FORMAT,
  ttlMs: 6 * 3600_000,
  fullEveryMs: 7 * 24 * 3600_000,
  async hydrate() {
    const rows = await (await db()).getAll('foods');
    byId.clear();
    for (const f of rows) byId.set(f.id, indexFood(f));
    rebuildList();
    return byId.size;
  },
  async clear() {
    byId.clear();
    list = [];
    await (await db()).clear('foods');
  },
  async pull({ meta, full, signal }) {
    const d = await db();
    const seen = new Set<string>();
    let after: string | undefined;
    let cursor: string | null = null;
    // Pages already applied stay applied if a later page fails (deltas are idempotent; the next pull resumes).
    try {
      do {
        const page = await api.foods.catalog(
          { since: full ? undefined : (meta.cursor ?? undefined), after, limit: 1000 },
          signal,
        );
        cursor ??= page.syncedAt; // the first page's time: anything changed during paging is re-read next time
        const tx = d.transaction('foods', 'readwrite');
        for (const f of page.items) {
          seen.add(f.id);
          void tx.store.put(f);
          byId.set(f.id, indexFood(f));
        }
        for (const id of page.removed) {
          void tx.store.delete(id);
          byId.delete(id);
        }
        await tx.done;
        after = page.next ?? undefined;
      } while (after);
    } finally {
      rebuildList();
    }
    if (full) {
      // A full download is authoritative: anything we hold that it didn't include is gone.
      const stale = [...byId.keys()].filter((id) => !seen.has(id));
      if (stale.length) {
        const tx = d.transaction('foods', 'readwrite');
        for (const id of stale) {
          void tx.store.delete(id);
          byId.delete(id);
        }
        await tx.done;
      }
    }
    rebuildList();
    return { cursor: cursor!, count: byId.size };
  },
});

/** Instant local search (empty until the first sync completes; callers fall back to the server). */
export function searchCatalog(query: string, opts?: SearchOptions): CatalogFood[] {
  return searchFoods(list, query, opts);
}

export function catalogFood(id: string): CatalogFood | undefined {
  return byId.get(id)?.food;
}

/** Shape a cached food like a server search result (default serving, per-serving nutrition, group). */
export function toSearchResult(
  f: CatalogFood,
  group?: FoodSearchResult['group'],
): FoodSearchResult {
  const serving = f.servingOptions.find((o) => o.label === f.defaultServing) ??
    f.servingOptions.find((o) => o.label !== '100 g') ??
    f.servingOptions[0] ?? { label: '100 g', grams: 100 };
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    group: group ?? f.scope,
    verified: f.verified,
    aiEstimate: f.aiEstimate,
    servingLabel: serving.label,
    servingGrams: serving.grams,
    perServing: roundTotals(nutritionFor(f.per100g, serving.grams)),
    per100g: f.per100g,
    servingOptions: f.servingOptions,
    tags: f.tags,
    favourite: false,
  };
}
