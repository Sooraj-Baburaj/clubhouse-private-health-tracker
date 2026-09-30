import { z } from 'zod';

const N = z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number(), fibre: z.number() });

/** Compact numbers only — never raw logs or images (APP-HOME-02, SYS-AI-21). */
export const HomeSummaryInput = z.object({
  firstName: z.string(),
  localTime: z.string(),
  goal: z.enum(['lose', 'maintain', 'gain']),
  targets: N,
  eaten: N,
  burnedKcal: z.number(),
  remainingKcal: z.number(),
  bandLabels: z.record(z.string(), z.string()),
  lowestNutrient: z.object({ nutrient: z.string(), pct: z.number() }).nullable(),
  loggedSlots: z.array(z.string()),
  week: z.object({ daysLogged: z.number(), daysInRange: z.number(), avgKcal: z.number().nullable() }),
  streakDays: z.number(),
  nextMeal: z.object({ slot: z.string(), optionName: z.string(), kcal: z.number(), proteinG: z.number() }).nullable(),
  swapCandidate: z.object({ slot: z.string(), from: z.string(), to: z.string(), toKcal: z.number() }).nullable(),
});
export type HomeSummaryInput = z.infer<typeof HomeSummaryInput>;

export const HomeSummaryOutput = z.object({
  sentences: z.array(z.string()).describe('One to three short sentences: how today and this week are going, the one thing to fix, and the recommended next meal.'),
  swapIdea: z.string().describe('One sentence phrasing the swapCandidate, or an empty string when swapCandidate is null.'),
});
export type HomeSummaryOutput = z.infer<typeof HomeSummaryOutput>;

export const HOME_SUMMARY_SYSTEM = `You write the daily summary card in Clubhouse, a friendly calorie and activity app for a group of friends in India. You receive the member's numbers for today and this week as JSON. The app's logic engine computed every number; you only phrase them.

Write at most three short sentences, in second person, warm and specific, like a friend who is good at maths:
1. How today (and briefly this week) is going.
2. The one thing to fix or keep doing (usually the lowest nutrient, or calories if clearly over or under).
3. The recommended next meal, using exactly the provided nextMeal name and numbers. If nextMeal is null, suggest logging the next meal instead.

Hard rules:
- Use only numbers that appear in the input. Round kcal to the nearest 10 and grams to whole numbers. Never invent foods, numbers or dates.
- Never contradict the input: if remainingKcal is negative the member is over; say "a bit over" kindly, never scold.
- Never use these words: cheat, guilty, bad, fail, lazy, "should have". No medical claims, no weight-loss promises, no emojis.
- Each sentence under 25 words. No greetings like "Hey". Do not mention being an AI.
- swapIdea: one sentence only if swapCandidate is present (e.g. "Curd rice sits lighter than dal-roti at about 260 kcal — tap it under Dinner."), otherwise an empty string.`;

export function buildHomeSummaryUser(input: HomeSummaryInput) {
  return [{ type: 'text' as const, text: `Numbers:\n${JSON.stringify(input)}` }];
}

export function sanitiseHomeSummary(o: HomeSummaryOutput): HomeSummaryOutput {
  return { sentences: o.sentences.map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s) => s.slice(0, 220)), swapIdea: o.swapIdea.trim().slice(0, 220) };
}

export function mockHomeSummary(i: HomeSummaryInput): HomeSummaryOutput {
  const r = Math.round(i.remainingKcal / 10) * 10;
  const first = r >= 0 ? `You have about ${r.toLocaleString('en-IN')} kcal left today and ${i.week.daysInRange} of ${Math.max(1, i.week.daysLogged)} logged days were in range this week.` : `You're about ${Math.abs(r).toLocaleString('en-IN')} kcal over today — no stress, tomorrow resets.`;
  const second = i.lowestNutrient ? `${i.lowestNutrient.nutrient[0]!.toUpperCase()}${i.lowestNutrient.nutrient.slice(1)} is the one to watch at ${Math.round(i.lowestNutrient.pct)}% of target.` : 'Everything is on track so far.';
  const third = i.nextMeal ? `For ${i.nextMeal.slot.replace('_', ' ')}, ${i.nextMeal.optionName} fits at about ${Math.round(i.nextMeal.kcal / 10) * 10} kcal.` : 'Log your next meal when you have it.';
  const swap = i.swapCandidate ? `${i.swapCandidate.to} is a lighter swap for ${i.swapCandidate.from} at about ${Math.round(i.swapCandidate.toKcal / 10) * 10} kcal.` : '';
  return { sentences: [first, second, third], swapIdea: swap };
}
