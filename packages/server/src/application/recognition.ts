import { eq } from 'drizzle-orm';
import type { MealSlot, RecognisedItemDto, RecognitionResponse } from '@clubhouse/contracts';
import type { Recognition } from '@clubhouse/ai-gateway';
import { nutritionFor, roundTotals } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { matchFood } from './foods';
import { storeImage } from './media';
import { getTeam } from './team';

const MESSAGES: Record<string, string> = {
  disabled: 'Photo logging is off right now. Search works just as well.',
  opted_out: 'You turned photo logging off. Search works just as well.',
  budget: 'The team’s AI allowance is used up for this month. Search works just as well.',
  member_cap: 'You’ve used today’s photo recognitions. Search works just as well.',
  timeout: 'That took too long. Try search, or retake the photo.',
  invalid_output: 'Couldn’t quite tell what’s on the plate. Try search.',
  refused: 'Couldn’t read that photo. Try search.',
  error: 'Couldn’t quite tell what’s on the plate. Try search.',
  not_food: 'That doesn’t look like food. Try another photo or search.',
};

function failure(reason: string, callId: string | null, imageId: string | null): RecognitionResponse {
  return { ok: false, reason, message: MESSAGES[reason] ?? MESSAGES.error!, callId, imageId, items: [], overallConfidence: 0, lowConfidence: true, note: '' };
}

/** Map model items to foods in our database (SYS-AI-16); unmatched items keep the model's estimate, flagged. */
async function toItems(c: Container, user: AuthUser, r: Recognition): Promise<RecognisedItemDto[]> {
  const out: RecognisedItemDto[] = [];
  for (const it of r.items) {
    const m = await matchFood(c, user, it.matchHint || it.name);
    const household = { label: it.householdMeasure, grams: Math.round(it.portionGrams / Math.max(it.quantity, 0.25)) };
    if (m) {
      const opts = [household, ...m.food.servingOptions.filter((o) => o.label !== household.label)];
      out.push({
        name: m.food.name,
        foodId: m.food.id,
        matched: true,
        grams: Math.round(it.portionGrams),
        servingLabel: it.householdMeasure,
        quantity: it.quantity,
        confidence: it.confidence,
        nutrition: roundTotals(nutritionFor(m.food.per100g, it.portionGrams)),
        per100g: m.food.per100g,
        servingOptions: opts.slice(0, 8),
        aiEstimate: false,
      });
    } else {
      out.push({
        name: it.name,
        foodId: null,
        matched: false,
        grams: Math.round(it.portionGrams),
        servingLabel: it.householdMeasure,
        quantity: it.quantity,
        confidence: it.confidence,
        nutrition: roundTotals(nutritionFor(it.estimatePer100g, it.portionGrams)),
        per100g: it.estimatePer100g,
        servingOptions: [household, { label: '100 g', grams: 100 }],
        aiEstimate: true,
      });
    }
  }
  return out;
}

async function finish(c: Container, user: AuthUser, r: Recognition, callId: string, imageId: string | null): Promise<RecognitionResponse> {
  if (r.notFood || !r.items.length) return failure('not_food', callId, imageId);
  const team = await getTeam(c, user.teamId);
  const threshold = team.settings.memes.confidenceThreshold;
  const items = await toItems(c, user, r);
  return { ok: true, reason: null, message: null, callId, imageId, items, overallConfidence: r.overallConfidence, lowConfidence: r.overallConfidence < threshold, note: r.note };
}

async function optedOut(c: Container, userId: string, key: 'photo' | 'summary') {
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) });
  return !!p?.aiOptOuts[key];
}

/** APP-HOME-20/21: store the photo, then recognise it; the photo is kept either way so a search fallback can attach it. */
export async function recognisePhoto(c: Container, user: AuthUser, file: Buffer, slot: MealSlot, hint: string | undefined, clientId: string | null): Promise<RecognitionResponse> {
  const { row, main } = await storeImage(c, user, file, 'food', clientId);
  const clock = memberClock(c, user.timezone);
  const image = main.length ? main : ((await c.storage.get(row.storageKey)) ?? Buffer.alloc(0));
  const r = await c.ai.callFeature(
    'food.photo',
    { teamId: user.teamId, userId: user.id, dayStart: clock.dayStart, memberOptedOut: await optedOut(c, user.id, 'photo'), entity: { type: 'image', id: row.id } },
    { image: { data: image.toString('base64'), mediaType: 'image/webp' }, slot, localTime: clock.localTime, ...(hint ? { hint } : {}) },
  );
  if (!r.ok) return failure(r.reason, r.callId, row.id);
  return finish(c, user, r.data, r.callId, row.id);
}

/** APP-HOME-27: "2 rotis and dal" → items. */
export async function recogniseText(c: Container, user: AuthUser, text: string, slot: MealSlot): Promise<RecognitionResponse> {
  const clock = memberClock(c, user.timezone);
  const team = await getTeam(c, user.teamId);
  if (!team.settings.featureFlags.naturalLanguageEntry) return failure('disabled', null, null);
  const r = await c.ai.callFeature('food.text', { teamId: user.teamId, userId: user.id, dayStart: clock.dayStart }, { text, slot, localTime: clock.localTime });
  if (!r.ok) return failure(r.reason, r.callId, null);
  return finish(c, user, r.data, r.callId, null);
}
