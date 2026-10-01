import { describe, expect, it } from 'vitest';
import type { CatalogFood } from '@clubhouse/contracts';
import { indexFood, searchFoods } from './foodSearch';

const food = (id: string, name: string, aliases: string[] = [], extra: Partial<CatalogFood> = {}): CatalogFood => ({
  id,
  name,
  aliases,
  brand: null,
  scope: 'global',
  verified: true,
  aiEstimate: false,
  per100g: { kcal: 100, protein: 5, carbs: 10, fat: 3, fibre: 1 },
  servingOptions: [{ label: '100 g', grams: 100 }],
  defaultServing: null,
  tags: [],
  veg: true,
  ...extra,
});

// Real names and aliases from the Indian seed catalogue, including the ones that used to outrank the right answer.
const index = [
  food('paneer', 'Paneer', ['cottage cheese']),
  food('chhena', 'Chhena', ['chena', 'chhana', 'fresh paneer crumbled']),
  food('kadai', 'Kadai paneer'),
  food('dalfry', 'Dal fry', ['dal fry restaurant style', 'fried dal']),
  food('baati', 'Baati', ['bati', 'dal baati (baati)']),
  food('toor', 'Toor dal', ['arhar dal', 'plain dal']),
  food('dosa', 'Masala dosa', ['masala dose']),
  food('dosa2', 'Plain dosa', ['sada dosa']),
  food('mine', 'Grandma’s poha', [], { scope: 'mine', verified: false }),
  food('poha', 'Poha', ['aval', 'pohe']),
].map(indexFood);

const ids = (q: string, boost?: Map<string, number>) => searchFoods(index, q, { boost }).map((f) => f.id);

describe('local food search', () => {
  it('tolerates typos and prefers the food named like the query', () => {
    expect(ids('paner')[0]).toBe('paneer');
  });

  it('ranks exact names and aliases first', () => {
    expect(ids('poha')[0]).toBe('poha');
    expect(ids('aval')[0]).toBe('poha');
    expect(ids('plain dal')[0]).toBe('toor');
  });

  it('prefers a name match over a food whose alias merely mentions the word', () => {
    const r = ids('dal');
    expect(r.indexOf('dalfry')).toBeLessThan(r.indexOf('baati'));
  });

  it('matches every word as a prefix', () => {
    expect(ids('mas do')[0]).toBe('dosa');
  });

  it('boosts foods the member uses often among similar matches', () => {
    expect(ids('dosa', new Map([['dosa', 4]]))[0]).toBe('dosa');
    expect(ids('dosa', new Map([['dosa2', 4]]))[0]).toBe('dosa2');
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(ids('  ')).toEqual([]);
    expect(searchFoods(index, 'a', { limit: 3 }).length).toBeLessThanOrEqual(3);
  });
});
