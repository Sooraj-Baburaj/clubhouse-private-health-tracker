import { z } from 'zod';
import { MEAL_SLOTS, NOTIFICATION_TYPES, Units, MealSlot, NotificationType } from './enums';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
export const HHmm = hhmm;
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export type LocalDate = z.infer<typeof LocalDate>;

/** Percent-of-target thresholds for one nutrient. `null` means the band never applies. */
export const NutrientThreshold = z.object({
  yellowUnderBelow: z.number().min(0).max(300).nullable(),
  greenUpTo: z.number().min(0).max(1000).nullable(),
  yellowOverUpTo: z.number().min(0).max(1000).nullable(),
  redOver: z.boolean(),
  labels: z.object({ under: z.string(), ok: z.string(), overSoft: z.string(), over: z.string() }),
});
export type NutrientThreshold = z.infer<typeof NutrientThreshold>;

export const Thresholds = z.object({
  kcal: NutrientThreshold,
  protein: NutrientThreshold,
  carbs: NutrientThreshold,
  fat: NutrientThreshold,
  fibre: NutrientThreshold,
});
export type Thresholds = z.infer<typeof Thresholds>;

/** Appendix E defaults. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  kcal: { yellowUnderBelow: 85, greenUpTo: 105, yellowOverUpTo: 115, redOver: true, labels: { under: 'a bit low', ok: 'on track', overSoft: 'a bit over', over: 'over' } },
  protein: { yellowUnderBelow: 80, greenUpTo: 150, yellowOverUpTo: null, redOver: false, labels: { under: 'low', ok: 'on track', overSoft: 'plenty', over: 'plenty' } },
  carbs: { yellowUnderBelow: 70, greenUpTo: 110, yellowOverUpTo: 125, redOver: true, labels: { under: 'low', ok: 'on track', overSoft: 'a bit over', over: 'over' } },
  fat: { yellowUnderBelow: 70, greenUpTo: 110, yellowOverUpTo: 125, redOver: true, labels: { under: 'low', ok: 'on track', overSoft: 'a bit over', over: 'over' } },
  fibre: { yellowUnderBelow: 70, greenUpTo: null, yellowOverUpTo: null, redOver: false, labels: { under: 'low', ok: 'on track', overSoft: 'on track', over: 'on track' } },
};

export const SlotWindow = z.object({ label: z.string().min(1).max(40), until: hhmm.nullable() });
export const MealSlotSettings = z.record(MealSlot, SlotWindow);
export type MealSlotSettings = z.infer<typeof MealSlotSettings>;
export const DEFAULT_MEAL_SLOTS: Record<MealSlot, { label: string; until: string | null }> = {
  breakfast: { label: 'Breakfast', until: '10:30' },
  morning_snack: { label: 'Morning snack', until: '12:00' },
  lunch: { label: 'Lunch', until: '15:00' },
  evening_snack: { label: 'Evening snack', until: '18:30' },
  dinner: { label: 'Dinner', until: null },
};

export const StreakSettings = z.object({
  graceEarnedPer7: z.number().int().min(0).max(3),
  graceBankMax: z.number().int().min(0).max(7),
  pauseWindowDays: z.number().int().min(1).max(14),
  resetAfterDays: z.number().int().min(1).max(30),
  vacationDaysPerQuarter: z.number().int().min(0).max(90),
  teamStreakEnabled: z.boolean(),
  milestones: z.array(z.number().int().positive()).max(12),
  teamMilestones: z.array(z.number().int().positive()).max(12),
});
export type StreakSettings = z.infer<typeof StreakSettings>;
export const DEFAULT_STREAK_SETTINGS: StreakSettings = {
  graceEarnedPer7: 1,
  graceBankMax: 3,
  pauseWindowDays: 3,
  resetAfterDays: 3,
  vacationDaysPerQuarter: 21,
  teamStreakEnabled: true,
  milestones: [7, 14, 30, 60, 100, 365],
  teamMilestones: [3, 7, 14, 30],
};

export const NotificationDefault = z.object({
  enabled: z.boolean(),
  time: hhmm.nullable(),
  days: z.array(z.number().int().min(0).max(6)),
  smartTime: z.boolean(),
});
export type NotificationDefault = z.infer<typeof NotificationDefault>;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/** Appendix C defaults. Days: 0 = Monday … 6 = Sunday. */
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, NotificationDefault> = {
  breakfast_reminder: { enabled: true, time: '09:30', days: ALL_DAYS, smartTime: false },
  morning_snack_reminder: { enabled: false, time: '11:30', days: ALL_DAYS, smartTime: false },
  lunch_reminder: { enabled: true, time: '13:30', days: ALL_DAYS, smartTime: false },
  evening_snack_reminder: { enabled: false, time: '17:30', days: ALL_DAYS, smartTime: false },
  dinner_reminder: { enabled: true, time: '20:30', days: ALL_DAYS, smartTime: false },
  activity_reminder: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  momentum_at_risk: { enabled: false, time: '21:30', days: ALL_DAYS, smartTime: false },
  weekly_recap: { enabled: true, time: '19:00', days: [6], smartTime: false },
  chat_mention: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  chat_digest: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  meme_fired: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  milestone: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  plan_updated: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  announcement: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  ai_budget_alert: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  weigh_in_reminder: { enabled: false, time: '08:00', days: [0], smartTime: false },
  habit_reminder: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  board_results: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
  system: { enabled: true, time: null, days: ALL_DAYS, smartTime: false },
};
/** Types a member cannot switch off (SRS Appendix C "Member can change: No"). */
export const LOCKED_NOTIFICATION_TYPES: NotificationType[] = ['announcement', 'ai_budget_alert', 'system'];

export const QuietHours = z.object({ start: hhmm, end: hhmm }).nullable();
export type QuietHours = z.infer<typeof QuietHours>;
export const DEFAULT_QUIET_HOURS = { start: '22:00', end: '07:00' };

export const CopyPool = z.record(z.string(), z.array(z.string().min(1).max(160)).max(20));
export type CopyPool = z.infer<typeof CopyPool>;

/** The team's knobs for Crew points (the rest of the rules are fixed and versioned in the domain). */
export const BoardSettings = z.object({
  /** An unplanned activity earns workout points from this many minutes. */
  workoutMinMinutes: z.number().int().min(5).max(90),
  /** Workouts that earn points each week. */
  workoutCap: z.number().int().min(1).max(7),
  /** Workouts that count as "plan done" for members without a weekly plan. */
  noPlanTarget: z.number().int().min(1).max(7),
  /** Monday-morning podium and awards in the team chat. */
  postResults: z.boolean(),
  /** Top-five card on the admin overview. */
  showOnDashboard: z.boolean(),
});
export type BoardSettings = z.infer<typeof BoardSettings>;
export const DEFAULT_BOARD_SETTINGS: BoardSettings = { workoutMinMinutes: 20, workoutCap: 4, noPlanTarget: 3, postResults: true, showOnDashboard: true };

export const TeamSettings = z.object({
  mealSlots: MealSlotSettings,
  thresholds: Thresholds,
  streaks: StreakSettings,
  notificationDefaults: z.record(z.enum(NOTIFICATION_TYPES), NotificationDefault),
  defaultQuietHours: QuietHours,
  copyPool: CopyPool,
  privacyDefault: z.enum(['summary', 'full']),
  roastDefault: z.boolean(),
  eatBackDefault: z.boolean(),
  featureFlags: z.object({
    teamPulse: z.boolean(),
    roastMemes: z.boolean(),
    naturalLanguageEntry: z.boolean(),
    leaderboard: z.boolean(),
  }),
  board: BoardSettings,
  memes: z.object({ dailyChatCap: z.number().int().min(0).max(100), confidenceThreshold: z.number().min(0).max(1) }),
  chat: z.object({ digestMinutes: z.number().int().min(5).max(240), keywords: z.array(z.string().min(1).max(40)).max(200) }),
  media: z.object({ retentionDays: z.number().int().min(7).max(365), memeLibraryCap: z.number().int().min(10).max(5000), softCapMb: z.number().int().min(50).max(100_000) }),
  maintenanceBanner: z.object({ message: z.string().max(280), startsAt: z.string().nullable(), endsAt: z.string().nullable() }).nullable(),
});
export type TeamSettings = z.infer<typeof TeamSettings>;

export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  mealSlots: DEFAULT_MEAL_SLOTS,
  thresholds: DEFAULT_THRESHOLDS,
  streaks: DEFAULT_STREAK_SETTINGS,
  notificationDefaults: DEFAULT_NOTIFICATION_PREFS,
  defaultQuietHours: DEFAULT_QUIET_HOURS,
  copyPool: {},
  privacyDefault: 'full',
  roastDefault: true,
  eatBackDefault: false,
  featureFlags: { teamPulse: true, roastMemes: true, naturalLanguageEntry: true, leaderboard: true },
  board: DEFAULT_BOARD_SETTINGS,
  memes: { dailyChatCap: 10, confidenceThreshold: 0.6 },
  chat: { digestMinutes: 30, keywords: ['cheat day', 'pizza'] },
  media: { retentionDays: 30, memeLibraryCap: 500, softCapMb: 800 },
  maintenanceBanner: null,
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Stored settings with defaults filled in for keys added after the team was created (a new feature flag, the board
 * settings, a new notification type). The stored JSON is never parsed on read, and the settings schema needs every key,
 * so without this an old team would read `undefined` and fail validation on its next save.
 */
export function withSettingDefaults(stored: TeamSettings): TeamSettings {
  const s = stored as Partial<TeamSettings> & Record<string, unknown>;
  const D = DEFAULT_TEAM_SETTINGS;
  const merge = <T extends object>(def: T, cur: unknown): T => (isRecord(cur) ? { ...def, ...(cur as Partial<T>) } : { ...def });
  return {
    ...D,
    ...s,
    mealSlots: merge(D.mealSlots, s.mealSlots),
    thresholds: merge(D.thresholds, s.thresholds),
    streaks: merge(D.streaks, s.streaks),
    notificationDefaults: merge(D.notificationDefaults, s.notificationDefaults),
    featureFlags: merge(D.featureFlags, s.featureFlags),
    board: merge(D.board, s.board),
    memes: merge(D.memes, s.memes),
    chat: merge(D.chat, s.chat),
    media: merge(D.media, s.media),
    copyPool: isRecord(s.copyPool) ? (s.copyPool as CopyPool) : D.copyPool,
    maintenanceBanner: s.maintenanceBanner ?? null,
  };
}

export const TeamBasics = z.object({ name: z.string().min(1).max(60), timezone: z.string().min(1), units: Units });
export type TeamBasics = z.infer<typeof TeamBasics>;

export { MEAL_SLOTS };
