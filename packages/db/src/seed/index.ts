import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DEFAULT_TEAM_SETTINGS, NOTIFICATION_TYPES, SCHEDULED_NOTIFICATION_TYPES, STREAK_KINDS, type Role, type TeamSettings } from '@clubhouse/contracts';
import { normaliseName } from '@clubhouse/domain';
import type { Db } from '../client';
import * as s from '../schema';
import { ACTIVITY_TYPE_SEED } from './data/activityTypes';
import { DEFAULT_COPY_POOL } from './data/copy';
import { DEFAULT_AI_BUDGET, DEFAULT_AI_FEATURES, PRICING_SEED } from './data/pricing';
import { STARTER_TRIGGERS } from './data/triggers';
import { parseCsv } from './csv';

export { parseCsv, toCsv } from './csv';
export { ACTIVITY_TYPE_SEED } from './data/activityTypes';
export { STARTER_TRIGGERS } from './data/triggers';
export { DEFAULT_COPY_POOL } from './data/copy';
export { PRICING_SEED, DEFAULT_AI_FEATURES, DEFAULT_AI_BUDGET } from './data/pricing';

export const randomSecret = (bytes = 16) => randomBytes(bytes).toString('hex');

export function defaultTeamSettings(): TeamSettings {
  return { ...DEFAULT_TEAM_SETTINGS, copyPool: DEFAULT_COPY_POOL };
}

/** Create the team (v1 has exactly one) with its channel, AI settings and team streak row. Idempotent by name. */
export async function ensureTeam(db: Db, opts: { name: string; timezone: string; units?: 'metric' | 'imperial' }) {
  const existing = await db.query.teams.findFirst({ where: eq(s.teams.name, opts.name) });
  const team =
    existing ??
    (
      await db
        .insert(s.teams)
        .values({ name: opts.name, timezone: opts.timezone, units: opts.units ?? 'metric', realtimeTopicSecret: randomSecret(), settings: defaultTeamSettings() })
        .returning()
    )[0]!;
  const channel = await db.query.channels.findFirst({ where: eq(s.channels.teamId, team.id) });
  if (!channel) await db.insert(s.channels).values({ teamId: team.id, name: 'The Clubhouse', kind: 'team' });
  await db
    .insert(s.aiSettings)
    .values({ teamId: team.id, globalOn: false, features: DEFAULT_AI_FEATURES, budget: DEFAULT_AI_BUDGET, promptRetentionDays: 0 })
    .onConflictDoNothing();
  await db.insert(s.teamStreaks).values({ teamId: team.id }).onConflictDoNothing();
  return team;
}

export async function seedActivityTypes(db: Db) {
  let n = 0;
  for (const a of ACTIVITY_TYPE_SEED) {
    const found = await db.query.activityTypes.findFirst({ where: and(eq(s.activityTypes.key, a.key), isNull(s.activityTypes.teamId)) });
    if (found) {
      await db
        .update(s.activityTypes)
        .set({ name: a.name, icon: a.icon, met: a.met, metBands: a.metBands, inputs: a.inputs, defaultDurationMin: a.defaultDurationMin, sortOrder: a.sortOrder })
        .where(eq(s.activityTypes.id, found.id));
    } else {
      await db.insert(s.activityTypes).values({ ...a, teamId: null });
      n++;
    }
  }
  return n;
}

export async function seedPricing(db: Db) {
  for (const p of PRICING_SEED) await db.insert(s.aiPricing).values(p).onConflictDoNothing();
}

/** Install the Appendix D catalogue for a team, disabled; re-running updates definitions but never flips `enabled`. */
export async function seedTriggers(db: Db, teamId: string) {
  let order = 1;
  for (const t of STARTER_TRIGGERS) {
    const found = await db.query.memeTriggers.findFirst({ where: and(eq(s.memeTriggers.teamId, teamId), eq(s.memeTriggers.catalogKey, t.catalogKey)) });
    const values = {
      name: t.name,
      event: t.event,
      match: t.match,
      conditions: t.conditions,
      action: t.action,
      selection: t.selection,
      cooldown: t.cooldown,
      tone: t.tone,
      caption: t.caption,
      sortOrder: order++,
    };
    if (found) {
      if (!found.deletedAt) await db.update(s.memeTriggers).set({ ...values, updatedAt: new Date() }).where(eq(s.memeTriggers.id, found.id));
    } else {
      await db.insert(s.memeTriggers).values({ ...values, teamId, catalogKey: t.catalogKey, enabled: false });
    }
  }
}

export interface ProvisionMemberInput {
  teamId: string;
  username: string;
  displayName: string;
  email?: string | null;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: Date | null;
  createdBy?: string | null;
  timezone?: string | null;
}

/** Insert a user with their profile, notification preferences and schedules, and streak rows. */
export async function provisionMember(db: Db, input: ProvisionMemberInput) {
  const team = await db.query.teams.findFirst({ where: eq(s.teams.id, input.teamId) });
  if (!team) throw new Error('team not found');
  const settings = team.settings;
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(s.users)
      .values({
        teamId: input.teamId,
        username: input.username.toLowerCase(),
        email: input.email ? input.email.toLowerCase() : null,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        role: input.role,
        mustChangePassword: input.mustChangePassword,
        tempPasswordExpiresAt: input.tempPasswordExpiresAt,
        createdBy: input.createdBy ?? null,
        timezone: input.timezone ?? null,
      })
      .returning();
    const u = user!;
    await tx.insert(s.profiles).values({
      userId: u.id,
      units: team.units,
      eatBackExercise: settings.eatBackDefault,
      privacy: { teammatesSee: settings.privacyDefault, teamPulseOptIn: false, roastMemes: settings.roastDefault, roastPromptSeen: false },
      quietHours: settings.defaultQuietHours,
      realtimeSecret: randomSecret(),
    });
    await tx.insert(s.notificationPreferences).values(
      NOTIFICATION_TYPES.map((type) => {
        const d = settings.notificationDefaults[type] ?? { enabled: true, time: null, days: [0, 1, 2, 3, 4, 5, 6], smartTime: false };
        return { userId: u.id, type, enabled: d.enabled, time: d.time, days: d.days, smartTime: d.smartTime };
      }),
    );
    await tx.insert(s.notificationSchedules).values(SCHEDULED_NOTIFICATION_TYPES.map((type) => ({ userId: u.id, type, nextSendAt: null })));
    await tx.insert(s.streakStates).values(STREAK_KINDS.map((kind) => ({ userId: u.id, kind })));
    await tx.insert(s.chatReads).values({ userId: u.id, lastReadSeq: 0 }).onConflictDoNothing();
    return u;
  });
}

export interface FoodCsvRow {
  external_id: string;
  name: string;
  aliases: string;
  category: string;
  tags: string;
  veg: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fibre: string;
  serving_options: string;
  default_serving: string;
}

/** Upsert foods from a seed CSV by (source, external_id); never overwrites rows an admin edited. */
export async function seedFoodsFromCsv(db: Db, path: string, source: 'seed' | 'usda') {
  const rows = parseCsv(readFileSync(path, 'utf8')) as unknown as FoodCsvRow[];
  let inserted = 0;
  let updated = 0;
  const batch = 250;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r) => {
      const aliases = r.aliases ? r.aliases.split('|').map((x) => x.trim()).filter(Boolean) : [];
      return {
        teamId: null,
        name: r.name.trim(),
        aliases,
        searchText: normaliseName([r.name, ...aliases].join(' ')),
        per100g: { kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat), fibre: Number(r.fibre) },
        servingOptions: JSON.parse(r.serving_options || '[]') as { label: string; grams: number }[],
        defaultServing: r.default_serving || null,
        tags: r.tags ? r.tags.split('|').filter(Boolean) : [],
        category: r.category || null,
        veg: r.veg === 'true' ? true : r.veg === 'false' ? false : null,
        source,
        externalId: r.external_id,
        verified: true,
      };
    });
    const res = await db
      .insert(s.foodItems)
      .values(chunk)
      .onConflictDoUpdate({
        target: [s.foodItems.source, s.foodItems.externalId],
        targetWhere: sql`${s.foodItems.externalId} is not null`,
        set: {
          name: sql`excluded.name`,
          aliases: sql`excluded.aliases`,
          searchText: sql`excluded.search_text`,
          per100g: sql`excluded.per_100g`,
          servingOptions: sql`excluded.serving_options`,
          defaultServing: sql`excluded.default_serving`,
          tags: sql`excluded.tags`,
          category: sql`excluded.category`,
          veg: sql`excluded.veg`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${s.foodItems.adminEdited} = false`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of res) {
      if (r.inserted) inserted++;
      else updated++;
    }
  }
  return { total: rows.length, inserted, updated };
}
