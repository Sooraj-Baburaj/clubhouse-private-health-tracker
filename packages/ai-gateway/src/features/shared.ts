import { z } from 'zod';
import { FOOD_TAGS, MEAL_SLOTS } from '@clubhouse/contracts';

export const Per100gWire = z.object({
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fibre: z.number(),
});

export const RecognisedItemWire = z.object({
  name: z.string().describe('Short everyday English name of the food or dish as a person would log it, e.g. "Masala dosa".'),
  matchHint: z.string().describe('Generic database lookup name without quantities or brand, e.g. "masala dosa".'),
  portionGrams: z.number().describe('Estimated edible weight in grams of this item on the plate.'),
  householdMeasure: z.string().describe('How a person would describe the portion, e.g. "1 dosa", "1 katori", "2 rotis".'),
  quantity: z.number().describe('Count in the household measure, e.g. 2 for "2 rotis"; 1 when not countable.'),
  confidence: z.number().describe('0 to 1: how sure you are about the identity and portion of this item.'),
  estimatePer100g: Per100gWire.describe('Typical nutrition per 100 g for this item as prepared. Used only if the database has no match.'),
  // Plain strings on the wire: the SDK can't send `enum` as a constraint (it moves it into the description), so one
  // unlisted tag would fail the whole parse. Unknown tags are dropped in sanitiseRecognition instead.
  tags: z.array(z.string()).describe(`Applicable tags only, from: ${FOOD_TAGS.join(', ')}.`),
});
export type RecognisedItem = z.infer<typeof RecognisedItemWire>;

export const RecognitionWire = z.object({
  items: z.array(RecognisedItemWire),
  overallConfidence: z.number().describe('0 to 1 for the whole result.'),
  notFood: z.boolean().describe('True when the input does not show or describe food or drink.'),
  note: z.string().describe('One short sentence for the member, or an empty string.'),
});
export type Recognition = z.infer<typeof RecognitionWire>;

const KNOWN_TAGS = new Set<string>(FOOD_TAGS);

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo);

/** Domain validation after the schema check (SYS-AI-16): clamp numbers, cap item count, drop empty names. */
export function sanitiseRecognition(r: Recognition): Recognition {
  const items = r.items
    .filter((i) => i.name.trim().length > 0)
    .slice(0, 12)
    .map((i) => ({
      ...i,
      name: i.name.trim().slice(0, 80),
      matchHint: (i.matchHint || i.name).trim().slice(0, 80),
      portionGrams: clamp(i.portionGrams, 1, 2000),
      quantity: clamp(i.quantity || 1, 0.25, 20),
      confidence: clamp(i.confidence, 0, 1),
      householdMeasure: i.householdMeasure.trim().slice(0, 40) || `${Math.round(i.portionGrams)} g`,
      tags: [...new Set(i.tags.map((t) => t.trim().toLowerCase()).filter((t) => KNOWN_TAGS.has(t)))],
      estimatePer100g: {
        kcal: clamp(i.estimatePer100g.kcal, 0, 900),
        protein: clamp(i.estimatePer100g.protein, 0, 100),
        carbs: clamp(i.estimatePer100g.carbs, 0, 100),
        fat: clamp(i.estimatePer100g.fat, 0, 100),
        fibre: clamp(i.estimatePer100g.fibre, 0, 60),
      },
    }));
  return { items, overallConfidence: clamp(r.overallConfidence, 0, 1), notFood: r.notFood, note: r.note.slice(0, 200) };
}

export const RECOGNITION_RULES = `Rules for identifying food:
- List each distinct food or drink separately (a thali becomes its parts: rice, dal, sabzi, roti, curd…). Do not list garnishes, cutlery or the plate.
- Use everyday names people in India would log, in English, with common regional names where natural (idli, dosa, poha, rajma chawal, chole, paneer tikka, biryani, sambar, chutney).
- Estimate the edible portion in grams from visual cues: plate size (a full dinner plate is about 26 cm), katori/bowl size (about 150 ml), roti size (about 40 g each), glasses and cups (a chai cup is about 150 ml).
- "householdMeasure" and "quantity" describe the same portion the way a person would say it.
- Confidence reflects both identification and portion certainty. Mixed or hidden dishes, poor lighting and partial views lower it. Be honest: 0.4 is fine when unsure.
- "estimatePer100g" is typical nutrition per 100 g for the item as prepared (home-style Indian cooking unless the photo clearly shows restaurant style). It is only a fallback; the app uses its own food database when the name matches.
- Tags: dessert for sweets, fried for deep-fried items, fast_food for burgers/pizza/fries, street_food for chaat and stall snacks, alcohol for alcoholic drinks, sugary_drink for sweetened drinks, plus food-group tags (grain, legume, dairy, vegetable, fruit, meat, seafood, egg, beverage, snack) that clearly apply.
- If the input is not food or drink, return notFood true and an empty items list.
- Never mention calories, weight loss or judgement in the note. Keep the note friendly and under 15 words, or leave it empty.`;

export const Slot = z.enum(MEAL_SLOTS);
