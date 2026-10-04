import { describe, expect, it } from 'vitest';
import { acceptsTypedWeight, buildFood, dishNutrition, fractionText, householdPortion, isoWeekNumber, nutritionFor, parseServingLabel, pluralNoun, portionLabel, portionText } from '../src';

describe('portion text', () => {
  it('writes fractions the way people say them', () => {
    expect([0.25, 0.5, 0.75, 1, 1.5, 2.5, 0.3].map(fractionText)).toEqual(['¼', '½', '¾', '1', '1½', '2½', '0.3']);
  });
  it('pluralises portion nouns', () => {
    expect(['roti', 'glass', 'slice', 'katori', 'pcs', 'tbsp', 'medium apple', 'berry'].map(pluralNoun)).toEqual(['rotis', 'glasses', 'slices', 'katoris', 'pcs', 'tbsp', 'medium apples', 'berries']);
  });
  it('labels structured portions', () => {
    expect(portionLabel(1, 'scoop')).toBe('1 scoop');
    expect(portionLabel(2, 'scoop')).toBe('2 scoops');
    expect(portionLabel(0.5, 'katori')).toBe('½ katori');
    expect(portionLabel(150, 'g')).toBe('150 g');
    expect(portionLabel(2, 'custom', 'ladle')).toBe('2 ladles');
  });
  it('scales a portion by quantity, structured or legacy', () => {
    expect(portionText(2, { label: '1 scoop', unit: 'scoop', amount: 1 })).toBe('2 scoops');
    expect(portionText(1.5, { label: '100 g', unit: 'g', amount: 100 })).toBe('150 g');
    expect(portionText(1.5, { label: '2 pcs' })).toBe('3 pcs');
    expect(portionText(2, { label: '1 roti' })).toBe('2 rotis');
    expect(portionText(1, { label: '2 rotis' })).toBe('2 rotis');
    expect(portionText(0.5, { label: '2 rotis' })).toBe('1 roti');
    expect(portionText(2, { label: 'large bowl' })).toBe('2 × large bowl');
  });
  it('parses legacy labels', () => {
    expect(parseServingLabel('2 pcs')).toEqual({ amount: 2, noun: 'pcs' });
    expect(parseServingLabel('one bowl')).toBeNull();
    expect(parseServingLabel('1/3 cup')).toEqual({ amount: 1 / 3, noun: 'cup' });
    expect(parseServingLabel('1 /4 cup')).toEqual({ amount: 0.25, noun: 'cup' });
    expect(parseServingLabel('1 1/2 cups')).toEqual({ amount: 1.5, noun: 'cups' });
    expect(parseServingLabel('½ katori')).toEqual({ amount: 0.5, noun: 'katori' });
    expect(parseServingLabel('1½ cups')).toEqual({ amount: 1.5, noun: 'cups' });
    expect(parseServingLabel('0/3 cup')).toBeNull();
    // Fractions read naturally when the amount changes.
    expect(portionText(2, { label: '1/3 cup' })).toBe('⅔ cup');
    expect(portionText(1, { label: '1 /4 cup' })).toBe('¼ cup');
  });
  it('splits an AI household measure into one unit and a count', () => {
    expect(householdPortion('2 rotis', 2, 80)).toEqual({ label: '1 roti', grams: 40, qty: 2 });
    expect(householdPortion('2 tbsp', 2, 40)).toEqual({ label: '1 tbsp', grams: 20, qty: 2 });
    expect(householdPortion('1 katori', 1, 150)).toEqual({ label: '1 katori', grams: 150, qty: 1 });
    // "½ cup" is half of one cup, so the member can step to a whole one.
    expect(householdPortion('½ cup', 0.5, 87)).toEqual({ label: '1 cup', grams: 174, qty: 0.5 });
    // A measure that doesn't count the quantity stays one portion of the whole weight.
    expect(householdPortion('a big bowl', 1, 300)).toEqual({ label: 'a big bowl', grams: 300, qty: 1 });
    expect(householdPortion('150 g', 1, 150)).toEqual({ label: '150 g', grams: 150, qty: 1 });
    expect(householdPortion('2 g', 2, 2)).toEqual({ label: '2 g', grams: 2, qty: 1 });
  });
});

describe('building a food from portions', () => {
  const whey = { kcal: 120, protein: 24, carbs: 3, fat: 1.6, fibre: 0 };
  it('stores nutrition per 100 g and one-unit portions', () => {
    const f = buildFood({ basis: { unit: 'scoop', amount: 1, grams: 32 }, nutrients: whey, portions: [{ unit: 'tbsp', amount: 1, grams: 8 }] });
    expect(f.per100g.kcal).toBe(375);
    expect(f.servingOptions.map((o) => [o.label, o.grams])).toEqual([
      ['1 scoop', 32],
      ['1 tbsp', 8],
      ['100 g', 100],
    ]);
    expect(f.defaultServing).toBe('1 scoop');
    expect(nutritionFor(f.per100g, 2 * 32).kcal).toBe(240);
  });
  it('a basis of several units becomes a one-unit portion', () => {
    const f = buildFood({ basis: { unit: 'piece', amount: 2, grams: 80 }, nutrients: { kcal: 200, protein: 6, carbs: 36, fat: 4, fibre: 6 }, portions: [] });
    expect(f.servingOptions[0]).toMatchObject({ label: '1 piece', grams: 40 });
  });
  it('honours the default portion', () => {
    const f = buildFood({ basis: { unit: 'g', amount: 100, grams: null }, nutrients: whey, portions: [{ unit: 'scoop', amount: 1, grams: 32, isDefault: true }] });
    expect(f.defaultServing).toBe('1 scoop');
    expect(f.per100g.kcal).toBe(120);
  });
  it('without a known weight, logs by the unit only and keeps per-unit nutrition exact', () => {
    const f = buildFood({ basis: { unit: 'packet', amount: 1, grams: null }, nutrients: { kcal: 150, protein: 2, carbs: 20, fat: 7, fibre: 1 }, portions: [{ unit: 'piece', amount: 1, grams: 10 }] });
    expect(f.servingOptions).toHaveLength(1);
    expect(f.servingOptions[0]).toMatchObject({ label: '1 packet', estimated: true });
    expect(nutritionFor(f.per100g, f.servingOptions[0]!.grams).kcal).toBe(150);
    expect(acceptsTypedWeight(f.servingOptions)).toBe(false);
  });
  it('volume foods get a 100 ml portion', () => {
    const f = buildFood({ basis: { unit: 'glass', amount: 1, grams: 250 }, nutrients: { kcal: 150, protein: 8, carbs: 12, fat: 8, fibre: 0 }, portions: [] });
    expect(f.servingOptions.map((o) => o.label)).toEqual(['1 glass', '100 ml']);
  });
});

describe('dish nutrition', () => {
  it('is the ingredients × eaten ÷ batch', () => {
    const fruit = [
      { nutrition: { kcal: 78, protein: 0.4, carbs: 21, fat: 0.3, fibre: 3.6 }, grams: 150 },
      { nutrition: { kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, fibre: 3.1 }, grams: 118 },
      { nutrition: { kcal: 64, protein: 0.6, carbs: 17, fat: 0.2, fibre: 0.8 }, grams: 92 },
      { nutrition: { kcal: 72, protein: 1.5, carbs: 16, fat: 1, fibre: 3.5 }, grams: 87 },
      { nutrition: { kcal: 21, protein: 0, carbs: 5.7, fat: 0, fibre: 0 }, grams: 7 },
    ];
    const d = dishNutrition(fruit, 2, 1);
    expect(d.total.kcal).toBe(340);
    expect(d.nutrition.kcal).toBe(170);
    expect(d.grams).toBe(227);
  });
});

describe('iso week number', () => {
  it('matches ISO-8601', () => {
    expect(isoWeekNumber('2026-10-04')).toBe(40);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekNumber('2025-12-29')).toBe(1);
  });
});
