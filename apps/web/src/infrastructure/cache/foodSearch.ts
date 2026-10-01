import type { CatalogFood } from '@clubhouse/contracts';
import { normaliseName } from '@clubhouse/domain';

/**
 * In-memory search over the cached food catalogue: instant (no network) and offline. It mirrors the server's ranking
 * closely enough that results don't jump when the server's answer arrives: exact name or alias, then prefix, then
 * every word matched as a prefix, then substring, then typo-tolerant trigram similarity ("paner" → "paneer").
 */

export interface IndexedFood {
  food: CatalogFood;
  name: string;
  /** Name, aliases and brand, normalised. */
  phrases: string[];
  words: string[];
  /** Trigrams of the name alone, and of name + aliases + brand. */
  nameTrigrams: Set<string>;
  trigrams: Set<string>;
}

function trigramsOf(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(' ')) {
    if (!w) continue;
    const padded = `  ${w} `;
    for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

export function indexFood(food: CatalogFood): IndexedFood {
  const name = normaliseName(food.name);
  const phrases = [
    name,
    ...food.aliases.map(normaliseName),
    ...(food.brand ? [normaliseName(food.brand)] : []),
  ].filter(Boolean);
  const words = [...new Set(phrases.flatMap((p) => p.split(' ')).filter(Boolean))];
  return { food, name, phrases, words, nameTrigrams: trigramsOf(name), trigrams: trigramsOf(phrases.join(' ')) };
}

/** pg_trgm-style word similarity: the share of the query's trigrams found in the candidate. */
function similarity(q: Set<string>, c: Set<string>): number {
  if (!q.size) return 0;
  let hit = 0;
  for (const t of q) if (c.has(t)) hit++;
  return hit / q.size;
}

export interface SearchOptions {
  limit?: number;
  /** Food ids the member uses often (recents, favourites); they rank higher among similar matches. */
  boost?: ReadonlyMap<string, number>;
}

export function searchFoods(
  index: readonly IndexedFood[],
  query: string,
  opts: SearchOptions = {},
): CatalogFood[] {
  const q = normaliseName(query);
  if (!q) return [];
  const limit = opts.limit ?? 25;
  const qWords = q.split(' ');
  const qTri = trigramsOf(q);
  const scored: { f: IndexedFood; score: number }[] = [];
  for (const f of index) {
    let score = 0;
    if (f.name === q || f.phrases.includes(q)) score = 100;
    else if (f.name.startsWith(q)) score = 85;
    else if (f.phrases.some((p) => p.startsWith(q))) score = 75;
    else if (qWords.every((w) => f.words.some((x) => x.startsWith(w)))) score = 65;
    else if (f.phrases.some((p) => p.includes(q))) score = 55;
    else {
      // A typo of the food's own name beats a typo that only matches an alias ("paner": Paneer before Chhena).
      const sim = Math.max(similarity(qTri, f.nameTrigrams), 0.85 * similarity(qTri, f.trigrams));
      if (sim >= 0.4) score = 20 + sim * 30;
    }
    if (!score) continue;
    score += Math.min(8, (opts.boost?.get(f.food.id) ?? 0) * 2);
    if (f.food.scope === 'mine') score += 3;
    else if (f.food.scope === 'team' || f.food.verified) score += 1.5;
    // Shorter names win ties: "Dal" before "Dal makhani restaurant style".
    score -= Math.min(4, f.name.length / 20);
    scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.f.food);
}
