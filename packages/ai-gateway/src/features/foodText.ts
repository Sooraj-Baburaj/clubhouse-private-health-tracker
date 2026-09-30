import { z } from 'zod';
import { MealSlot } from '@clubhouse/contracts';
import { RECOGNITION_RULES, RecognitionWire, sanitiseRecognition, type Recognition } from './shared';

export const FoodTextInput = z.object({ text: z.string().trim().min(2).max(300), slot: MealSlot, localTime: z.string() });
export type FoodTextInput = z.infer<typeof FoodTextInput>;

export const FOOD_TEXT_SYSTEM = `You turn a short typed description of a meal into separate food items for Clubhouse, a friendly calorie-logging app used by a group of friends in India. Example input: "2 rotis, dal and a bowl of curd". Your job is to split the description into items and estimate each portion. The app looks up nutrition in its own verified food database.

${RECOGNITION_RULES}
- Respect quantities the member typed ("2 rotis" is quantity 2, about 80 g). When no quantity is given, assume one typical serving.
- Do not invent items that were not mentioned.

Return only the structured result.`;

export function buildFoodTextUser(input: FoodTextInput) {
  return [{ type: 'text' as const, text: `Meal slot: ${input.slot.replace('_', ' ')}. Local time: ${input.localTime}.\nThe member typed: "${input.text}"` }];
}

const UNIT_GRAMS: Record<string, [number, string]> = {
  roti: [40, 'roti'],
  chapati: [40, 'chapati'],
  idli: [50, 'idli'],
  dosa: [120, 'dosa'],
  egg: [50, 'egg'],
  banana: [120, 'banana'],
  apple: [180, 'apple'],
  paratha: [80, 'paratha'],
};

export function mockFoodText(input: FoodTextInput): Recognition {
  const parts = input.text
    .toLowerCase()
    .split(/,|\band\b|\bwith\b|\+|&/)
    .map((s) => s.trim())
    .filter(Boolean);
  const items = parts.map((p) => {
    const m = p.match(/^(\d+(?:\.\d+)?|a|an|one|two|three)\s+(?:bowls?\s+of\s+|plates?\s+of\s+|cups?\s+of\s+|katori\s+)?(.+)$/);
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3 };
    const qty = m ? (words[m[1]!] ?? Number(m[1])) : 1;
    let name = (m ? m[2]! : p).replace(/\s+/g, ' ').trim();
    const singular = name.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1');
    const unit = UNIT_GRAMS[singular];
    if (unit) name = singular;
    const grams = unit ? unit[0] * qty : 150 * qty;
    const label = unit ? `${qty} ${unit[1]}${qty > 1 ? 's' : ''}` : qty === 1 ? '1 serving' : `${qty} servings`;
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      matchHint: name,
      portionGrams: grams,
      householdMeasure: label,
      quantity: qty,
      confidence: 0.8,
      estimatePer100g: { kcal: 150, protein: 5, carbs: 20, fat: 5, fibre: 2 },
      tags: [],
    };
  });
  return sanitiseRecognition({ items, overallConfidence: items.length ? 0.8 : 0.2, notFood: items.length === 0, note: '' });
}

export { RecognitionWire as FoodTextOutput };
