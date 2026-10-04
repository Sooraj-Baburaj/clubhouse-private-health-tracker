import { z } from 'zod';
import { ActivityLevel, GoalType, Palette, Role, Sex, Theme, Units, type AiFeatureKey, type StreakKind } from '../enums';
import type { Thresholds, MealSlotSettings, StreakSettings } from '../settings';
import { HHmmStr, LocalDateStr, type PersonRef } from './common';

export const DietPrefs = z.object({
  allergies: z.array(z.string().min(1).max(40)).max(30),
  dislikes: z.array(z.string().min(1).max(40)).max(50),
  cuisines: z.array(z.string().min(1).max(40)).max(20),
  diet: z.enum(['none', 'vegetarian', 'vegan', 'eggetarian', 'pescatarian']),
});
export type DietPrefs = z.infer<typeof DietPrefs>;

export const PrivacyPrefs = z.object({
  teammatesSee: z.enum(['summary', 'full']),
  teamPulseOptIn: z.boolean(),
  roastMemes: z.boolean(),
  roastPromptSeen: z.boolean(),
  /** On the crew leaderboard (rank, points, awards). Off: left out of everyone's board, still sees it. */
  showOnBoard: z.boolean(),
});
export type PrivacyPrefs = z.infer<typeof PrivacyPrefs>;

export const AiOptOuts = z.object({ photo: z.boolean(), summary: z.boolean(), noticeSeen: z.boolean() });
export type AiOptOuts = z.infer<typeof AiOptOuts>;

/** Habit reminders: one bundled push per time slot (default) or one per habit; share habit names with teammates. */
export const HabitPrefs = z.object({ bundle: z.boolean(), share: z.boolean() });
export type HabitPrefs = z.infer<typeof HabitPrefs>;

export const MomentumPrefs = z.object({ showOnToday: z.array(z.enum(['logging', 'activity', 'in_range'])).max(3) });
export const AppPrefs = z.object({ theme: Theme, palette: Palette });
export type AppPrefs = z.infer<typeof AppPrefs>;
export const QuietHoursSchema = z.object({ start: HHmmStr, end: HHmmStr }).nullable();

const heightCm = z.number().min(100).max(250);
const weightKg = z.number().min(25).max(350);

export const OnboardingRequest = z.object({
  units: Units,
  heightCm,
  weightKg,
  dob: LocalDateStr,
  sex: Sex,
  activityLevel: ActivityLevel,
  goalType: GoalType,
  paceKgWeek: z.number().min(0).max(1).nullable().optional(),
  targetWeightKg: weightKg.nullable().optional(),
  targetDate: LocalDateStr.nullable().optional(),
  timezone: z.string().min(1).max(64),
});
export type OnboardingRequest = z.infer<typeof OnboardingRequest>;

export const ProfileUpdateRequest = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    units: Units,
    heightCm,
    dob: LocalDateStr,
    sex: Sex,
    activityLevel: ActivityLevel,
    timezone: z.string().min(1).max(64),
    avatarImageId: z.string().uuid().nullable(),
  })
  .partial();
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequest>;

export const GoalUpdateRequest = z.object({
  goalType: GoalType,
  paceKgWeek: z.number().min(0).max(1).nullable().optional(),
  targetWeightKg: weightKg.nullable().optional(),
  targetDate: LocalDateStr.nullable().optional(),
});
export type GoalUpdateRequest = z.infer<typeof GoalUpdateRequest>;

export const PreferencesUpdateRequest = z
  .object({
    dietPrefs: DietPrefs,
    privacy: PrivacyPrefs.partial(),
    aiOptOuts: AiOptOuts.partial(),
    momentumPrefs: MomentumPrefs,
    habitPrefs: HabitPrefs.partial(),
    appPrefs: AppPrefs.partial(),
    quietHours: QuietHoursSchema,
    notificationsMaster: z.boolean(),
    chatMute: z.enum(['off', '1h', '8h', '1w']),
    eatBackExercise: z.boolean(),
  })
  .partial();
export type PreferencesUpdateRequest = z.infer<typeof PreferencesUpdateRequest>;

export const VacationRequest = z.object({ from: LocalDateStr, to: LocalDateStr }).refine((v) => v.from <= v.to, 'End must be after start');
export type VacationRequest = z.infer<typeof VacationRequest>;

export interface TargetsDto {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  tdee: number | null;
  bmr: number | null;
  floorHit: boolean;
  floor: number | null;
  paceCapped: boolean;
  effectivePaceKgPerWeek: number | null;
  explanation: string;
  overridden: string[];
  overriddenBy: PersonRef | null;
  overrideReason: string | null;
  computedFromWeightKg: number | null;
  inputs: { sex: string | null; ageYears: number | null; heightCm: number | null; weightKg: number | null; activityLevel: string | null; goalType: string | null } | null;
}

export interface ProfileDto {
  units: 'metric' | 'imperial';
  heightCm: number | null;
  weightKg: number | null;
  dob: string | null;
  sex: 'male' | 'female' | 'unspecified' | null;
  activityLevel: string | null;
  goalType: 'lose' | 'maintain' | 'gain' | null;
  targetWeightKg: number | null;
  targetDate: string | null;
  paceKgWeek: number | null;
  eatBackExercise: boolean;
  dietPrefs: DietPrefs;
  privacy: PrivacyPrefs;
  aiOptOuts: AiOptOuts;
  momentumPrefs: { showOnToday: StreakKind[] };
  habitPrefs: HabitPrefs;
  appPrefs: AppPrefs;
  quietHours: { start: string; end: string } | null;
  notificationsMaster: boolean;
  chatMutedUntil: string | null;
  vacationRanges: { from: string; to: string }[];
  vacationDaysLeftThisQuarter: number;
  timezone: string;
}

export interface MeResponse {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    role: z.infer<typeof Role>;
    avatarUrl: string | null;
    mustChangePassword: boolean;
    onboarded: boolean;
    totpEnabled: boolean;
  };
  team: {
    id: string;
    name: string;
    timezone: string;
    units: 'metric' | 'imperial';
    logoUrl: string | null;
    mealSlots: MealSlotSettings;
    thresholds: Thresholds;
    streaks: StreakSettings;
    featureFlags: { teamPulse: boolean; roastMemes: boolean; naturalLanguageEntry: boolean; leaderboard: boolean };
    maintenanceBanner: { message: string } | null;
    memberCount: number;
  };
  profile: ProfileDto;
  targets: TargetsDto | null;
  ai: {
    teamOn: boolean;
    features: Record<AiFeatureKey, boolean>;
    photoAvailable: boolean;
    summaryAvailable: boolean;
    noticeRequired: boolean;
    callsThisMonth: number;
  };
  realtime: { url: string; anonKey: string; teamTopic: string; userTopic: string } | null;
  vapidPublicKey: string | null;
  today: string;
  localTime: string;
  serverTime: string;
  version: string;
}
