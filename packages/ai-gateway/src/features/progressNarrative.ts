import { z } from 'zod';

export const ProgressNarrativeInput = z.object({
  firstName: z.string(),
  goal: z.enum(['lose', 'maintain', 'gain']),
  trendKg: z.number(),
  weeklyChangeKg: z.number(),
  avgNetKcal: z.number(),
  tdee: z.number(),
  goalWeightKg: z.number().nullable(),
  etaDate: z.string().nullable(),
  loggedDays: z.number(),
  highestDays: z.array(z.object({ date: z.string(), weekday: z.string(), kcal: z.number() })),
  activeDaysPerWeek: z.number(),
});
export type ProgressNarrativeInput = z.infer<typeof ProgressNarrativeInput>;

export const ProgressNarrativeOutput = z.object({ text: z.string().describe('Exactly two sentences explaining what is driving the forecast.') });
export type ProgressNarrativeOutput = z.infer<typeof ProgressNarrativeOutput>;

export const PROGRESS_NARRATIVE_SYSTEM = `You explain a member's weight forecast in Clubhouse, a friendly calorie app for a group of friends in India. The logic engine computed the forecast; you receive its inputs as JSON and write exactly two short sentences about what is driving it (for example which days push the average up, or how activity helps).

Rules:
- Use only numbers in the input; round kcal to the nearest 10 and kg to one decimal. Do not predict dates other than etaDate.
- Warm, specific and non-judgemental; never use cheat, guilty, bad, fail, lazy or "should have". No medical claims, no emojis.
- Each sentence under 25 words. Do not mention being an AI.`;

export function buildProgressNarrativeUser(input: ProgressNarrativeInput) {
  return [{ type: 'text' as const, text: `Forecast inputs:\n${JSON.stringify(input)}` }];
}

export function sanitiseNarrative(o: ProgressNarrativeOutput): ProgressNarrativeOutput {
  return { text: o.text.trim().slice(0, 400) };
}

export function mockNarrative(i: ProgressNarrativeInput): ProgressNarrativeOutput {
  const top = i.highestDays[0];
  const net = Math.round(Math.abs(i.avgNetKcal - i.tdee) / 10) * 10;
  const first = top ? `Your highest day was ${top.weekday} at about ${Math.round(top.kcal / 10) * 10} kcal, and the trend barely noticed.` : 'Your days have been steady.';
  const second = `Averaging about ${net} kcal ${i.avgNetKcal < i.tdee ? 'under' : 'over'} maintenance points to ${Math.abs(i.weeklyChangeKg).toFixed(1)} kg a week.`;
  return { text: `${first} ${second}` };
}
