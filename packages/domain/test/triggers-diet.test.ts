import { describe, expect, it } from 'vitest';
import { TriggerDefinition } from '@clubhouse/contracts';
import { evaluateTriggers, fitsToday, messageContains, nextOpenSlot, rankOptions, type TriggerRule, type TriggerSnapshot } from '../src';

const snap = (over: Partial<TriggerSnapshot> = {}): TriggerSnapshot => ({
  event: 'food_log_saved',
  eventKey: 'log-1',
  userId: '00000000-0000-4000-8000-000000000001',
  localDate: '2026-09-30',
  localTime: '21:00',
  weekStart: '2026-09-28',
  meal: { kcal: 1300, items: [{ kcal: 900, tags: ['fast_food'] }, { kcal: 400, tags: ['dessert'] }], macros: { protein: 30, carbs: 150, fat: 60, fibre: 4 } },
  dayTotals: { kcal: 2400, protein: 90, carbs: 300, fat: 90, fibre: 15 },
  targets: { kcal: 2000, protein: 140, carbs: 220, fat: 60, fibre: 28 },
  weekCounts: { foodTags: { dessert: 3 }, foodLogs: 12, activityLogs: 2, activityTypes: {} },
  daysSinceLastLog: 0,
  planItemCompleted: null,
  streaks: {},
  streakResumed: false,
  personalRecords: [],
  message: null,
  macroTargetMetDays: {},
  teamAllLogged: false,
  onVacation: false,
  weightChangeOver: () => null,
  weightNewLow: false,
  dayBand: null,
  teamKeywords: ['pizza'],
  roastOptOut: false,
  ...over,
});

const heavy: TriggerRule = {
  id: 't-heavy',
  order: 1,
  name: 'Heavy meal',
  event: 'food_log_saved',
  match: 'any',
  conditions: [
    { type: 'meal_kcal', op: 'gt', value: 1200 },
    { type: 'item_kcal', op: 'gt', value: 800 },
  ],
  action: 'post_chat_tag',
  selection: { mode: 'random_tag', tag: 'heavy', noRepeatDays: 30 },
  cooldown: 'member_day',
  tone: 'roast',
  caption: null,
  excludedUserIds: [],
  enabled: true,
};
const salad: TriggerRule = { ...heavy, id: 't-salad', order: 2, name: 'Salad energy', match: 'all', conditions: [{ type: 'meal_kcal', op: 'lt', value: 400 }, { type: 'macro_amount', macro: 'fibre', op: 'gt', grams: 8 }], tone: 'celebrate', selection: { mode: 'random_tag', tag: 'salad', noRepeatDays: 30 } };
const memes = [
  { id: 'm1', tags: ['heavy'], tone: 'roast' as const, enabled: true },
  { id: 'm2', tags: ['heavy'], tone: 'roast' as const, enabled: true },
  { id: 'm3', tags: ['salad'], tone: 'celebrate' as const, enabled: true },
];
const common = { memes, chatFiresToday: 0, dailyChatCap: 10, roastEnabledForTeam: true, rng: () => 0 };

describe('trigger evaluation (SYS-CHAT-10, ADM-MEME-*)', () => {
  it('fires a matching roast and picks a meme', () => {
    const d = evaluateTriggers({ ...common, snapshot: snap(), rules: [heavy, salad], fires: [] });
    expect(d.find((x) => x.triggerId === 't-heavy')).toMatchObject({ fire: true, memeId: 'm1', postsToChat: true });
    expect(d.find((x) => x.triggerId === 't-salad')!.fire).toBe(false);
  });
  it('respects roast opt-out', () => {
    const d = evaluateTriggers({ ...common, snapshot: snap({ roastOptOut: true }), rules: [heavy], fires: [] });
    expect(d[0]!.fire).toBe(false);
    expect(d[0]!.reasons.at(-1)).toMatch(/opted out/);
  });
  it('respects cooldown and the daily chat cap', () => {
    const fires = [{ triggerId: 't-heavy', userId: snap().userId, memeId: 'm1', cooldownKey: `${snap().userId}:2026-09-30`, localDate: '2026-09-30', postedToChat: true }];
    expect(evaluateTriggers({ ...common, snapshot: snap(), rules: [heavy], fires })[0]!.fire).toBe(false);
    expect(evaluateTriggers({ ...common, chatFiresToday: 10, snapshot: snap(), rules: [heavy], fires: [] })[0]!.fire).toBe(false);
  });
  it('avoids repeating a meme to the same member within 30 days', () => {
    const fires = [{ triggerId: 'other', userId: snap().userId, memeId: 'm1', cooldownKey: 'x', localDate: '2026-09-20', postedToChat: true }];
    const d = evaluateTriggers({ ...common, snapshot: snap(), rules: [heavy], fires });
    expect(d[0]!.memeId).toBe('m2');
  });
  it('only one trigger fires per event, except in dry runs', () => {
    const second = { ...heavy, id: 't-heavy-2', order: 3 };
    const d = evaluateTriggers({ ...common, snapshot: snap(), rules: [heavy, second], fires: [] });
    expect(d.filter((x) => x.fire)).toHaveLength(1);
    const dry = evaluateTriggers({ ...common, snapshot: snap(), rules: [heavy, second], fires: [], dryRun: true });
    expect(dry.filter((x) => x.fire)).toHaveLength(2);
  });
  it('matches keywords on word boundaries', () => {
    expect(messageContains('Cheat day with PIZZA tonight', ['pizza'])).toBe('pizza');
    expect(messageContains('pizzeria review', ['pizza'])).toBeNull();
  });
  it('schema rejects roasts built on weight or missed bands', () => {
    const bad = TriggerDefinition.safeParse({ ...heavy, conditions: [{ type: 'weight_change', direction: 'up', kg: 1, overDays: 7 }] });
    expect(bad.success).toBe(false);
    const ok = TriggerDefinition.safeParse({ ...heavy, tone: 'celebrate', conditions: [{ type: 'weight_new_low' }] });
    expect(ok.success).toBe(true);
  });
});

describe('diet fit (APP-DIET-03)', () => {
  const remaining = { kcal: 700, protein: 40, carbs: 80, fat: 20, fibre: 10 };
  it('fits when within calories, fat and carbs', () => {
    expect(fitsToday({ kcal: 600, protein: 30, carbs: 70, fat: 18, fibre: 5 }, remaining)).toBe(true);
    expect(fitsToday({ kcal: 900, protein: 30, carbs: 70, fat: 18, fibre: 5 }, remaining)).toBe(false);
  });
  it('ranks fitting options first, best fit first', () => {
    const opts = [
      { id: 'big', nutrition: { kcal: 950, protein: 40, carbs: 90, fat: 30, fibre: 5 } },
      { id: 'lean', nutrition: { kcal: 500, protein: 35, carbs: 50, fat: 12, fibre: 6 } },
      { id: 'light', nutrition: { kcal: 200, protein: 5, carbs: 30, fat: 5, fibre: 3 } },
    ];
    const r = rankOptions('dinner', opts, remaining, ['dinner']);
    expect(r[0]!.option.id).toBe('lean');
    expect(r.at(-1)!.option.id).toBe('big');
  });
  it('finds the next open slot', () => {
    expect(nextOpenSlot('lunch', ['breakfast', 'lunch'])).toBe('evening_snack');
    expect(nextOpenSlot('dinner', ['dinner'])).toBeNull();
  });
});
