import { describe, expect, it } from 'vitest';
import { costOf, createAiGateway, type AiStore, type AiTeamSettings, type CallRowFinish } from '../src';

function fakeStore(over: Partial<AiTeamSettings> = {}, spent = 0, used = 0) {
  const calls: { id: string; start: unknown; finish?: CallRowFinish }[] = [];
  const settings: AiTeamSettings = {
    globalOn: true,
    features: {
      'food.photo': { on: true, model: 'claude-sonnet-5-5', dailyCap: 5 },
      'food.text': { on: true, model: 'claude-sonnet-5-5', dailyCap: 5 },
      'home.summary': { on: true, model: 'claude-haiku-4-5', dailyCap: 5 },
      'progress.narrative': { on: false, model: 'claude-sonnet-5-5', dailyCap: 5 },
      'diet.draft': { on: true, model: 'claude-sonnet-5-5', dailyCap: 5 },
    },
    budget: { monthlyCapUsd: 30, alertAtPercent: 80, atCapBehaviour: 'disable' },
    promptRetentionDays: 0,
    ...over,
  };
  const store: AiStore = {
    getSettings: async () => settings,
    monthSpend: async () => spent,
    memberCallsSince: async () => used,
    startCall: async (row) => {
      const id = `call-${calls.length + 1}`;
      calls.push({ id, start: row });
      return id;
    },
    finishCall: async (id, row) => {
      calls.find((c) => c.id === id)!.finish = row;
    },
    pricingFor: async (model) => ({ model, inputPerMtok: 2, outputPerMtok: 10, cacheReadPerMtok: 0.2, cacheWritePerMtok: 2.5 }),
  };
  return { store, calls };
}

const ctx = { teamId: 't1', userId: 'u1', dayStart: new Date('2026-09-30T00:00:00Z') };
const textInput = { text: '2 rotis and dal', slot: 'lunch' as const, localTime: '13:10' };

function fakeClient(response: unknown | Error) {
  return {
    beta: {
      messages: {
        parse: async () => {
          if (response instanceof Error) throw response;
          return response;
        },
      },
    },
  };
}

describe('gateway', () => {
  it('mock mode returns deterministic data and logs a call', async () => {
    const { store, calls } = fakeStore();
    const gw = createAiGateway({ store, mode: 'mock', fallbacks: true, now: () => new Date('2026-09-30T08:00:00Z') });
    const r = await gw.callFeature('food.text', ctx, textInput);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.items.map((i) => i.name)).toEqual(['Roti', 'Dal']);
    expect(calls[0]!.finish!.outcome).toBe('ok');
  });

  it('respects the global switch, feature switch and opt-out without logging', async () => {
    const off = fakeStore({ globalOn: false });
    const gw = createAiGateway({ store: off.store, mode: 'mock', fallbacks: true, now: () => new Date() });
    expect((await gw.callFeature('food.text', ctx, textInput)).ok).toBe(false);
    const f = fakeStore();
    const gw2 = createAiGateway({ store: f.store, mode: 'mock', fallbacks: true, now: () => new Date() });
    const r = await gw2.callFeature('progress.narrative', ctx, { firstName: 'A', goal: 'lose', trendKg: 70, weeklyChangeKg: -0.3, avgNetKcal: 1800, tdee: 2200, goalWeightKg: 65, etaDate: null, loggedDays: 20, highestDays: [], activeDaysPerWeek: 3 });
    expect(r).toMatchObject({ ok: false, reason: 'disabled' });
    const r2 = await gw2.callFeature('food.text', { ...ctx, memberOptedOut: true }, textInput);
    expect(r2).toMatchObject({ ok: false, reason: 'opted_out' });
    expect(off.calls.length + f.calls.length).toBe(0);
  });

  it('blocks at the monthly cap and at the member daily cap, logging the block', async () => {
    const capped = fakeStore({}, 31);
    const r = await createAiGateway({ store: capped.store, mode: 'mock', fallbacks: true, now: () => new Date() }).callFeature('food.text', ctx, textInput);
    expect(r).toMatchObject({ ok: false, reason: 'budget' });
    expect(capped.calls[0]!.finish!.outcome).toBe('budget_blocked');
    const warn = fakeStore({ budget: { monthlyCapUsd: 30, alertAtPercent: 80, atCapBehaviour: 'warn' } }, 31);
    const w = await createAiGateway({ store: warn.store, mode: 'mock', fallbacks: true, now: () => new Date() }).callFeature('food.text', ctx, textInput);
    expect(w.ok && w.warnAtCap).toBe(true);
    const member = fakeStore({}, 0, 5);
    const m = await createAiGateway({ store: member.store, mode: 'mock', fallbacks: true, now: () => new Date() }).callFeature('food.text', ctx, textInput);
    expect(m).toMatchObject({ ok: false, reason: 'member_cap' });
  });

  it('live: parses output, computes cost and records fallback outcome', async () => {
    const { store, calls } = fakeStore();
    const response = {
      model: 'claude-sonnet-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 500, cache_creation_input_tokens: 0, iterations: [{ type: 'message' }] },
      parsed_output: { items: [{ name: 'Roti', matchHint: 'roti', portionGrams: 80, householdMeasure: '2 rotis', quantity: 2, confidence: 0.9, estimatePer100g: { kcal: 260, protein: 7.5, carbs: 45, fat: 5, fibre: 7.5 }, tags: ['grain'] }], overallConfidence: 0.9, notFood: false, note: '' },
    };
    const gw = createAiGateway({ store, mode: 'live', apiKey: 'k', fallbacks: true, now: () => new Date('2026-09-30T08:00:00Z'), clientOverride: fakeClient(response) });
    const r = await gw.callFeature('food.text', ctx, textInput);
    expect(r.ok).toBe(true);
    expect(calls[0]!.finish!.costUsd).toBeCloseTo((1000 * 2 + 200 * 10 + 500 * 0.2) / 1e6, 8);
    const fb = fakeStore();
    const gw2 = createAiGateway({ store: fb.store, mode: 'live', apiKey: 'k', fallbacks: true, now: () => new Date(), clientOverride: fakeClient({ ...response, usage: { ...response.usage, iterations: [{ type: 'fallback_message' }] } }) });
    await gw2.callFeature('food.text', ctx, textInput);
    expect(fb.calls[0]!.finish!.outcome).toBe('fallback');
  });

  it('live: maps refusal, invalid output and timeouts to fallbacks', async () => {
    const mk = (resp: unknown) => {
      const s = fakeStore();
      return { s, gw: createAiGateway({ store: s.store, mode: 'live', apiKey: 'k', fallbacks: true, now: () => new Date(), clientOverride: fakeClient(resp) }) };
    };
    const a = mk({ model: 'claude-sonnet-5-5', stop_reason: 'refusal', stop_details: { category: 'general_harms' }, usage: { input_tokens: 10, output_tokens: 0 }, parsed_output: null });
    expect(await a.gw.callFeature('food.text', ctx, textInput)).toMatchObject({ ok: false, reason: 'refused' });
    const b = mk({ model: 'claude-sonnet-5-5', stop_reason: 'max_tokens', usage: { input_tokens: 10, output_tokens: 10 }, parsed_output: null });
    expect(await b.gw.callFeature('food.text', ctx, textInput)).toMatchObject({ ok: false, reason: 'invalid_output' });
    const timeoutErr = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const c = mk(timeoutErr);
    expect(await c.gw.callFeature('food.text', ctx, textInput)).toMatchObject({ ok: false, reason: 'timeout' });
    expect(c.s.calls[0]!.finish!.outcome).toBe('timeout');
  });

  it('cost uses the four token rates', () => {
    expect(costOf({ input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }, { model: 'm', inputPerMtok: 2, outputPerMtok: 10, cacheReadPerMtok: 0.2, cacheWritePerMtok: 2.5 })).toBeCloseTo(14.7);
  });
});
