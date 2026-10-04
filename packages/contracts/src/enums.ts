import { z } from 'zod';

export const ROLES = ['member', 'admin', 'super_admin'] as const;
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;
export const ROLE_RANK: Record<Role, number> = { member: 0, admin: 1, super_admin: 2 };

export const USER_STATUSES = ['active', 'deactivated'] as const;
export const UserStatus = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatus>;

export const MEAL_SLOTS = ['breakfast', 'morning_snack', 'lunch', 'evening_snack', 'dinner'] as const;
export const MealSlot = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof MealSlot>;

export const SEXES = ['male', 'female', 'unspecified'] as const;
export const Sex = z.enum(SEXES);
export type Sex = z.infer<typeof Sex>;

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export const ActivityLevel = z.enum(ACTIVITY_LEVELS);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const GOAL_TYPES = ['lose', 'maintain', 'gain'] as const;
export const GoalType = z.enum(GOAL_TYPES);
export type GoalType = z.infer<typeof GoalType>;

export const UNITS = ['metric', 'imperial'] as const;
export const Units = z.enum(UNITS);
export type Units = z.infer<typeof Units>;

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const;
export const Nutrient = z.enum(NUTRIENTS);
export type Nutrient = z.infer<typeof Nutrient>;

export const BANDS = ['green', 'yellow', 'red', 'neutral'] as const;
export const Band = z.enum(BANDS);
export type Band = z.infer<typeof Band>;

export const STREAK_KINDS = ['logging', 'activity', 'in_range'] as const;
export const StreakKind = z.enum(STREAK_KINDS);
export type StreakKind = z.infer<typeof StreakKind>;

export const STREAK_STATUSES = ['active', 'paused', 'reset', 'vacation'] as const;
export const StreakStatus = z.enum(STREAK_STATUSES);
export type StreakStatus = z.infer<typeof StreakStatus>;

export const INTENSITIES = ['light', 'moderate', 'hard'] as const;
export const Intensity = z.enum(INTENSITIES);
export type Intensity = z.infer<typeof Intensity>;

export const GYM_FOCUSES = ['strength', 'cardio', 'mixed'] as const;
export const GymFocus = z.enum(GYM_FOCUSES);
export type GymFocus = z.infer<typeof GymFocus>;

export const IMAGE_KINDS = ['food', 'activity', 'chat', 'meme', 'avatar', 'logo', 'diet', 'export'] as const;
export const ImageKind = z.enum(IMAGE_KINDS);
export type ImageKind = z.infer<typeof ImageKind>;
export const RETAINED_IMAGE_KINDS: ImageKind[] = ['food', 'activity', 'chat'];

export const FOOD_SOURCES = ['seed', 'usda', 'member', 'admin', 'ai'] as const;
export const FoodSource = z.enum(FOOD_SOURCES);
export type FoodSource = z.infer<typeof FoodSource>;

export const FOOD_TAGS = ['dessert', 'fast_food', 'alcohol', 'fried', 'sugary_drink', 'high_protein', 'high_fibre', 'fruit', 'vegetable', 'dairy', 'grain', 'legume', 'meat', 'seafood', 'egg', 'snack', 'beverage', 'street_food'] as const;
export const FoodTag = z.enum(FOOD_TAGS);
export type FoodTag = z.infer<typeof FoodTag>;

export const DAY_TYPES = ['any', 'training', 'rest'] as const;
export const DayType = z.enum(DAY_TYPES);
export type DayType = z.infer<typeof DayType>;

export const DIET_PLAN_STATUSES = ['draft', 'published', 'archived'] as const;
export const DietPlanStatus = z.enum(DIET_PLAN_STATUSES);
export type DietPlanStatus = z.infer<typeof DietPlanStatus>;

export const MEME_TONES = ['roast', 'celebrate', 'neutral'] as const;
export const MemeTone = z.enum(MEME_TONES);
export type MemeTone = z.infer<typeof MemeTone>;

export const MEME_TAGS_DEFAULT = ['heavy', 'salad', 'gym', 'comeback', 'ghost', 'celebrate', 'team', 'dessert', 'late', 'record', 'custom'] as const;

export const TRIGGER_EVENTS = [
  'log_saved',
  'food_log_saved',
  'activity_log_saved',
  'weight_log_saved',
  'day_end',
  'streak_changed',
  'chat_message_posted',
  'weekly_recap',
] as const;
export const TriggerEvent = z.enum(TRIGGER_EVENTS);
export type TriggerEvent = z.infer<typeof TriggerEvent>;

export const TRIGGER_ACTIONS = ['show_private', 'post_chat_tag', 'post_chat_no_tag', 'reply_to_message', 'react_to_message'] as const;
export const TriggerAction = z.enum(TRIGGER_ACTIONS);
export type TriggerAction = z.infer<typeof TriggerAction>;

export const REACTION_QUICK_SET = ['🔥', '👏', '😂', '💀', '🥗', '🍰'] as const;

export const AI_FEATURE_KEYS = ['food.photo', 'food.text', 'home.summary', 'progress.narrative', 'diet.draft'] as const;
export const AiFeatureKey = z.enum(AI_FEATURE_KEYS);
export type AiFeatureKey = z.infer<typeof AiFeatureKey>;

export const AI_MODELS = ['claude-sonnet-5-5', 'claude-haiku-4-5'] as const;
export const AiModel = z.enum(AI_MODELS);
export type AiModel = z.infer<typeof AiModel>;

export const AI_OUTCOMES = ['pending', 'ok', 'fallback', 'refused', 'timeout', 'error', 'invalid_output', 'budget_blocked', 'cap_blocked', 'lost'] as const;
export const AiOutcome = z.enum(AI_OUTCOMES);
export type AiOutcome = z.infer<typeof AiOutcome>;

export const NOTIFICATION_TYPES = [
  'breakfast_reminder',
  'morning_snack_reminder',
  'lunch_reminder',
  'evening_snack_reminder',
  'dinner_reminder',
  'activity_reminder',
  'momentum_at_risk',
  'weekly_recap',
  'chat_mention',
  'chat_digest',
  'meme_fired',
  'milestone',
  'plan_updated',
  'announcement',
  'ai_budget_alert',
  'weigh_in_reminder',
  'habit_reminder',
  'board_results',
  'system',
] as const;
export const NotificationType = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationType>;

export const SCHEDULED_NOTIFICATION_TYPES: NotificationType[] = [
  'breakfast_reminder',
  'morning_snack_reminder',
  'lunch_reminder',
  'evening_snack_reminder',
  'dinner_reminder',
  'activity_reminder',
  'momentum_at_risk',
  'weekly_recap',
  'weigh_in_reminder',
  'habit_reminder',
];

export const SLOT_REMINDER: Record<MealSlot, NotificationType> = {
  breakfast: 'breakfast_reminder',
  morning_snack: 'morning_snack_reminder',
  lunch: 'lunch_reminder',
  evening_snack: 'evening_snack_reminder',
  dinner: 'dinner_reminder',
};

export const THEMES = ['light', 'dark', 'system'] as const;
export const Theme = z.enum(THEMES);
export type Theme = z.infer<typeof Theme>;

export const PALETTES = ['day', 'night', 'organic', 'chili', 'mango', 'plum'] as const;
export const Palette = z.enum(PALETTES);
export type Palette = z.infer<typeof Palette>;

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const; // 0 = Monday … 6 = Sunday (ISO order)
