import { describe, expect, it } from 'vitest';
import { TriggerDefinition } from '../src/triggers';

const base = {
  name: 'Test',
  event: 'food_log_saved',
  match: 'all',
  action: 'show_private',
  selection: { mode: 'random_tag', tag: 'celebrate', noRepeatDays: 30 },
  cooldown: 'member_day',
  tone: 'celebrate',
  caption: null,
  enabled: true,
  excludedUserIds: [],
} as const;

const messages = (conditions: unknown[], extra: Record<string, unknown> = {}) => {
  const r = TriggerDefinition.safeParse({ ...base, conditions, ...extra });
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('trigger definition rules', () => {
  it('needs the food tag or activity a weekly count refers to', () => {
    expect(messages([{ type: 'count_this_week', what: 'food_tag', op: 'gte', value: 3 }])).toContain('Pick the food tag to count.');
    expect(messages([{ type: 'count_this_week', what: 'activity_type', op: 'gte', value: 3 }])).toContain('Pick the activity to count.');
    expect(messages([{ type: 'count_this_week', what: 'food_logs', op: 'gte', value: 3 }])).toEqual([]);
  });

  it('needs words unless the team keyword list is used', () => {
    expect(messages([{ type: 'message_contains', words: [], useTeamKeywords: false }], { event: 'chat_message_posted' })).toContain('Add at least one word, or use the team keyword list.');
    expect(messages([{ type: 'message_contains', words: [], useTeamKeywords: true }], { event: 'chat_message_posted' })).toEqual([]);
  });

  it('keeps roasts away from weight gain', () => {
    expect(messages([{ type: 'weight_change', direction: 'up', kg: 1, overDays: 7 }], { tone: 'roast', event: 'weight_log_saved' }).join(' ')).toMatch(/celebrate or neutral/);
  });
});
