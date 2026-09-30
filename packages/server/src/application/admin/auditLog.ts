import { and, desc, eq, gt, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { AuditQuery, type AdminSessionRow, type AuditRow, type JobRunRow } from '@clubhouse/contracts';
import { addDays, startOfLocalDay } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { badRequest, notFound } from '../../lib/errors';
import { JOB_STEPS, runJobStep, type JobStep } from '../jobs';
import { revokeSession } from '../sessions';
import { getTeam } from '../team';
import { assertCanManage, logAudit, personMap, personOf, toCsv, type Actor } from './shared';

type AuditLogRow = typeof s.auditLogs.$inferSelect;

export async function auditRows(c: Container, rows: AuditLogRow[]): Promise<AuditRow[]> {
  const people = await personMap(c, rows.flatMap((r) => [r.actorId, r.memberId]));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    actor: personOf(people, r.actorId),
    actorRole: r.actorRole,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    member: personOf(people, r.memberId),
    before: r.before,
    after: r.after,
    reason: r.reason,
    highImpact: r.highImpact,
    ip: r.ip,
  }));
}

async function whereFor(c: Container, a: Actor, q: z.infer<typeof AuditQuery>) {
  const team = await getTeam(c, a.user.teamId);
  const conds: SQL[] = [eq(s.auditLogs.teamId, a.user.teamId)];
  if (q.actorId) conds.push(eq(s.auditLogs.actorId, q.actorId));
  if (q.action) conds.push(sql`${s.auditLogs.action} ilike ${`${q.action.replace(/[%_]/g, '')}%`}`);
  if (q.targetType) conds.push(eq(s.auditLogs.targetType, q.targetType));
  if (q.memberId) conds.push(or(eq(s.auditLogs.memberId, q.memberId), eq(s.auditLogs.targetId, q.memberId))!);
  if (q.from) conds.push(gte(s.auditLogs.createdAt, startOfLocalDay(q.from, team.timezone)));
  if (q.to) conds.push(lt(s.auditLogs.createdAt, startOfLocalDay(addDays(q.to, 1), team.timezone)));
  if (q.highImpact) conds.push(eq(s.auditLogs.highImpact, q.highImpact === '1'));
  return conds;
}

/** ADM-AUD-02: filters with a cursor on the (monotonic) id, newest first. */
export async function listAudit(c: Container, a: Actor, q: z.infer<typeof AuditQuery>) {
  const conds = await whereFor(c, a, q);
  if (q.cursor != null) conds.push(lt(s.auditLogs.id, q.cursor));
  const rows = await c.db.select().from(s.auditLogs).where(and(...conds)).orderBy(desc(s.auditLogs.id)).limit(q.limit + 1);
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  return { rows: await auditRows(c, page), nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export async function auditCsv(c: Container, a: Actor, q: z.infer<typeof AuditQuery>) {
  const conds = await whereFor(c, a, q);
  const rows = await c.db.select().from(s.auditLogs).where(and(...conds)).orderBy(desc(s.auditLogs.id)).limit(20_000);
  const dto = await auditRows(c, rows);
  return toCsv(
    dto.map((r) => ({ id: r.id, created_at: r.createdAt, actor: r.actor?.name ?? '', actor_role: r.actorRole ?? '', action: r.action, target_type: r.targetType, target_id: r.targetId ?? '', member: r.member?.name ?? '', before: r.before, after: r.after, reason: r.reason ?? '', high_impact: r.highImpact, ip: r.ip ?? '' })),
    ['id', 'created_at', 'actor', 'actor_role', 'action', 'target_type', 'target_id', 'member', 'before', 'after', 'reason', 'high_impact', 'ip'],
  );
}

/* ───────── Admin sessions ───────── */

export async function adminSessions(c: Container, a: Actor): Promise<AdminSessionRow[]> {
  const rows = await c.db
    .select({ session: s.sessions, user: s.users })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.users.teamId, a.user.teamId), inArray(s.users.role, ['admin', 'super_admin']), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, c.clock.now())))
    .orderBy(desc(s.sessions.lastSeenAt));
  const people = await personMap(c, rows.map((r) => r.user.id));
  return rows.map((r) => ({
    id: r.session.id,
    person: personOf(people, r.user.id)!,
    role: r.user.role,
    deviceLabel: r.session.deviceLabel,
    ip: r.session.ip,
    lastSeenAt: r.session.lastSeenAt.toISOString(),
    adminLastActiveAt: r.session.adminLastActiveAt?.toISOString() ?? null,
    current: r.session.id === a.sessionId,
  }));
}

export async function revokeAdminSession(c: Container, a: Actor, id: string) {
  const row = await c.db.select({ session: s.sessions, user: s.users }).from(s.sessions).innerJoin(s.users, eq(s.users.id, s.sessions.userId)).where(and(eq(s.sessions.id, id), eq(s.users.teamId, a.user.teamId))).limit(1);
  const hit = row[0];
  if (!hit) throw notFound('Session not found.');
  if (hit.session.id === a.sessionId) throw badRequest('That is this device. Use Sign out instead.', 'current_session');
  assertCanManage(a, hit.user);
  await revokeSession(c, id);
  await logAudit(c, a, { action: 'session.revoke', targetType: 'session', targetId: id, memberId: hit.user.id, before: { deviceLabel: hit.session.deviceLabel, ip: hit.session.ip }, after: { revoked: true } });
}

/* ───────── Jobs ───────── */

export async function jobRuns(c: Container): Promise<JobRunRow[]> {
  const rows = await c.db.select().from(s.jobRuns).orderBy(desc(s.jobRuns.startedAt)).limit(100);
  return rows.map((r) => ({ id: r.id, job: r.job, source: r.source, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, ok: r.ok, stats: r.stats ?? null, error: r.error }));
}

export function isJobStep(step: string): step is JobStep {
  return (JOB_STEPS as readonly string[]).includes(step);
}

export async function runStep(c: Container, a: Actor, step: string) {
  if (!isJobStep(step)) throw badRequest(`Unknown step. Use one of: ${JOB_STEPS.join(', ')}.`, 'unknown_step');
  let result: { ok: boolean; stats: Record<string, unknown> };
  try {
    const r = await runJobStep(c, step, 'admin');
    result = { ok: r.ok, stats: r.error ? { ...r.stats, error: r.error } : r.stats };
  } catch (e) {
    result = { ok: false, stats: { error: (e as Error).message } };
  }
  await logAudit(c, a, { action: 'jobs.run', targetType: 'job', targetId: step, after: result });
  return result;
}
