import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { zipSync, strToU8 } from 'fflate';
import { RETAINED_IMAGE_KINDS, type RetentionResponse } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { log } from '../../lib/log';
import { notFound } from '../../lib/errors';
import { runJobStep } from '../jobs';
import { getTeam, invalidateTeam } from '../team';
import { logAudit, personMap, personOf, requireSuper, teamUsers, toCsv, type Actor } from './shared';

const EXPORT_TTL_SEC = 24 * 3600;

/** The daily cron (00:30 UTC) is the guaranteed run; the tick also purges in small batches. */
export function nextDailyRun(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 30));
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function storageStats(c: Container, teamId: string) {
  const rows = await c.db
    .select({ kind: s.images.kind, count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${s.images.bytes} + ${s.images.thumbBytes}), 0)::float8` })
    .from(s.images)
    .where(and(eq(s.images.teamId, teamId), isNull(s.images.purgedAt)))
    .groupBy(s.images.kind);
  const byKind: Record<string, { count: number; bytes: number }> = {};
  for (const r of rows) byKind[r.kind] = { count: r.count, bytes: Number(r.bytes) };
  return { byKind, totalBytes: rows.reduce((a, r) => a + Number(r.bytes), 0) };
}

async function exportDtos(c: Container, teamId: string) {
  const rows = await c.db.query.exportsTable.findMany({ where: eq(s.exportsTable.teamId, teamId), orderBy: [desc(s.exportsTable.createdAt)], limit: 20 });
  const now = c.clock.now();
  const out: RetentionResponse['exports'] = [];
  for (const r of rows) {
    const live = r.status === 'ready' && r.storageKey && !r.purgedAt && (!r.expiresAt || r.expiresAt > now);
    out.push({ id: r.id, scope: r.scope, status: live || r.status !== 'ready' ? r.status : 'expired', createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt?.toISOString() ?? null, url: live ? await c.storage.signedUrl(r.storageKey!, Math.max(60, Math.floor((r.expiresAt!.getTime() - now.getTime()) / 1000))) : null, bytes: r.bytes });
  }
  return out;
}

export async function getRetention(c: Container, a: Actor): Promise<RetentionResponse> {
  const teamId = a.user.teamId;
  const team = await getTeam(c, teamId);
  const [storage, ai, runs, perMember, requests, exports] = await Promise.all([
    storageStats(c, teamId),
    c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, teamId) }),
    c.db.query.retentionRuns.findMany({ where: eq(s.retentionRuns.teamId, teamId), orderBy: [desc(s.retentionRuns.startedAt)], limit: 20 }),
    c.db
      .select({ ownerId: s.images.ownerId, bytes: sql<number>`coalesce(sum(${s.images.bytes} + ${s.images.thumbBytes}), 0)::float8` })
      .from(s.images)
      .where(and(eq(s.images.teamId, teamId), isNull(s.images.purgedAt), sql`${s.images.ownerId} is not null`))
      .groupBy(s.images.ownerId)
      .orderBy(sql`2 desc`)
      .limit(20),
    c.db.query.deletionRequests.findMany({ where: and(eq(s.deletionRequests.teamId, teamId), eq(s.deletionRequests.status, 'open')), orderBy: [desc(s.deletionRequests.createdAt)] }),
    exportDtos(c, teamId),
  ]);
  const people = await personMap(c, [...perMember.map((p) => p.ownerId), ...runs.map((r) => r.startedBy), ...requests.map((r) => r.userId)]);
  return {
    retentionDays: team.settings.media.retentionDays,
    promptRetentionDays: ai?.promptRetentionDays ?? 0,
    storage: { byKind: storage.byKind, totalBytes: storage.totalBytes, softCapMb: team.settings.media.softCapMb, perMember: perMember.map((p) => ({ person: personOf(people, p.ownerId)!, bytes: Number(p.bytes) })) },
    runs: runs.map((r) => ({ id: r.id, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, dryRun: r.dryRun, trigger: r.trigger, imagesDeleted: r.imagesDeleted, bytesReclaimed: Number(r.bytesReclaimed), status: r.status, startedBy: personOf(people, r.startedBy) })),
    nextRunAt: nextDailyRun(c.clock.now()).toISOString(),
    pendingDeletionRequests: requests.map((r) => ({ id: r.id, person: personOf(people, r.userId)!, note: r.note, createdAt: r.createdAt.toISOString() })),
    exports,
  };
}

/** SYS-MEDIA-07: changing retention re-dates the expiry of photos not yet purged. */
export async function updateRetention(c: Container, a: Actor, days: number, reason: string) {
  requireSuper(a, 'change retention');
  const team = await getTeam(c, a.user.teamId);
  const before = team.settings.media.retentionDays;
  await c.db.update(s.teams).set({ settings: { ...team.settings, media: { ...team.settings.media, retentionDays: days } }, updatedAt: c.clock.now() }).where(eq(s.teams.id, team.id));
  invalidateTeam(team.id);
  const redated = await c.db
    .update(s.images)
    .set({ expiresAt: sql`${s.images.createdAt} + make_interval(days => ${days})` })
    .where(and(eq(s.images.teamId, team.id), inArray(s.images.kind, RETAINED_IMAGE_KINDS), isNull(s.images.purgedAt), isNull(s.images.purgeRequestedAt)))
    .returning({ id: s.images.id });
  await logAudit(c, a, { action: 'retention.update', targetType: 'team', targetId: team.id, before: { retentionDays: before }, after: { retentionDays: days, imagesRedated: redated.length }, reason });
}

async function dueCounts(c: Container, teamId: string) {
  const [r] = await c.db
    .select({ n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${s.images.bytes} + ${s.images.thumbBytes}), 0)::float8` })
    .from(s.images)
    .where(and(eq(s.images.teamId, teamId), lte(s.images.expiresAt, c.clock.now()), isNull(s.images.purgedAt)));
  return { images: r?.n ?? 0, bytes: Number(r?.bytes ?? 0) };
}

/** "Run cleanup now": a dry run counts what is due; a real run executes the retention job step. */
export async function runRetention(c: Container, a: Actor, dryRun: boolean) {
  requireSuper(a, 'run retention cleanup');
  const teamId = a.user.teamId;
  const due = await dueCounts(c, teamId);
  if (dryRun) {
    await c.db.insert(s.retentionRuns).values({ teamId, dryRun: true, trigger: 'admin', imagesDeleted: due.images, bytesReclaimed: Math.round(due.bytes), status: 'done', startedBy: a.user.id, finishedAt: c.clock.now() });
    await logAudit(c, a, { action: 'retention.dry_run', targetType: 'team', targetId: teamId, after: due });
    return { images: due.images, bytes: due.bytes, dryRun: true };
  }
  const r = await runJobStep(c, 'retention', 'admin');
  const after = await dueCounts(c, teamId);
  const images = Math.max(0, due.images - after.images);
  const bytes = Math.max(0, due.bytes - after.bytes);
  if (!images) await c.db.insert(s.retentionRuns).values({ teamId, dryRun: false, trigger: 'admin', imagesDeleted: 0, bytesReclaimed: 0, status: r.ok ? 'done' : 'failed', error: r.error ?? null, startedBy: a.user.id, finishedAt: c.clock.now() });
  await logAudit(c, a, { action: 'retention.run', targetType: 'team', targetId: teamId, after: { images, bytes, ok: r.ok, stats: r.stats, error: r.error ?? null } });
  return { images, bytes, dryRun: false };
}

/* ───────── Team export ───────── */

const USER_COLUMNS = { id: s.users.id, username: s.users.username, email: s.users.email, displayName: s.users.displayName, role: s.users.role, status: s.users.status, timezone: s.users.timezone, createdAt: s.users.createdAt, lastActiveAt: s.users.lastActiveAt, deactivatedAt: s.users.deactivatedAt };

function flat(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : Buffer.isBuffer(v) ? undefined : v;
  return out;
}

/** SYS-PRIV-05: JSON + one CSV per entity, zipped, stored privately with a 24-hour link. */
export async function exportTeam(c: Container, a: Actor) {
  requireSuper(a, 'export team data');
  const teamId = a.user.teamId;
  const team = await getTeam(c, teamId);
  const [exp] = await c.db.insert(s.exportsTable).values({ teamId, requestedBy: a.user.id, scope: 'team', status: 'running' }).returning();
  try {
    const users = await teamUsers(c, teamId);
    const ids = users.map((u) => u.id);
    const byUsers = <T>(q: (ids: string[]) => Promise<T[]>) => (ids.length ? q(ids) : Promise.resolve([] as T[]));
    const channel = await c.db.query.channels.findFirst({ where: eq(s.channels.teamId, teamId) });
    const entities: Record<string, Record<string, unknown>[]> = {
      users: await c.db.select(USER_COLUMNS).from(s.users).where(eq(s.users.teamId, teamId)),
      profiles: (await byUsers((x) => c.db.query.profiles.findMany({ where: inArray(s.profiles.userId, x) }))).map(({ realtimeSecret: _r, ...p }) => p),
      food_logs: await c.db.query.foodLogs.findMany({ where: and(eq(s.foodLogs.teamId, teamId), isNull(s.foodLogs.deletedAt)) }),
      activity_logs: await c.db.query.activityLogs.findMany({ where: and(eq(s.activityLogs.teamId, teamId), isNull(s.activityLogs.deletedAt)) }),
      weight_entries: await c.db.query.weightEntries.findMany({ where: and(eq(s.weightEntries.teamId, teamId), isNull(s.weightEntries.deletedAt)) }),
      diet_plans: await c.db.query.dietPlans.findMany({ where: eq(s.dietPlans.teamId, teamId) }),
      diet_meal_options: await c.db.select({ o: s.dietMealOptions }).from(s.dietMealOptions).innerJoin(s.dietPlans, eq(s.dietPlans.id, s.dietMealOptions.planId)).where(eq(s.dietPlans.teamId, teamId)).then((r) => r.map((x) => x.o)),
      activity_plans: await byUsers((x) => c.db.query.activityPlans.findMany({ where: inArray(s.activityPlans.userId, x) })),
      streak_states: await byUsers((x) => c.db.query.streakStates.findMany({ where: inArray(s.streakStates.userId, x) })),
      messages: channel ? await c.db.query.messages.findMany({ where: and(eq(s.messages.channelId, channel.id), isNull(s.messages.deletedAt)) }) : [],
      memes: await c.db.query.memes.findMany({ where: and(eq(s.memes.teamId, teamId), isNull(s.memes.deletedAt)) }),
      meme_triggers: await c.db.query.memeTriggers.findMany({ where: and(eq(s.memeTriggers.teamId, teamId), isNull(s.memeTriggers.deletedAt)) }),
      notification_preferences: await byUsers((x) => c.db.query.notificationPreferences.findMany({ where: inArray(s.notificationPreferences.userId, x) })),
      ai_calls: (await c.db.query.aiCalls.findMany({ where: eq(s.aiCalls.teamId, teamId) })).map(({ promptSnapshot: _p, ...r }) => r),
      audit_logs: await c.db.query.auditLogs.findMany({ where: eq(s.auditLogs.teamId, teamId) }),
    };
    const files: Record<string, Uint8Array> = {};
    const json: Record<string, unknown> = { exportedAt: c.clock.now().toISOString(), team: { id: team.id, name: team.name, timezone: team.timezone, units: team.units, settings: team.settings } };
    for (const [name, rows] of Object.entries(entities)) {
      const clean = rows.map(flat);
      json[name] = clean;
      files[`csv/${name}.csv`] = strToU8(toCsv(clean));
    }
    files['clubhouse-export.json'] = strToU8(JSON.stringify(json, null, 1));
    const zip = Buffer.from(zipSync(files, { level: 6 }));
    const date = c.clock.now().toISOString().slice(0, 10);
    const key = `${teamId}/export/${date}/${exp!.id}-${randomUUID().slice(0, 8)}.zip`;
    await c.storage.put(key, zip, 'application/zip');
    const expiresAt = new Date(c.clock.now().getTime() + EXPORT_TTL_SEC * 1000);
    await c.db.update(s.exportsTable).set({ storageKey: key, bytes: zip.length, status: 'ready', expiresAt }).where(eq(s.exportsTable.id, exp!.id));
    await logAudit(c, a, { action: 'team.export', targetType: 'export', targetId: exp!.id, after: { bytes: zip.length, entities: Object.fromEntries(Object.entries(entities).map(([k, v]) => [k, v.length])) } });
    return { id: exp!.id, status: 'ready', url: await c.storage.signedUrl(key, EXPORT_TTL_SEC) };
  } catch (e) {
    log.error('admin.export_failed', { error: (e as Error).message });
    await c.db.update(s.exportsTable).set({ status: 'failed' }).where(eq(s.exportsTable.id, exp!.id));
    await logAudit(c, a, { action: 'team.export', targetType: 'export', targetId: exp!.id, after: { status: 'failed', error: (e as Error).message.slice(0, 200) } });
    return { id: exp!.id, status: 'failed', url: null };
  }
}

export async function handleDeletion(c: Container, a: Actor, id: string, action: 'done' | 'dismissed') {
  const r = await c.db.query.deletionRequests.findFirst({ where: and(eq(s.deletionRequests.id, id), eq(s.deletionRequests.teamId, a.user.teamId)) });
  if (!r) throw notFound('Deletion request not found.');
  await c.db.update(s.deletionRequests).set({ status: action, handledBy: a.user.id, handledAt: c.clock.now() }).where(eq(s.deletionRequests.id, id));
  await logAudit(c, a, { action: `deletion_request.${action}`, targetType: 'deletion_request', targetId: id, memberId: r.userId, before: { status: r.status }, after: { status: action } });
}
