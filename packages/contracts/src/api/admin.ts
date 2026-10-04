import { z } from 'zod';
import { ActivityLevel, AiModel, DayType, FoodTag, GoalType, MealSlot, MemeTone, NotificationType, Role, Sex, Units } from '../enums';
import { BoardSettings, NotificationDefault, QuietHours, Thresholds } from '../settings';
import { TriggerDefinition } from '../triggers';
import { HHmmStr, IsoDateTime, LocalDateStr, Nutrients, ServingOptionSchema, type BandDto, type PersonRef, type ServingOptionDto } from './common';
import type { TargetsDto } from './profile';
import type { NotificationPrefDto } from './notifications';
import type { PlanItemDto } from './plans';
import type { StreakDto } from './progress';

/* ───────── Dashboard ───────── */

export interface AdminDashboardResponse {
  date: string;
  kpis: { activeMembers: number; invited: number; deactivated: number; loggedToday: number; teamStreak: number; aiSpendUsd: number; aiCapUsd: number; aiPct: number };
  todayRows: { person: PersonRef; eaten: number; target: number | null; band: 'in' | 'under' | 'over' | 'none'; bandLabel: string; logged: boolean }[];
  plan: { onTrack: number; total: number };
  streaksAtRisk: PersonRef[];
  ai: { monthToDate: number; cap: number; pct: number; callsToday: number; fallbackRate: number; alertAt: number; resetsOn: string; projected: number; on: boolean };
  needsAttention: { kind: string; text: string; url: string }[];
  chat: { messagesToday: number; memesToday: number; reportsPending: number };
  storage: { totalBytes: number; byKind: Record<string, number>; nextRunAt: string | null; lastRun: { at: string; imagesDeleted: number; bytesReclaimed: number } | null };
  /** This week's top five (null when the leaderboard or its overview card is off). Hidden members are left out. */
  board: { weekNumber: number; weekStart: string; weekEnd: string; rows: { person: PersonRef; rank: number; points: number; solidPct: number | null }[] } | null;
}

/* ───────── Members ───────── */

export interface AdminMemberRow {
  id: string;
  person: PersonRef;
  username: string;
  email: string | null;
  role: z.infer<typeof Role>;
  status: 'active' | 'invited' | 'deactivated';
  /** Effective IANA timezone (the member's own, else the team's). */
  timezone: string;
  lastActiveAt: string | null;
  loggedToday: boolean;
  streak: number;
  plan: { done: number; target: number } | null;
  aiCallsMonth: number;
  tempPasswordExpiresAt: string | null;
  totpEnabled: boolean;
  createdAt: string;
}

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, '3–30 characters: letters, numbers, dot, dash, underscore');

export const CreateMemberRequest = z.object({
  displayName: z.string().trim().min(1).max(60),
  username: Username,
  email: z.string().trim().email().nullable().optional(),
  role: Role,
  timezone: z.string().max(64).nullable().optional(),
});
export type CreateMemberRequest = z.infer<typeof CreateMemberRequest>;

export const UpdateMemberRequest = z
  .object({ displayName: z.string().trim().min(1).max(60), username: Username, email: z.string().trim().email().nullable(), timezone: z.string().max(64).nullable() })
  .partial();
export const RoleChangeRequest = z.object({ role: Role, reason: z.string().trim().min(3).max(300) });
export const ReasonRequest = z.object({ reason: z.string().trim().max(300).optional() });
export const TypedConfirmRequest = z.object({ confirm: z.string(), reason: z.string().trim().min(3).max(300) });
export const ImportMembersRequest = z.object({ csv: z.string().min(1).max(1_000_000), dryRun: z.boolean() });

export interface ImportMembersResult {
  rows: { line: number; displayName: string; username: string; email: string | null; role: string; status: 'ok' | 'error' | 'created'; error: string | null; tempPassword: string | null }[];
  created: number;
  errors: number;
}

export interface AdminMemberDetail {
  member: AdminMemberRow;
  timezone: string;
  profile: { units: string; heightCm: number | null; weightKg: number | null; dob: string | null; sex: string | null; activityLevel: string | null; goalType: string | null; paceKgWeek: number | null; targetWeightKg: number | null; targetDate: string | null; eatBackExercise: boolean; dietPrefs: { allergies: string[]; dislikes: string[]; cuisines: string[]; diet: string } } | null;
  targets: TargetsDto | null;
  thresholdsOverride: Partial<z.infer<typeof Thresholds>> | null;
  diet: { id: string; name: string; version: number; status: string; publishedAt: string | null; aiGenerated: boolean } | null;
  plan: { items: PlanItemDto[]; weeks: { weekStart: string; done: number; planned: number }[]; usualDays: number[] };
  streaks: StreakDto[];
  vacation: { from: string; to: string }[];
  notificationPrefs: NotificationPrefDto[];
  ai: { callsMonth: number; costMonth: number; byFeature: { feature: string; calls: number; cost: number }[] };
  recentDays: { date: string; eaten: number; target: number | null; burned: number; logs: number; band: 'in' | 'under' | 'over' | 'none' }[];
  audit: AuditRow[];
  sessions: { id: string; deviceLabel: string | null; lastSeenAt: string; ip: string | null }[];
}

/* ───────── Goals & targets ───────── */

export interface AdminGoalRow {
  person: PersonRef;
  userId: string;
  goalType: string | null;
  paceKgWeek: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  targetDate: string | null;
  targets: TargetsDto | null;
  eatBackExercise: boolean;
}

export const AdminGoalUpdate = z.object({
  goalType: GoalType,
  paceKgWeek: z.number().min(0).max(2).nullable().optional(),
  targetWeightKg: z.number().min(25).max(350).nullable().optional(),
  targetDate: LocalDateStr.nullable().optional(),
  activityLevel: ActivityLevel.optional(),
  safetyOverrideReason: z.string().trim().min(3).max(300).optional(),
});
export const OverrideTargetsRequest = z.object({
  kcal: z.number().int().min(800).max(6000).nullable().optional(),
  protein: z.number().int().min(0).max(500).nullable().optional(),
  carbs: z.number().int().min(0).max(1000).nullable().optional(),
  fat: z.number().int().min(0).max(400).nullable().optional(),
  fibre: z.number().int().min(0).max(150).nullable().optional(),
  reason: z.string().trim().min(3).max(300),
  safetyOverrideReason: z.string().trim().min(3).max(300).optional(),
});
export const MemberTargetSettingsRequest = z.object({ eatBackExercise: z.boolean().optional(), thresholdsOverride: Thresholds.partial().nullable().optional() });

/* ───────── Diets ───────── */

export const DietItemInput = z.object({
  foodId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  grams: z.number().positive().max(3000),
  servings: z.number().min(0).max(50).default(1),
  servingLabel: z.string().max(40).nullable().optional(),
  nutrition: Nutrients.nullable().optional(),
  aiEstimate: z.boolean().optional(),
});
export const UpsertOptionRequest = z.object({
  mealSlot: MealSlot,
  dayType: DayType,
  name: z.string().trim().min(1).max(80),
  items: z.array(DietItemInput).min(1).max(12),
  prepNote: z.string().max(300).nullable().optional(),
  imageId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100).optional(),
});
export type UpsertOptionRequest = z.infer<typeof UpsertOptionRequest>;
export const CreateDraftRequest = z.object({
  userId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(80).optional(),
  startFrom: z.enum(['blank', 'current', 'copy', 'template']),
  sourcePlanId: z.string().uuid().optional(),
});
export const UpdatePlanRequest = z.object({ name: z.string().trim().min(1).max(80), note: z.string().max(500).nullable(), effectiveFrom: LocalDateStr.nullable() }).partial();
export const PublishPlanRequest = z.object({ note: z.string().trim().max(500).nullable() });
export const DraftWithAiRequest = z.object({ userId: z.string().uuid(), brief: z.string().max(600).default(''), optionsPerSlot: z.number().int().min(2).max(5).default(3) });
export const ReviewSlotRequest = z.object({ slot: MealSlot });
export const BulkAssignRequest = z.object({ templateId: z.string().uuid(), userIds: z.array(z.string().uuid()).min(1).max(200), note: z.string().max(500).nullable().optional(), publish: z.boolean() });

export interface AdminDietOption {
  id: string;
  mealSlot: z.infer<typeof MealSlot>;
  dayType: z.infer<typeof DayType>;
  name: string;
  items: { foodId: string | null; name: string; grams: number; servings: number; servingLabel: string | null; nutrition: Nutrients; aiEstimate: boolean }[];
  nutrition: Nutrients;
  prepNote: string | null;
  imageUrl: string | null;
  sortOrder: number;
  aiEstimateItems: number;
  favourites: number;
  dislikes: number;
  timesLogged: number;
}

export interface AdminDietPlan {
  id: string;
  userId: string | null;
  person: PersonRef | null;
  name: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  note: string | null;
  aiGenerated: boolean;
  aiRationale: string | null;
  reviewChecklist: Record<string, boolean>;
  reviewComplete: boolean;
  reviewedBy: PersonRef | null;
  effectiveFrom: string | null;
  publishedAt: string | null;
  options: AdminDietOption[];
  targets: Nutrients | null;
  dayTotals: { dayType: 'training' | 'rest' | 'any'; totals: Nutrients; bands: Record<string, BandDto> }[];
  slotWarnings: string[];
  versions: { id: string; version: number; status: string; publishedAt: string | null; aiGenerated: boolean }[];
  isTemplate: boolean;
}

export interface AdminDietListRow {
  person: PersonRef;
  userId: string;
  targetKcal: number | null;
  published: { id: string; name: string; version: number; publishedAt: string | null; aiGenerated: boolean; kcal: number } | null;
  draft: { id: string; name: string; updatedAt: string } | null;
  dietPrefs: string;
}

export interface DietDiff {
  added: { slot: string; name: string }[];
  removed: { slot: string; name: string }[];
  changed: { slot: string; name: string; from: string; to: string }[];
}

export interface DietFeedbackView {
  options: { name: string; slot: string; favourites: number; dislikes: number; timesLogged: number }[];
  adherence: { fromPlan: number; elsewhere: number; pct: number; days: number };
}

/* ───────── Foods ───────── */

export interface AdminFoodRow {
  id: string;
  name: string;
  brand: string | null;
  source: string;
  verified: boolean;
  owner: PersonRef | null;
  team: boolean;
  per100g: Nutrients;
  servingOptions: ServingOptionDto[];
  defaultServing: string | null;
  tags: string[];
  category: string | null;
  confidence: number | null;
  uses: number;
  createdAt: string;
  /** A member's saved recipe (category "recipe"): its ingredients, read-only for admins. */
  recipe: { makes: number; ingredients: { name: string; portion: string; grams: number; kcal: number }[] } | null;
}

export const AdminFoodUpdate = z
  .object({
    name: z.string().trim().min(1).max(120),
    brand: z.string().trim().max(60).nullable(),
    per100g: Nutrients,
    servingOptions: z.array(ServingOptionSchema).min(1).max(12),
    defaultServing: z.string().max(40).nullable(),
    tags: z.array(FoodTag).max(10),
    category: z.string().max(40).nullable(),
    verified: z.boolean(),
  })
  .partial();
export const MergeFoodsRequest = z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() });
export const ImportFoodsRequest = z.object({ csv: z.string().min(1).max(5_000_000) });

/* ───────── Activity plans ───────── */

export const PlanItemInput = z
  .object({
    id: z.string().uuid().optional(),
    typeId: z.string().uuid(),
    perWeek: z.number().int().min(1).max(14).nullable().optional(),
    perMonth: z.number().int().min(1).max(31).nullable().optional(),
    targetMin: z.number().int().min(5).max(600).nullable().optional(),
    note: z.string().max(200).nullable().optional(),
    suggestedDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((i) => i.perWeek != null || i.perMonth != null, 'Set times per week or per month');
export const UpsertPlanRequest = z.object({ note: z.string().max(300).nullable().optional(), items: z.array(PlanItemInput).max(12) });
export const AssignPlanTemplateRequest = z.object({ userIds: z.array(z.string().uuid()).min(1), items: z.array(PlanItemInput).min(1).max(12), note: z.string().max(300).nullable().optional() });
export const ProposalReplyRequest = z.object({ status: z.enum(['accepted', 'declined', 'replied']), reply: z.string().trim().max(500).optional() });
export const RestWeekDecision = z.object({ status: z.enum(['approved', 'declined']) });
export const AdminRestWeekRequest = z.object({ userId: z.string().uuid(), weekStart: LocalDateStr, reason: z.string().max(200).optional() });

export interface AdminPlanRow {
  person: PersonRef;
  userId: string;
  items: { typeName: string; perWeek: number | null; perMonth: number | null }[];
  days: { weekday: number; planned: boolean; done: boolean }[];
  done: number;
  planned: number;
  pendingProposals: number;
  restWeekPending: boolean;
}

/* ───────── Chat moderation ───────── */

export const AnnouncementRequest = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(1000),
  link: z.string().url().nullable().optional(),
  pin: z.boolean(),
  push: z.boolean(),
  scheduledFor: IsoDateTime.nullable().optional(),
});
export const ClearChatRequest = z.object({ from: IsoDateTime, to: IsoDateTime, confirm: z.string().optional() });
export const MuteRequest = z.object({ userId: z.string().uuid(), hours: z.number().int().min(1).max(24 * 30), reason: z.string().trim().min(3).max(200) });
export const ReportResolveRequest = z.object({ action: z.enum(['dismiss', 'delete', 'nudge']), note: z.string().max(300).optional() });
export const KeywordsRequest = z.object({ keywords: z.array(z.string().trim().min(1).max(40)).max(200) });

/* ───────── Memes ───────── */

export const CreateMemeRequest = z.object({ imageId: z.string().uuid(), caption: z.string().max(160), tags: z.array(z.string().min(1).max(30)).max(10), tone: MemeTone, enabled: z.boolean() });
export const UpdateMemeRequest = z.object({ caption: z.string().max(160), tags: z.array(z.string().min(1).max(30)).max(10), tone: MemeTone, enabled: z.boolean(), status: z.enum(['approved', 'pending']) }).partial();
export const BulkMemeRequest = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), action: z.enum(['delete', 'enable', 'disable', 'add_tags', 'remove_tags']), tags: z.array(z.string()).optional() });
export { TriggerDefinition };
export const DryRunRequest = z.object({ memberId: z.string().uuid(), date: LocalDateStr });

export interface AdminTriggerDto extends z.infer<typeof TriggerDefinition> {
  id: string;
  catalogKey: string | null;
  firedCount: number;
  dismissCount: number;
  firesPerWeek: number;
  reactions: number;
  dismissRate: number;
  annoying: boolean;
  summary: { event: string; condition: string; action: string };
  sortOrder: number;
}

export interface DryRunResult {
  event: string;
  label: string;
  decisions: { triggerId: string; triggerName: string; fire: boolean; reasons: string[]; action: string; memeId: string | null }[];
}

/* ───────── AI ───────── */

export const AiFeatureUpdate = z.object({ on: z.boolean().optional(), model: AiModel.optional(), dailyCap: z.number().int().min(0).max(500).optional() });
export const AiBudgetUpdate = z.object({ monthlyCapUsd: z.number().min(0).max(10000), alertAtPercent: z.number().int().min(10).max(100), atCapBehaviour: z.enum(['disable', 'warn']) });
export const AiPricingRow = z.object({ model: z.string().min(1).max(60), effectiveFrom: LocalDateStr, inputPerMtok: z.number().min(0), outputPerMtok: z.number().min(0), cacheReadPerMtok: z.number().min(0), cacheWritePerMtok: z.number().min(0) });
export const AiRetentionUpdate = z.object({ promptRetentionDays: z.number().int().min(0).max(90) });

export interface AdminAiResponse {
  globalOn: boolean;
  environmentMode: 'live' | 'mock' | 'off';
  features: { key: string; name: string; on: boolean; model: string; dailyCap: number; callsMonth: number; costMonth: number; fallbackRate: number; fallback: string }[];
  budget: { monthlyCapUsd: number; alertAtPercent: number; atCapBehaviour: 'disable' | 'warn' };
  month: string;
  monthSpend: number;
  projectedSpend: number;
  callsToday: number;
  pricing: z.infer<typeof AiPricingRow>[];
  promptRetentionDays: number;
  spendByDay: { date: string; cost: number; calls: number }[];
  spendByFeature: { feature: string; cost: number; calls: number }[];
  callsByHour: { hour: number; calls: number }[];
  outcomes: Record<string, number>;
  efficiency: { cacheHitRate: number; avgImageInputTokens: number | null; avgOutputTokens: { feature: string; value: number; target: number; drift: boolean }[]; hints: string[] };
}

export interface AiUsageRow {
  person: PersonRef | null;
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  avgLatencyMs: number;
  fallbackRate: number;
}

export interface AiCallRow {
  id: string;
  startedAt: string;
  person: PersonRef | null;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  outcome: string;
  latencyMs: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  entity: { type: string; id: string } | null;
  test: boolean;
  promptSnapshot: { system: string; user: string; response: string } | null;
}

/* ───────── Notifications & settings ───────── */

export const NotificationDefaultsUpdate = z.object({ defaults: z.record(NotificationType, NotificationDefault).optional(), defaultQuietHours: QuietHours.optional(), copyPool: z.record(z.string(), z.array(z.string().min(1).max(160)).max(20)).optional() });

export interface PushHealthResponse {
  subscriptions: { platform: string; count: number }[];
  total: number;
  failures7d: number;
  revoked7d: number;
  membersWithoutPush: PersonRef[];
}

export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  link: string | null;
  pinned: boolean;
  push: boolean;
  scheduledFor: string | null;
  sentAt: string | null;
  createdBy: PersonRef | null;
  stats: { recipients: number; pushed: number; failed: number; opened: number };
}

export const TeamSettingsUpdate = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  timezone: z.string().min(1).max(64).optional(),
  units: Units.optional(),
  logoImageId: z.string().uuid().nullable().optional(),
  mealSlots: z.record(MealSlot, z.object({ label: z.string().min(1).max(40), until: HHmmStr.nullable() })).optional(),
  thresholds: Thresholds.optional(),
  streaks: z.object({ graceEarnedPer7: z.number().int().min(0).max(3), graceBankMax: z.number().int().min(0).max(7), pauseWindowDays: z.number().int().min(1).max(14), resetAfterDays: z.number().int().min(1).max(30), vacationDaysPerQuarter: z.number().int().min(0).max(90), teamStreakEnabled: z.boolean(), milestones: z.array(z.number().int().positive()).max(12), teamMilestones: z.array(z.number().int().positive()).max(12) }).optional(),
  privacyDefault: z.enum(['summary', 'full']).optional(),
  roastDefault: z.boolean().optional(),
  eatBackDefault: z.boolean().optional(),
  featureFlags: z.object({ teamPulse: z.boolean(), roastMemes: z.boolean(), naturalLanguageEntry: z.boolean(), leaderboard: z.boolean() }).partial().optional(),
  board: BoardSettings.partial().optional(),
  memes: z.object({ dailyChatCap: z.number().int().min(0).max(100), confidenceThreshold: z.number().min(0).max(1) }).partial().optional(),
  chat: z.object({ digestMinutes: z.number().int().min(5).max(240) }).partial().optional(),
  maintenanceBanner: z.object({ message: z.string().max(280), startsAt: IsoDateTime.nullable(), endsAt: IsoDateTime.nullable() }).nullable().optional(),
});
export type TeamSettingsUpdate = z.infer<typeof TeamSettingsUpdate>;

export const RetentionUpdate = z.object({ retentionDays: z.number().int().min(7).max(365), reason: z.string().trim().min(3).max(300) });

export interface RetentionResponse {
  retentionDays: number;
  promptRetentionDays: number;
  storage: { byKind: Record<string, { count: number; bytes: number }>; totalBytes: number; softCapMb: number; perMember: { person: PersonRef; bytes: number }[] };
  runs: { id: string; startedAt: string; finishedAt: string | null; dryRun: boolean; trigger: string; imagesDeleted: number; bytesReclaimed: number; status: string; startedBy: PersonRef | null }[];
  nextRunAt: string | null;
  pendingDeletionRequests: { id: string; person: PersonRef; note: string | null; createdAt: string }[];
  exports: { id: string; scope: string; status: string; createdAt: string; expiresAt: string | null; url: string | null; bytes: number | null }[];
}

/* ───────── Audit ───────── */

export interface AuditRow {
  id: number;
  createdAt: string;
  actor: PersonRef | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  member: PersonRef | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  highImpact: boolean;
  ip: string | null;
}

export const AuditQuery = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().max(60).optional(),
  targetType: z.string().max(40).optional(),
  memberId: z.string().uuid().optional(),
  from: LocalDateStr.optional(),
  to: LocalDateStr.optional(),
  highImpact: z.enum(['1', '0']).optional(),
  cursor: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface AdminSessionRow {
  id: string;
  person: PersonRef;
  role: string;
  deviceLabel: string | null;
  ip: string | null;
  lastSeenAt: string;
  adminLastActiveAt: string | null;
  current: boolean;
}

export interface JobRunRow {
  id: number;
  job: string;
  source: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  stats: Record<string, unknown> | null;
  error: string | null;
}

export { Sex, ActivityLevel };
