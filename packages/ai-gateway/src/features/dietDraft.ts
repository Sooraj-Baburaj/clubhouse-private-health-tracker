import { z } from 'zod';
import { MealSlot } from '@clubhouse/contracts';
import { Per100gWire, Slot } from './shared';

const N = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fibre: z.number() });

export const DietDraftInput = z.object({
  memberFirstName: z.string(),
  targets: N,
  goal: z.enum(['lose', 'maintain', 'gain']),
  perSlotKcal: z.record(MealSlot, z.number()),
  optionsPerSlot: z.number().int().min(2).max(5),
  diet: z.enum(['none', 'vegetarian', 'vegan', 'eggetarian', 'pescatarian']),
  allergies: z.array(z.string()),
  dislikes: z.array(z.string()),
  cuisines: z.array(z.string()),
  favourites: z.array(z.string()),
  notForMe: z.array(z.string()),
  brief: z.string().max(600),
  knownFoods: z.array(z.string()).max(400),
});
export type DietDraftInput = z.infer<typeof DietDraftInput>;

const DraftItem = z.object({
  name: z.string().describe('Food name; prefer names from knownFoods.'),
  matchHint: z.string().describe('Generic lookup name, no quantities.'),
  grams: z.number().describe('Edible grams for this item in the option.'),
  householdMeasure: z.string().describe('e.g. "2 rotis", "1 katori".'),
  estimatePer100g: Per100gWire,
});

export const DietDraftOutput = z.object({
  planName: z.string().describe('Short plan name, e.g. "1,800 kcal high-protein vegetarian".'),
  slots: z.array(
    z.object({
      slot: Slot,
      options: z.array(z.object({ name: z.string(), prepNote: z.string(), items: z.array(DraftItem) })),
    }),
  ),
  rationale: z.string().describe('Two sentences for the admin on how the plan meets the targets and preferences.'),
});
export type DietDraftOutput = z.infer<typeof DietDraftOutput>;

export const DIET_DRAFT_SYSTEM = `You draft a personal diet plan for an admin of Clubhouse, a friendly calorie app for a group of friends in India. The admin reviews every option before the member sees it, so be practical and precise.

The plan has five meal slots: breakfast, morning_snack, lunch, evening_snack, dinner. For each slot give the requested number of options (2 to 5). Each option is a realistic home-style meal made of items with grams and a household measure.

Rules:
- Aim each option close to that slot's kcal in perSlotKcal (within about 10 %) and keep the day's protein near the target; spread fibre across the day.
- Respect diet type, allergies and dislikes strictly. Never include anything in notForMe. Lean towards favourites and the listed cuisines; default to everyday Indian home food.
- Prefer food names from knownFoods so the app can match them to its database; use simple generic names otherwise.
- Give estimatePer100g for each item as prepared (typical home recipe). The app replaces it with database values when the name matches.
- prepNote: one short practical tip or an empty string.
- Options within a slot should feel different from each other (not the same dish twice).
- No medical claims, no supplements, no crash diets. Never use the words cheat, guilty, bad, fail or lazy.`;

export function buildDietDraftUser(input: DietDraftInput) {
  return [{ type: 'text' as const, text: `Member and targets:\n${JSON.stringify(input)}` }];
}

export function sanitiseDietDraft(o: DietDraftOutput, optionsPerSlot: number): DietDraftOutput {
  return {
    planName: o.planName.trim().slice(0, 80) || 'Draft plan',
    rationale: o.rationale.trim().slice(0, 600),
    slots: o.slots.map((s) => ({
      slot: s.slot,
      options: s.options.slice(0, Math.max(2, Math.min(5, optionsPerSlot))).map((opt) => ({
        name: opt.name.trim().slice(0, 80),
        prepNote: opt.prepNote.trim().slice(0, 200),
        items: opt.items.slice(0, 8).map((i) => ({ ...i, grams: Math.max(1, Math.min(1500, i.grams)) })),
      })),
    })),
  };
}

const P = (kcal: number, protein: number, carbs: number, fat: number, fibre: number) => ({ kcal, protein, carbs, fat, fibre });
const MOCK: Record<string, { name: string; items: [string, number, string, ReturnType<typeof P>][] }[]> = {
  breakfast: [
    { name: 'Poha with peanuts', items: [['Poha', 200, '1 plate', P(125, 3, 22.5, 3, 1.5)], ['Peanuts', 15, '1 tbsp', P(567, 25.8, 16.1, 49.2, 8.5)]] },
    { name: 'Idli sambar', items: [['Idli', 150, '3 idlis', P(130, 4.5, 26, 0.5, 1.5)], ['Sambar', 150, '1 katori', P(87, 4, 13, 2, 3.3)]] },
    { name: 'Egg bhurji + roti', items: [['Egg bhurji', 120, '2 eggs', P(175, 11, 3, 13, 0.5)], ['Roti', 40, '1 roti', P(260, 7.5, 45, 5, 7.5)]] },
  ],
  morning_snack: [
    { name: 'Banana', items: [['Banana', 120, '1 medium', P(89, 1.1, 22.8, 0.3, 2.6)]] },
    { name: 'Sprouts chaat', items: [['Sprouts chaat', 150, '1 bowl', P(100, 6.7, 16, 1.3, 4.7)]] },
  ],
  lunch: [
    { name: 'Dal + 2 roti', items: [['Dal tadka', 150, '1 katori', P(120, 6, 16, 4, 4)], ['Roti', 80, '2 rotis', P(260, 7.5, 45, 5, 7.5)]] },
    { name: 'Rajma chawal', items: [['Rajma', 150, '1 katori', P(140, 7, 18, 4, 6)], ['Steamed rice', 150, '1 cup', P(130, 2.7, 28, 0.3, 0.4)]] },
    { name: 'Chole + 1 roti', items: [['Chole', 150, '1 katori', P(160, 8, 22, 5, 6)], ['Roti', 40, '1 roti', P(260, 7.5, 45, 5, 7.5)]] },
  ],
  evening_snack: [
    { name: 'Masala chai + roasted chana', items: [['Masala chai', 150, '1 cup', P(60, 2, 8, 2, 0)], ['Roasted chana', 30, '1 handful', P(370, 20, 58, 6, 17)]] },
    { name: 'Buttermilk', items: [['Buttermilk', 200, '1 glass', P(40, 3.3, 4.8, 1, 0)]] },
  ],
  dinner: [
    { name: 'Paneer tikka + roti', items: [['Paneer tikka', 150, '6 pieces', P(187, 12, 5, 13, 1.3)], ['Roti', 40, '1 roti', P(260, 7.5, 45, 5, 7.5)]] },
    { name: 'Moong dal khichdi', items: [['Moong dal khichdi', 300, '1 bowl', P(120, 4.5, 20, 2.5, 2)]] },
    { name: 'Curd rice', items: [['Curd rice', 250, '1 bowl', P(105, 3, 17, 2.7, 0.4)]] },
  ],
};

export function mockDietDraft(i: DietDraftInput): DietDraftOutput {
  return {
    planName: `${Math.round(i.targets.kcal / 10) * 10} kcal ${i.diet === 'none' ? 'balanced' : i.diet}`,
    rationale: 'Options are sized to each slot’s share of the daily target. Protein is spread across meals with a dal, paneer or egg in most slots.',
    slots: (['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'] as const).map((slot) => ({
      slot,
      options: MOCK[slot]!.slice(0, i.optionsPerSlot).map((o) => ({
        name: o.name,
        prepNote: '',
        items: o.items.map(([name, grams, hm, per100]) => ({ name, matchHint: name.toLowerCase(), grams, householdMeasure: hm, estimatePer100g: per100 })),
      })),
    })),
  };
}
