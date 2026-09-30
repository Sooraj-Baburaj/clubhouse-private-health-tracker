import { z } from 'zod';
import { FoodTag, MemeTone, StreakKind, TriggerAction, TriggerEvent } from './enums';

const HHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const CompareOp = z.enum(['gt', 'gte', 'lt', 'lte', 'eq']);
export type CompareOp = z.infer<typeof CompareOp>;
const Macro = z.enum(['protein', 'carbs', 'fat', 'fibre']);

export const PERSONAL_RECORDS = ['longest_run', 'longest_swim', 'longest_ride', 'longest_streak', 'most_sessions_week'] as const;
export const PersonalRecord = z.enum(PERSONAL_RECORDS);
export type PersonalRecord = z.infer<typeof PersonalRecord>;

/** Fixed condition vocabulary (ADM-MEME-11 plus what the Appendix D starter catalogue needs). */
export const TriggerCondition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('meal_kcal'), op: CompareOp, value: z.number().min(0).max(10000) }),
  z.object({ type: z.literal('item_kcal'), op: CompareOp, value: z.number().min(0).max(10000) }),
  z.object({ type: z.literal('macro_amount'), macro: Macro, op: CompareOp, grams: z.number().min(0).max(1000) }),
  z.object({ type: z.literal('macro_percent'), macro: Macro, op: CompareOp, percent: z.number().min(0).max(1000) }),
  z.object({ type: z.literal('food_tags'), tags: z.array(FoodTag).min(1), match: z.enum(['any', 'all']) }),
  z.object({ type: z.literal('time_of_day'), from: HHmm, to: HHmm }),
  z.object({
    type: z.literal('count_this_week'),
    what: z.enum(['food_tag', 'food_logs', 'activity_logs', 'activity_type']),
    tag: FoodTag.optional(),
    activityTypeId: z.string().uuid().optional(),
    op: CompareOp,
    value: z.number().int().min(0).max(1000),
  }),
  z.object({ type: z.literal('days_since_last_log'), op: CompareOp, days: z.number().int().min(0).max(365) }),
  z.object({ type: z.literal('plan_item_completed') }),
  z.object({ type: z.literal('streak_milestone'), kind: z.union([StreakKind, z.literal('team')]), values: z.array(z.number().int().positive()).min(1) }),
  z.object({ type: z.literal('streak_resumed') }),
  z.object({ type: z.literal('personal_record'), records: z.array(PersonalRecord).min(1) }),
  z.object({ type: z.literal('message_contains'), words: z.array(z.string().min(1).max(40)).max(50), useTeamKeywords: z.boolean() }),
  z.object({ type: z.literal('member_in_list'), userIds: z.array(z.string().uuid()).min(1) }),
  z.object({ type: z.literal('macro_target_met_days'), macro: z.enum(['kcal', 'protein', 'carbs', 'fat', 'fibre']), days: z.number().int().min(1).max(60) }),
  z.object({ type: z.literal('team_all_logged') }),
  z.object({ type: z.literal('not_on_vacation') }),
  z.object({ type: z.literal('weight_change'), direction: z.enum(['down', 'up']), kg: z.number().min(0).max(50), overDays: z.number().int().min(1).max(90) }),
  z.object({ type: z.literal('weight_new_low') }),
  z.object({ type: z.literal('calorie_band'), bands: z.array(z.enum(['green', 'under', 'over', 'red'])).min(1) }),
]);
export type TriggerCondition = z.infer<typeof TriggerCondition>;
export type TriggerConditionType = TriggerCondition['type'];

/** Conditions that may never back a roast (ADM-MEME-15). */
export const ROAST_FORBIDDEN_CONDITIONS: TriggerConditionType[] = ['weight_change', 'calorie_band'];

export const CooldownScope = z.enum(['member_day', 'member_week', 'team_day', 'plan_item_week', 'record_week', 'none']);
export type CooldownScope = z.infer<typeof CooldownScope>;

export const MemeSelection = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('specific'), memeId: z.string().uuid() }),
  z.object({ mode: z.literal('random_tag'), tag: z.string().min(1).max(30), noRepeatDays: z.number().int().min(0).max(365) }),
]);
export type MemeSelection = z.infer<typeof MemeSelection>;

export const TriggerDefinition = z
  .object({
    name: z.string().min(1).max(60),
    event: TriggerEvent,
    match: z.enum(['all', 'any']),
    conditions: z.array(TriggerCondition).max(12),
    action: TriggerAction,
    selection: MemeSelection,
    cooldown: CooldownScope,
    tone: MemeTone,
    caption: z.string().max(160).nullable(),
    excludedUserIds: z.array(z.string().uuid()),
    enabled: z.boolean(),
  })
  .superRefine((t, ctx) => {
    if (t.tone === 'roast') {
      for (const c of t.conditions) {
        if (ROAST_FORBIDDEN_CONDITIONS.includes(c.type) || (c.type === 'weight_change' && c.direction === 'up')) {
          ctx.addIssue({ code: 'custom', path: ['conditions'], message: 'Weight changes and missed calorie bands can only be used with a celebrate or neutral tone.' });
        }
      }
    }
    if ((t.action === 'reply_to_message' || t.action === 'react_to_message') && t.event !== 'chat_message_posted') {
      ctx.addIssue({ code: 'custom', path: ['action'], message: 'Replying or reacting needs the "chat message posted" event.' });
    }
  });
export type TriggerDefinition = z.infer<typeof TriggerDefinition>;

export const CONDITION_LABELS: Record<TriggerConditionType, string> = {
  meal_kcal: 'Meal calories',
  item_kcal: 'Single item calories',
  macro_amount: 'Macro amount in the meal',
  macro_percent: 'Macro % of daily target',
  food_tags: 'Food tags in the meal',
  time_of_day: 'Time of day',
  count_this_week: 'Count this week',
  days_since_last_log: 'Days since last log',
  plan_item_completed: 'Weekly plan item completed',
  streak_milestone: 'Streak milestone',
  streak_resumed: 'Comeback after a pause',
  personal_record: 'Personal record',
  message_contains: 'Message contains a word',
  member_in_list: 'Member is in list',
  macro_target_met_days: 'Target met N days running',
  team_all_logged: 'Whole team logged today',
  not_on_vacation: 'Member not on vacation',
  weight_change: 'Weight change',
  weight_new_low: 'New lowest weight',
  calorie_band: 'Calorie band at day end',
};
