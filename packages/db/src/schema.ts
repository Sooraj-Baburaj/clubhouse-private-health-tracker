import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { MemeSelection, TeamSettings, TriggerCondition } from '@clubhouse/contracts';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const created = () => tstz('created_at').notNull().defaultNow();
const updated = () => tstz('updated_at').notNull().defaultNow();
const localDate = (name: string) => date(name, { mode: 'string' });
const id = () => uuid('id').primaryKey().defaultRandom();

export const roleEnum = pgEnum('user_role', ['member', 'admin', 'super_admin']);

export type NutrientJson = { kcal: number; protein: number; carbs: number; fat: number; fibre: number };
export type ServingJson = { label: string; grams: number };
export type FoodLogItemJson = {
  foodId: string | null;
  name: string;
  grams: number;
  servings: number;
  servingLabel: string | null;
  nutrition: NutrientJson;
  source: 'search' | 'ai' | 'recipe' | 'manual' | 'diet' | 'quick_add';
  dietOptionId?: string | null;
  aiEstimate?: boolean;
  confidence?: number | null;
  tags?: string[];
};
export type AttachmentJson =
  | { type: 'image'; imageId: string }
  | { type: 'food_log'; id: string }
  | { type: 'activity_log'; id: string }
  | { type: 'day_card'; userId: string; date: string }
  | { type: 'meme'; memeId: string };

/* ───────────────────────────── Team, users, auth ───────────────────────────── */

export const teams = pgTable('teams', {
  id: id(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  units: text('units').notNull().default('metric'),
  logoImageId: uuid('logo_image_id'),
  realtimeTopicSecret: text('realtime_topic_secret').notNull(),
  settings: jsonb('settings').$type<TeamSettings>().notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    teamId: uuid('team_id').notNull().references(() => teams.id),
    username: text('username').notNull(),
    email: text('email'),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    tempPasswordExpiresAt: tstz('temp_password_expires_at'),
    timezone: text('timezone'),
    avatarImageId: uuid('avatar_image_id'),
    totpSecretEnc: bytea('totp_secret_enc'),
    totpPendingSecretEnc: bytea('totp_pending_secret_enc'),
    totpEnabledAt: tstz('totp_enabled_at'),
    totpRecoveryHashes: text('totp_recovery_hashes').array(),
    onboardedAt: tstz('onboarded_at'),
    lastActiveAt: tstz('last_active_at'),
    createdBy: uuid('created_by'),
    deactivatedAt: tstz('deactivated_at'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex('users_username_uq').on(sql`lower(${t.username})`),
    uniqueIndex('users_email_uq').on(sql`lower(${t.email})`).where(sql`${t.email} is not null`),
    index('users_team_idx').on(t.teamId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    deviceLabel: text('device_label'),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: created(),
    lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
    mfaVerifiedAt: tstz('mfa_verified_at'),
    adminLastActiveAt: tstz('admin_last_active_at'),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const rateLimits = pgTable(
  'rate_limits',
  { key: text('key').notNull(), windowStart: tstz('window_start').notNull(), count: integer('count').notNull().default(0) },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const adminLoginEvents = pgTable(
  'admin_login_events',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    newDevice: boolean('new_device').notNull(),
    createdAt: created(),
  },
  (t) => [index('admin_login_events_user_idx').on(t.userId, t.deviceHash)],
);

/* ───────────────────────────── Profile and body ───────────────────────────── */

export type PrivacyJson = { teammatesSee: 'summary' | 'full'; teamPulseOptIn: boolean; roastMemes: boolean; roastPromptSeen: boolean };
export type AiOptOutsJson = { photo: boolean; summary: boolean; noticeSeen: boolean };
export type MomentumPrefsJson = { showOnToday: ('logging' | 'activity' | 'in_range')[] };
export type DietPrefsJson = { allergies: string[]; dislikes: string[]; cuisines: string[]; diet: 'none' | 'vegetarian' | 'vegan' | 'eggetarian' | 'pescatarian' };
export type AppPrefsJson = { theme: 'light' | 'dark' | 'system'; palette: 'day' | 'night' | 'organic' | 'chili' | 'mango' | 'plum' };
export type TargetOverridesJson = { kcal?: number | null; protein?: number | null; carbs?: number | null; fat?: number | null; fibre?: number | null };

export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  units: text('units').notNull().default('metric'),
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  dob: localDate('dob'),
  sex: text('sex'),
  activityLevel: text('activity_level'),
  goalType: text('goal_type'),
  targetWeightKg: real('target_weight_kg'),
  targetDate: localDate('target_date'),
  paceKgWeek: real('pace_kg_week'),
  calorieTarget: integer('calorie_target'),
  proteinG: integer('protein_g'),
  carbsG: integer('carbs_g'),
  fatG: integer('fat_g'),
  fibreG: integer('fibre_g'),
  tdee: integer('tdee'),
  targetsWeightKg: real('targets_weight_kg'),
  targetsComputedAt: tstz('targets_computed_at'),
  targetOverrides: jsonb('target_overrides').$type<TargetOverridesJson>(),
  targetsOverriddenBy: uuid('targets_overridden_by'),
  overrideReason: text('override_reason'),
  eatBackExercise: boolean('eat_back_exercise').notNull().default(false),
  thresholdsOverride: jsonb('thresholds_override').$type<Partial<TeamSettings['thresholds']>>(),
  dietPrefs: jsonb('diet_prefs').$type<DietPrefsJson>().notNull().default({ allergies: [], dislikes: [], cuisines: [], diet: 'none' }),
  privacy: jsonb('privacy').$type<PrivacyJson>().notNull(),
  aiOptOuts: jsonb('ai_opt_outs').$type<AiOptOutsJson>().notNull().default({ photo: false, summary: false, noticeSeen: false }),
  momentumPrefs: jsonb('momentum_prefs').$type<MomentumPrefsJson>().notNull().default({ showOnToday: ['logging'] }),
  appPrefs: jsonb('app_prefs').$type<AppPrefsJson>().notNull().default({ theme: 'system', palette: 'day' }),
  quietHours: jsonb('quiet_hours').$type<{ start: string; end: string } | null>(),
  notificationsMaster: boolean('notifications_master').notNull().default(true),
  chatMutedUntil: tstz('chat_muted_until'),
  vacationRanges: jsonb('vacation_ranges').$type<{ from: string; to: string; setBy?: string }[]>().notNull().default([]),
  smartTimes: jsonb('smart_times').$type<Record<string, string>>().notNull().default({}),
  realtimeSecret: text('realtime_secret').notNull(),
  rolledOverFor: localDate('rolled_over_for'),
  updatedAt: updated(),
});

export const weightEntries = pgTable(
  'weight_entries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull(),
    date: localDate('date').notNull(),
    weightKg: real('weight_kg').notNull(),
    note: text('note'),
    addedLate: boolean('added_late').notNull().default(false),
    clientUpdatedAt: tstz('client_updated_at').notNull(),
    serverUpdatedAt: tstz('server_updated_at').notNull().defaultNow(),
    createdAt: created(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [index('weight_user_date_idx').on(t.userId, t.date), index('weight_user_sync_idx').on(t.userId, t.serverUpdatedAt)],
);

/* ───────────────────────────── Foods ───────────────────────────── */

export const foodItems = pgTable(
  'food_items',
  {
    id: id(),
    teamId: uuid('team_id'),
    ownerId: uuid('owner_id'),
    name: text('name').notNull(),
    brand: text('brand'),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    searchText: text('search_text').notNull(),
    per100g: jsonb('per_100g').$type<NutrientJson>().notNull(),
    servingOptions: jsonb('serving_options').$type<ServingJson[]>().notNull().default([]),
    defaultServing: text('default_serving'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    category: text('category'),
    veg: boolean('veg'),
    source: text('source').notNull(),
    externalId: text('external_id'),
    verified: boolean('verified').notNull().default(false),
    adminEdited: boolean('admin_edited').notNull().default(false),
    confidence: real('confidence'),
    mergedIntoId: uuid('merged_into_id'),
    createdBy: uuid('created_by'),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [
    uniqueIndex('food_items_external_uq').on(t.source, t.externalId).where(sql`${t.externalId} is not null`),
    index('food_items_team_idx').on(t.teamId),
    index('food_items_owner_idx').on(t.ownerId),
  ],
);

export const foodUsage = pgTable(
  'food_usage',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id').notNull().references(() => foodItems.id, { onDelete: 'cascade' }),
    uses: integer('uses').notNull().default(0),
    lastUsedAt: tstz('last_used_at'),
    favourite: boolean('favourite').notNull().default(false),
    lastGrams: real('last_grams'),
    lastServingLabel: text('last_serving_label'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.foodId] }), index('food_usage_recent_idx').on(t.userId, t.lastUsedAt)],
);

export const recipes = pgTable(
  'recipes',
  {
    id: id(),
    teamId: uuid('team_id').notNull(),
    ownerId: uuid('owner_id'),
    name: text('name').notNull(),
    items: jsonb('items').$type<{ foodId: string; name: string; grams: number }[]>().notNull(),
    servings: real('servings').notNull().default(1),
    perServing: jsonb('per_serving').$type<NutrientJson>().notNull(),
    promoted: boolean('promoted').notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [index('recipes_owner_idx').on(t.ownerId)],
);

export const foodLogs = pgTable(
  'food_logs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull(),
    date: localDate('date').notNull(),
    mealSlot: text('meal_slot').notNull(),
    loggedAt: tstz('logged_at').notNull(),
    items: jsonb('items').$type<FoodLogItemJson[]>().notNull(),
    totals: jsonb('totals').$type<NutrientJson>().notNull(),
    imageId: uuid('image_id'),
    aiCallId: uuid('ai_call_id'),
    aiGenerated: boolean('ai_generated').notNull().default(false),
    confidence: real('confidence'),
    note: text('note'),
    addedLate: boolean('added_late').notNull().default(false),
    clientUpdatedAt: tstz('client_updated_at').notNull(),
    serverUpdatedAt: tstz('server_updated_at').notNull().defaultNow(),
    createdAt: created(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [index('food_logs_user_date_idx').on(t.userId, t.date), index('food_logs_user_sync_idx').on(t.userId, t.serverUpdatedAt), index('food_logs_team_date_idx').on(t.teamId, t.date)],
);

/* ───────────────────────────── Activity ───────────────────────────── */

export const activityTypes = pgTable('activity_types', {
  id: id(),
  teamId: uuid('team_id'),
  key: text('key').notNull(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('activity'),
  met: real('met').notNull(),
  metBands: jsonb('met_bands').$type<{ minKmh: number; met: number }[] | null>(),
  inputs: text('inputs').array().notNull(),
  defaultDurationMin: integer('default_duration_min').notNull().default(30),
  enabled: boolean('enabled').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(100),
  createdAt: created(),
});

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull(),
    date: localDate('date').notNull(),
    loggedAt: tstz('logged_at').notNull(),
    typeId: uuid('type_id').notNull().references(() => activityTypes.id),
    durationMin: real('duration_min').notNull(),
    distanceKm: real('distance_km'),
    intensity: text('intensity'),
    focus: text('focus'),
    kcalBurned: real('kcal_burned').notNull(),
    kcalOverridden: boolean('kcal_overridden').notNull().default(false),
    met: real('met'),
    planItemId: uuid('plan_item_id'),
    imageId: uuid('image_id'),
    note: text('note'),
    addedLate: boolean('added_late').notNull().default(false),
    clientUpdatedAt: tstz('client_updated_at').notNull(),
    serverUpdatedAt: tstz('server_updated_at').notNull().defaultNow(),
    createdAt: created(),
    deletedAt: tstz('deleted_at'),
  },
  (t) => [index('activity_logs_user_date_idx').on(t.userId, t.date), index('activity_logs_user_sync_idx').on(t.userId, t.serverUpdatedAt)],
);

export const activityPlans = pgTable('activity_plans', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  note: text('note'),
  createdBy: uuid('created_by'),
  createdAt: created(),
  updatedAt: updated(),
});

export const activityPlanItems = pgTable('activity_plan_items', {
  id: id(),
  planId: uuid('plan_id').notNull().references(() => activityPlans.id, { onDelete: 'cascade' }),
  typeId: uuid('type_id').notNull().references(() => activityTypes.id),
  perWeek: integer('per_week'),
  perMonth: integer('per_month'),
  targetMin: integer('target_min'),
  note: text('note'),
  suggestedDays: integer('suggested_days').array(),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: tstz('archived_at'),
  createdAt: created(),
});

export const activityPlanDays = pgTable(
  'activity_plan_days',
  {
    id: id(),
    itemId: uuid('item_id').notNull().references(() => activityPlanItems.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    time: text('time').notNull(),
  },
  (t) => [uniqueIndex('activity_plan_days_uq').on(t.itemId, t.weekday)],
);

export const activityPlanProposals = pgTable('activity_plan_proposals', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  status: text('status').notNull().default('open'),
  adminReply: text('admin_reply'),
  handledBy: uuid('handled_by'),
  createdAt: created(),
  handledAt: tstz('handled_at'),
});

export const restWeeks = pgTable(
  'rest_weeks',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weekStart: localDate('week_start').notNull(),
    status: text('status').notNull().default('pending'),
    reason: text('reason'),
    decidedBy: uuid('decided_by'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('rest_weeks_uq').on(t.userId, t.weekStart)],
);

/* ───────────────────────────── Diet ───────────────────────────── */

export const dietPlans = pgTable(
  'diet_plans',
  {
    id: id(),
    teamId: uuid('team_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    note: text('note'),
    aiGenerated: boolean('ai_generated').notNull().default(false),
    aiCallId: uuid('ai_call_id'),
    reviewChecklist: jsonb('review_checklist').$type<Record<string, boolean>>(),
    reviewedBy: uuid('reviewed_by'),
    createdBy: uuid('created_by'),
    publishedBy: uuid('published_by'),
    publishedAt: tstz('published_at'),
    effectiveFrom: localDate('effective_from'),
    previousVersionId: uuid('previous_version_id'),
    targetKcal: integer('target_kcal'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('diet_plans_user_idx').on(t.userId, t.status),
    uniqueIndex('diet_plans_one_published_uq').on(t.userId).where(sql`${t.status} = 'published' and ${t.userId} is not null`),
  ],
);

export const dietMealOptions = pgTable(
  'diet_meal_options',
  {
    id: id(),
    planId: uuid('plan_id').notNull().references(() => dietPlans.id, { onDelete: 'cascade' }),
    mealSlot: text('meal_slot').notNull(),
    dayType: text('day_type').notNull().default('any'),
    name: text('name').notNull(),
    items: jsonb('items').$type<FoodLogItemJson[]>().notNull(),
    nutrition: jsonb('nutrition').$type<NutrientJson>().notNull(),
    prepNote: text('prep_note'),
    imageId: uuid('image_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    aiEstimateItems: integer('ai_estimate_items').notNull().default(0),
  },
  (t) => [index('diet_options_plan_idx').on(t.planId, t.mealSlot)],
);

export const dietFeedback = pgTable(
  'diet_feedback',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    optionName: text('option_name').notNull(),
    optionId: uuid('option_id'),
    reaction: text('reaction').notNull(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.optionName] })],
);

/* ───────────────────────────── Momentum ───────────────────────────── */

export const streakStates = pgTable(
  'streak_states',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    current: integer('current').notNull().default(0),
    best: integer('best').notNull().default(0),
    status: text('status').notNull().default('active'),
    graceLeft: integer('grace_left').notNull().default(0),
    pausedSince: localDate('paused_since'),
    lastCountedDate: localDate('last_counted_date'),
    atRisk: boolean('at_risk').notNull().default(false),
    history: jsonb('history').$type<{ date: string; state: string }[]>().notNull().default([]),
    computedFor: localDate('computed_for'),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

export const teamStreaks = pgTable('team_streaks', {
  teamId: uuid('team_id').primaryKey(),
  current: integer('current').notNull().default(0),
  best: integer('best').notNull().default(0),
  status: text('status').notNull().default('active'),
  computedFor: localDate('computed_for'),
  history: jsonb('history').$type<{ date: string; state: string }[]>().notNull().default([]),
  updatedAt: updated(),
});

export const dayFacts = pgTable(
  'day_facts',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: localDate('date').notNull(),
    logged: boolean('logged').notNull(),
    foodLogged: boolean('food_logged').notNull(),
    activityLogged: boolean('activity_logged').notNull(),
    inRange: boolean('in_range').notNull(),
    kcalEaten: real('kcal_eaten').notNull().default(0),
    kcalBurned: real('kcal_burned').notNull().default(0),
    kcalTarget: integer('kcal_target'),
    totals: jsonb('totals').$type<NutrientJson>(),
    targets: jsonb('targets').$type<NutrientJson>(),
    computedAt: tstz('computed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    milestone: integer('milestone').notNull(),
    earnedAt: tstz('earned_at').notNull().defaultNow(),
    seenAt: tstz('seen_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.milestone] })],
);

export const personalRecords = pgTable(
  'personal_records',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    record: text('record').notNull(),
    value: real('value').notNull(),
    unit: text('unit').notNull(),
    achievedOn: localDate('achieved_on').notNull(),
    refId: uuid('ref_id'),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.record] })],
);

export const weeklyRecaps = pgTable(
  'weekly_recaps',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weekStart: localDate('week_start').notNull(),
    highlight: text('highlight').notNull(),
    tryNext: text('try_next').notNull(),
    teamFact: text('team_fact').notNull(),
    stats: jsonb('stats').$type<Record<string, number | string>>().notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekStart] })],
);

/* ───────────────────────────── Notifications ───────────────────────────── */

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    enabled: boolean('enabled').notNull(),
    time: text('time'),
    days: smallint('days').array().notNull(),
    smartTime: boolean('smart_time').notNull().default(false),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const notificationSchedules = pgTable(
  'notification_schedules',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    nextSendAt: tstz('next_send_at'),
    lastSentAt: tstz('last_sent_at'),
    lastSentLocalDate: localDate('last_sent_local_date'),
    claimedAt: tstz('claimed_at'),
    attempts: smallint('attempts').notNull().default(0),
    lastReason: text('last_reason'),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] }), index('notification_schedules_due_idx').on(t.nextSendAt).where(sql`${t.nextSendAt} is not null`)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<{ url?: string; tag?: string; actions?: { action: string; title: string }[]; [k: string]: unknown }>().notNull().default({}),
    dedupeKey: text('dedupe_key'),
    createdAt: created(),
    readAt: tstz('read_at'),
    pushedAt: tstz('pushed_at'),
    pushResult: text('push_result'),
    deliverAfter: tstz('deliver_after'),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('notifications_dedupe_uq').on(t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
    index('notifications_deferred_idx').on(t.deliverAfter).where(sql`${t.deliverAfter} is not null and ${t.pushedAt} is null`),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id'),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    platform: text('platform'),
    createdAt: created(),
    lastUsedAt: tstz('last_used_at'),
    failCount: smallint('fail_count').notNull().default(0),
    lastError: text('last_error'),
    revokedAt: tstz('revoked_at'),
  },
  (t) => [uniqueIndex('push_endpoint_uq').on(t.endpoint), index('push_user_idx').on(t.userId)],
);

export const announcements = pgTable('announcements', {
  id: id(),
  teamId: uuid('team_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  pinned: boolean('pinned').notNull().default(true),
  push: boolean('push').notNull().default(true),
  scheduledFor: tstz('scheduled_for'),
  sentAt: tstz('sent_at'),
  messageId: uuid('message_id'),
  stats: jsonb('stats').$type<{ recipients: number; pushed: number; failed: number; opened: number }>().notNull().default({ recipients: 0, pushed: 0, failed: 0, opened: 0 }),
  createdBy: uuid('created_by').notNull(),
  createdAt: created(),
});

/* ───────────────────────────── Chat ───────────────────────────── */

export const channels = pgTable('channels', {
  id: id(),
  teamId: uuid('team_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('team'),
  createdAt: created(),
});

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    channelId: uuid('channel_id').notNull().references(() => channels.id),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('user'),
    systemKind: text('system_kind'),
    body: text('body').notNull().default(''),
    attachments: jsonb('attachments').$type<AttachmentJson[]>().notNull().default([]),
    replyToId: uuid('reply_to_id'),
    mentions: uuid('mentions').array().notNull().default(sql`'{}'::uuid[]`),
    memeId: uuid('meme_id'),
    aiGenerated: boolean('ai_generated').notNull().default(false),
    pinned: boolean('pinned').notNull().default(false),
    flaggedKeywords: text('flagged_keywords').array().notNull().default(sql`'{}'::text[]`),
    test: boolean('test').notNull().default(false),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    clientCreatedAt: tstz('client_created_at'),
    createdAt: created(),
    editedAt: tstz('edited_at'),
    deletedAt: tstz('deleted_at'),
    deletedBy: uuid('deleted_by'),
  },
  (t) => [uniqueIndex('messages_seq_uq').on(t.seq), index('messages_channel_seq_idx').on(t.channelId, t.seq), index('messages_channel_created_idx').on(t.channelId, t.createdAt)],
);

export const reactions = pgTable(
  'reactions',
  {
    messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

export const chatReads = pgTable('chat_reads', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  lastReadSeq: bigint('last_read_seq', { mode: 'number' }).notNull().default(0),
  onChatUntil: tstz('on_chat_until'),
  updatedAt: updated(),
});

export const messageReports = pgTable('message_reports', {
  id: id(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  handledBy: uuid('handled_by'),
  createdAt: created(),
  handledAt: tstz('handled_at'),
});

export const chatMutes = pgTable('chat_mutes', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  until: tstz('until').notNull(),
  reason: text('reason').notNull(),
  mutedBy: uuid('muted_by').notNull(),
  createdAt: created(),
});

/* ───────────────────────────── Memes ───────────────────────────── */

export const memes = pgTable('memes', {
  id: id(),
  teamId: uuid('team_id').notNull(),
  imageId: uuid('image_id'),
  caption: text('caption').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  tone: text('tone').notNull().default('neutral'),
  enabled: boolean('enabled').notNull().default(true),
  status: text('status').notNull().default('approved'),
  suggestedBy: uuid('suggested_by'),
  uses: integer('uses').notNull().default(0),
  lastUsedAt: tstz('last_used_at'),
  createdBy: uuid('created_by'),
  createdAt: created(),
  deletedAt: tstz('deleted_at'),
});

export const memeTriggers = pgTable('meme_triggers', {
  id: id(),
  teamId: uuid('team_id').notNull(),
  catalogKey: text('catalog_key'),
  name: text('name').notNull(),
  event: text('event').notNull(),
  match: text('match').notNull().default('all'),
  conditions: jsonb('conditions').$type<TriggerCondition[]>().notNull(),
  action: text('action').notNull(),
  selection: jsonb('selection').$type<MemeSelection>().notNull(),
  cooldown: text('cooldown').notNull(),
  tone: text('tone').notNull(),
  caption: text('caption'),
  excludedUserIds: uuid('excluded_user_ids').array().notNull().default(sql`'{}'::uuid[]`),
  enabled: boolean('enabled').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(100),
  firedCount: integer('fired_count').notNull().default(0),
  dismissCount: integer('dismiss_count').notNull().default(0),
  createdBy: uuid('created_by'),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: tstz('deleted_at'),
});

export const memeFires = pgTable(
  'meme_fires',
  {
    id: id(),
    teamId: uuid('team_id').notNull(),
    triggerId: uuid('trigger_id').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    memeId: uuid('meme_id'),
    messageId: uuid('message_id'),
    notificationId: uuid('notification_id'),
    action: text('action').notNull(),
    cooldownKey: text('cooldown_key').notNull(),
    eventKey: text('event_key').notNull(),
    localDate: localDate('local_date').notNull(),
    postedToChat: boolean('posted_to_chat').notNull().default(false),
    logRef: jsonb('log_ref').$type<{ type: 'food_log' | 'activity_log' | 'weight' | 'message'; id: string } | null>(),
    test: boolean('test').notNull().default(false),
    firedAt: tstz('fired_at').notNull().defaultNow(),
    dismissedAt: tstz('dismissed_at'),
    reactions: integer('reactions').notNull().default(0),
  },
  (t) => [
    uniqueIndex('meme_fires_cooldown_uq').on(t.triggerId, t.cooldownKey).where(sql`${t.test} = false`),
    index('meme_fires_user_idx').on(t.userId, t.localDate),
    index('meme_fires_team_date_idx').on(t.teamId, t.localDate),
  ],
);

export const triggerEvaluations = pgTable(
  'trigger_evaluations',
  {
    id: id(),
    teamId: uuid('team_id').notNull(),
    triggerId: uuid('trigger_id').notNull(),
    userId: uuid('user_id'),
    event: text('event').notNull(),
    eventKey: text('event_key').notNull(),
    fired: boolean('fired').notNull(),
    reasons: jsonb('reasons').$type<string[]>().notNull(),
    createdAt: created(),
  },
  (t) => [index('trigger_evaluations_trigger_idx').on(t.triggerId, t.createdAt)],
);

/* ───────────────────────────── Media ───────────────────────────── */

export const images = pgTable(
  'images',
  {
    id: id(),
    teamId: uuid('team_id').notNull(),
    ownerId: uuid('owner_id'),
    clientId: uuid('client_id'),
    kind: text('kind').notNull(),
    storageKey: text('storage_key').notNull(),
    thumbKey: text('thumb_key'),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    thumbBytes: integer('thumb_bytes').notNull().default(0),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: text('sha256'),
    expiresAt: tstz('expires_at'),
    purgeRequestedAt: tstz('purge_requested_at'),
    purgedAt: tstz('purged_at'),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex('images_client_uq').on(t.ownerId, t.clientId).where(sql`${t.clientId} is not null`),
    index('images_expiry_idx').on(t.expiresAt).where(sql`${t.purgedAt} is null and ${t.expiresAt} is not null`),
    index('images_team_kind_idx').on(t.teamId, t.kind),
  ],
);

/* ───────────────────────────── AI ───────────────────────────── */

export type AiFeatureSettingsJson = Record<string, { on: boolean; model: string; dailyCap: number }>;
export type AiBudgetJson = { monthlyCapUsd: number; alertAtPercent: number; atCapBehaviour: 'disable' | 'warn' };

export const aiSettings = pgTable('ai_settings', {
  teamId: uuid('team_id').primaryKey(),
  globalOn: boolean('global_on').notNull().default(false),
  features: jsonb('features').$type<AiFeatureSettingsJson>().notNull(),
  budget: jsonb('budget').$type<AiBudgetJson>().notNull(),
  promptRetentionDays: integer('prompt_retention_days').notNull().default(0),
  updatedBy: uuid('updated_by'),
  updatedAt: updated(),
});

export const aiCalls = pgTable(
  'ai_calls',
  {
    id: id(),
    teamId: uuid('team_id').notNull(),
    userId: uuid('user_id'),
    feature: text('feature').notNull(),
    model: text('model').notNull(),
    requestedModel: text('requested_model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    startedAt: tstz('started_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    imageCount: smallint('image_count').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }).notNull().default(0),
    outcome: text('outcome').notNull().default('pending'),
    errorCategory: text('error_category'),
    errorMessage: text('error_message'),
    requestId: text('request_id'),
    test: boolean('test').notNull().default(false),
    promptSnapshot: jsonb('prompt_snapshot').$type<{ system: string; user: string; response: string } | null>(),
  },
  (t) => [index('ai_calls_team_started_idx').on(t.teamId, t.startedAt), index('ai_calls_user_feature_idx').on(t.userId, t.feature, t.startedAt)],
);

export const aiBudgets = pgTable(
  'ai_budgets',
  {
    teamId: uuid('team_id').notNull(),
    month: text('month').notNull(),
    capUsd: numeric('cap_usd', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    spentUsd: numeric('spent_usd', { precision: 12, scale: 6, mode: 'number' }).notNull().default(0),
    calls: integer('calls').notNull().default(0),
    alertsSent: integer('alerts_sent').array().notNull().default(sql`'{}'::int[]`),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.month] })],
);

export const aiPricing = pgTable(
  'ai_pricing',
  {
    id: id(),
    model: text('model').notNull(),
    effectiveFrom: localDate('effective_from').notNull(),
    inputPerMtok: doublePrecision('input_per_mtok').notNull(),
    outputPerMtok: doublePrecision('output_per_mtok').notNull(),
    cacheReadPerMtok: doublePrecision('cache_read_per_mtok').notNull(),
    cacheWritePerMtok: doublePrecision('cache_write_per_mtok').notNull(),
    createdBy: uuid('created_by'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('ai_pricing_model_from_uq').on(t.model, t.effectiveFrom)],
);

export const aiSummaries = pgTable(
  'ai_summaries',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    localDate: localDate('local_date').notNull(),
    inputHash: text('input_hash').notNull(),
    output: jsonb('output').$type<Record<string, unknown>>().notNull(),
    aiCallId: uuid('ai_call_id'),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.feature, t.localDate] })],
);

/* ───────────────────────────── Admin, audit, jobs ───────────────────────────── */

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    teamId: uuid('team_id'),
    actorId: uuid('actor_id'),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    memberId: uuid('member_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    highImpact: boolean('high_impact').notNull().default(false),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: created(),
  },
  (t) => [index('audit_team_created_idx').on(t.teamId, t.createdAt), index('audit_target_idx').on(t.targetType, t.targetId), index('audit_member_idx').on(t.memberId)],
);

export const settingsKv = pgTable('settings_kv', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: updated(),
});

export const exportsTable = pgTable('exports', {
  id: id(),
  teamId: uuid('team_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  scope: text('scope').notNull(),
  storageKey: text('storage_key'),
  bytes: integer('bytes'),
  status: text('status').notNull().default('pending'),
  expiresAt: tstz('expires_at'),
  createdAt: created(),
  purgedAt: tstz('purged_at'),
});

export const deletionRequests = pgTable('deletion_requests', {
  id: id(),
  userId: uuid('user_id').notNull(),
  teamId: uuid('team_id').notNull(),
  note: text('note'),
  status: text('status').notNull().default('open'),
  handledBy: uuid('handled_by'),
  createdAt: created(),
  handledAt: tstz('handled_at'),
});

export const retentionRuns = pgTable('retention_runs', {
  id: id(),
  teamId: uuid('team_id').notNull(),
  dryRun: boolean('dry_run').notNull(),
  trigger: text('trigger').notNull(),
  imagesDeleted: integer('images_deleted').notNull().default(0),
  bytesReclaimed: bigint('bytes_reclaimed', { mode: 'number' }).notNull().default(0),
  promptsPurged: integer('prompts_purged').notNull().default(0),
  status: text('status').notNull().default('running'),
  error: text('error'),
  startedBy: uuid('started_by'),
  startedAt: tstz('started_at').notNull().defaultNow(),
  finishedAt: tstz('finished_at'),
});

export const jobLocks = pgTable('job_locks', {
  name: text('name').primaryKey(),
  lockedUntil: tstz('locked_until'),
  owner: text('owner'),
  acquiredAt: tstz('acquired_at'),
});

export const jobRuns = pgTable(
  'job_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    job: text('job').notNull(),
    source: text('source').notNull(),
    startedAt: tstz('started_at').notNull().defaultNow(),
    finishedAt: tstz('finished_at'),
    ok: boolean('ok'),
    stats: jsonb('stats').$type<Record<string, unknown>>(),
    error: text('error'),
  },
  (t) => [index('job_runs_job_started_idx').on(t.job, t.startedAt)],
);

export const jobState = pgTable('job_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedAt: updated(),
});

export const presence = pgTable('presence', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  screen: text('screen'),
  lastSeenAt: tstz('last_seen_at').notNull().defaultNow(),
});

