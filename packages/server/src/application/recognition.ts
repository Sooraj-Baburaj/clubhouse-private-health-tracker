import { eq } from 'drizzle-orm';
import type { FoodAlternativeDto, MealSlot, RecognisedItemDto, RecognitionResponse } from '@clubhouse/contracts';
import type { Recognition } from '@clubhouse/ai-gateway';
import { householdPortion, nutritionFor, round1, roundTotals } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { MATCH_MIN, matchFoods } from './foods';
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
  return { ok: false, reason, message: MESSAGES[reason] ?? MESSAGES.error!, callId, imageId, items: [], overallConfidence: 0, lowConfidence: true, note: '', dishName: null };
}

type FoodRow = Awaited<ReturnType<typeof matchFoods>>[number]['food'];
const scopeOf = (f: FoodRow, user: AuthUser): FoodAlternativeDto['scope'] => (f.ownerId === user.id ? 'mine' : f.teamId ? 'team' : 'global');
const alternative = (f: FoodRow, user: AuthUser): FoodAlternativeDto => ({ foodId: f.id, name: f.name, per100g: f.per100g, servingOptions: f.servingOptions, verified: f.verified, scope: scopeOf(f, user) });

/**
 * Map model items to foods in our database (SYS-AI-16): the best match supplies the nutrition, near matches become
 * "Did you mean" chips, and unmatched items keep the model's estimate, flagged.
 */
async function toItems(c: Container, user: AuthUser, r: Recognition): Promise<RecognisedItemDto[]> {
  return Promise.all(
    r.items.map(async (it): Promise<RecognisedItemDto> => {
      const candidates = await matchFoods(c, user, it.matchHint || it.name);
      const best = candidates[0] && candidates[0].similarity >= MATCH_MIN ? candidates[0] : null;
      // "2 rotis" is two of "1 roti": the member changes the count, not the label.
      const hp = householdPortion(it.householdMeasure, it.quantity, it.portionGrams);
      const household = { label: hp.label, grams: round1(hp.grams), estimated: true };
      const alternatives = candidates.filter((x) => x !== best).slice(0, 3).map((x) => alternative(x.food, user));
      if (best) {
        const m = best.food;
        // The food's own unit weighs what our database says; the AI only counts how many.
        const own = m.servingOptions.find((o) => o.label.toLowerCase() === hp.label.toLowerCase());
        const unit = own ?? household;
        const grams = unit.grams * hp.qty;
        const opts = [unit, ...m.servingOptions.filter((o) => o !== own)];
        return {
          name: m.name,
          foodId: m.id,
          matched: true,
          grams: Math.round(grams),
          servingLabel: unit.label,
          quantity: hp.qty,
          confidence: it.confidence,
          nutrition: roundTotals(nutritionFor(m.per100g, grams)),
          per100g: m.per100g,
          servingOptions: opts.slice(0, 8),
          aiEstimate: false,
          scope: scopeOf(m, user),
          verified: m.verified,
          alternatives,
          tags: m.tags,
        };
      }
      return {
        name: it.name,
        foodId: null,
        matched: false,
        grams: Math.round(it.portionGrams),
        servingLabel: hp.label,
        quantity: hp.qty,
        confidence: it.confidence,
        nutrition: roundTotals(nutritionFor(it.estimatePer100g, it.portionGrams)),
        per100g: it.estimatePer100g,
        servingOptions: [household, { label: '100 g', grams: 100, unit: 'g', amount: 100 }],
        aiEstimate: true,
        scope: null,
        verified: false,
        alternatives,
        tags: it.tags,
      };
    }),
  );
}

async function finish(c: Container, user: AuthUser, r: Recognition, callId: string, imageId: string | null): Promise<RecognitionResponse> {
  if (r.notFood || !r.items.length) return failure('not_food', callId, imageId);
  const team = await getTeam(c, user.teamId);
  const threshold = team.settings.memes.confidenceThreshold;
  const items = await toItems(c, user, r);
  return { ok: true, reason: null, message: null, callId, imageId, items, overallConfidence: r.overallConfidence, lowConfidence: r.overallConfidence < threshold, note: r.note, dishName: r.dishName ?? null };
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
