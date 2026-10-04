import { z } from 'zod';
import { MealSlot } from '@clubhouse/contracts';
import { RECOGNITION_RULES, RecognitionWire, sanitiseRecognition, type Recognition } from './shared';

export const FoodPhotoInput = z.object({
  image: z.object({ data: z.string().min(10), mediaType: z.enum(['image/webp', 'image/jpeg', 'image/png']) }),
  slot: MealSlot,
  localTime: z.string(),
  hint: z.string().max(120).optional(),
});
export type FoodPhotoInput = z.infer<typeof FoodPhotoInput>;

export const FOOD_PHOTO_SYSTEM = `You identify the foods in a photo of a meal for Clubhouse, a friendly calorie-logging app used by a group of friends in India. The member took the photo to log what they ate; your job is recognition and portion estimation only. The app looks up nutrition in its own verified food database, so focus on getting names and portions right.

${RECOGNITION_RULES}

Return only the structured result.`;

export function buildFoodPhotoUser(input: FoodPhotoInput) {
  const text = `Meal slot: ${input.slot.replace('_', ' ')}. Local time: ${input.localTime}.${input.hint ? ` The member added: "${input.hint}".` : ''} Identify each food or drink and estimate its portion.`;
  return [
    { type: 'image' as const, source: { type: 'base64' as const, media_type: input.image.mediaType, data: input.image.data } },
    { type: 'text' as const, text },
  ];
}

const MOCK_PLATES: Recognition['items'][] = [
  [
    { name: 'Masala dosa', matchHint: 'masala dosa', portionGrams: 180, householdMeasure: '1 dosa', quantity: 1, confidence: 0.86, estimatePer100g: { kcal: 215, protein: 3.9, carbs: 28.9, fat: 8.9, fibre: 2.2 }, tags: ['grain'] },
    { name: 'Coconut chutney', matchHint: 'coconut chutney', portionGrams: 40, householdMeasure: '2 tbsp', quantity: 2, confidence: 0.8, estimatePer100g: { kcal: 175, protein: 2.5, carbs: 7.5, fat: 15, fibre: 5 }, tags: [] },
    { name: 'Sambar', matchHint: 'sambar', portionGrams: 150, householdMeasure: '1 katori', quantity: 1, confidence: 0.78, estimatePer100g: { kcal: 87, protein: 4, carbs: 13, fat: 2, fibre: 3.3 }, tags: ['legume'] },
  ],
  [
    { name: 'Dal tadka', matchHint: 'dal tadka', portionGrams: 150, householdMeasure: '1 katori', quantity: 1, confidence: 0.84, estimatePer100g: { kcal: 120, protein: 6, carbs: 16, fat: 4, fibre: 4 }, tags: ['legume'] },
    { name: 'Roti', matchHint: 'roti', portionGrams: 80, householdMeasure: '2 rotis', quantity: 2, confidence: 0.9, estimatePer100g: { kcal: 260, protein: 7.5, carbs: 45, fat: 5, fibre: 7.5 }, tags: ['grain'] },
    { name: 'Jeera rice', matchHint: 'jeera rice', portionGrams: 120, householdMeasure: '1 cup', quantity: 1, confidence: 0.75, estimatePer100g: { kcal: 160, protein: 3, carbs: 30, fat: 3, fibre: 0.6 }, tags: ['grain'] },
  ],
  [
    { name: 'Poha', matchHint: 'poha', portionGrams: 200, householdMeasure: '1 plate', quantity: 1, confidence: 0.88, estimatePer100g: { kcal: 125, protein: 3, carbs: 22.5, fat: 3, fibre: 1.5 }, tags: ['grain'] },
    { name: 'Masala chai', matchHint: 'masala chai', portionGrams: 150, householdMeasure: '1 cup', quantity: 1, confidence: 0.83, estimatePer100g: { kcal: 60, protein: 2, carbs: 8, fat: 2, fibre: 0 }, tags: ['beverage'] },
  ],
];

/** A bowl of cut fruit: the items are the ingredients of one dish (exercises the "group them?" suggestion). */
const MOCK_FRUIT_BOWL: Recognition['items'] = [
  { name: 'Apple', matchHint: 'apple', portionGrams: 150, householdMeasure: '1 medium', quantity: 1, confidence: 0.86, estimatePer100g: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2, fibre: 2.4 }, tags: ['fruit'] },
  { name: 'Banana', matchHint: 'banana', portionGrams: 118, householdMeasure: '1 banana', quantity: 1, confidence: 0.9, estimatePer100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3, fibre: 2.6 }, tags: ['fruit'] },
  { name: 'Grapes', matchHint: 'grapes', portionGrams: 92, householdMeasure: '1 cup', quantity: 1, confidence: 0.82, estimatePer100g: { kcal: 69, protein: 0.7, carbs: 18, fat: 0.2, fibre: 0.9 }, tags: ['fruit'] },
  { name: 'Pomegranate', matchHint: 'pomegranate', portionGrams: 87, householdMeasure: '½ cup', quantity: 0.5, confidence: 0.78, estimatePer100g: { kcal: 83, protein: 1.7, carbs: 19, fat: 1.2, fibre: 4 }, tags: ['fruit'] },
];

export function mockFoodPhoto(input: FoodPhotoInput): Recognition {
  if (input.hint?.toLowerCase().includes('not food')) return { items: [], overallConfidence: 0.1, notFood: true, note: '' };
  if (input.hint?.toLowerCase().includes('fruit')) return sanitiseRecognition({ items: MOCK_FRUIT_BOWL, overallConfidence: 0.84, notFood: false, note: 'Colourful bowl.', dishName: 'Fruit salad' });
  if (input.hint?.toLowerCase().includes('blurry')) return sanitiseRecognition({ items: MOCK_PLATES[0]!.slice(0, 1).map((i) => ({ ...i, confidence: 0.3 })), overallConfidence: 0.35, notFood: false, note: 'Hard to see clearly.' });
  const pick = input.image.data.length % MOCK_PLATES.length;
  return sanitiseRecognition({ items: MOCK_PLATES[pick]!, overallConfidence: 0.82, notFood: false, note: 'Looks tasty.' });
}

export { RecognitionWire as FoodPhotoOutput };
