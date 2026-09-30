import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  CreateMemberRequest,
  NOTIFICATION_TYPES,
  type AdminMemberDetail,
  type AdminMemberRow,
  type ImportMembersResult,
  type NotificationType,
  type RoleChangeRequest,
  type StreakDto,
  type TypedConfirmRequest,
  type UpdateMemberRequest,
  type VacationRequest,
} from '@clubhouse/contracts';
import { addDays, dayCalorieClass, isValidTimeZone, localDateOf, weekStartOf } from '@clubhouse/domain';
import { schema as s, seed } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { tempPassword } from '../../lib/crypto';
import { badRequest, conflict, forbidden } from '../../lib/errors';
import { recomputeMemberStreaks } from '../momentum';
import { setVacation } from '../profile';
import { rescheduleUser } from '../scheduler';
import { revokeAllSessions } from '../sessions';
import { targetsDto } from '../targets';
import { getTeam } from '../team';
import { auditRows } from './auditLog';
import { prefDto } from './notifications';
import { planItemsDto, planWeeks, usualDays } from './plans';
import { weekPlanProgress } from '../plans';
import { assertCanManage, asAuthUser, getMember, isSuper, logAudit, monthStartUtc, parseCsv, personMap, personOf, requireSuper, teamUsers, type Actor, type UserRow } from './shared';

const TEMP_PASSWORD_DAYS = 7;

function tzOf(u: Pick<UserRow, 'timezone'>, teamTz: string) {
  return u.timezone || teamTz;
}

/** Table rows for many members at once (ADM-USR-01). */
export async function memberRows(c: Container, teamId: string, users: UserRow[]): Promise<AdminMemberRow[]> {
  if (!users.length) return [];
  const team = await getTeam(c, teamId);
  const now = c.clock.now();
  const ids = users.map((u) => u.id);
  const todays = new Map(users.map((u) => [u.id, localDateOf(now, tzOf(u, team.timezone))]));
  const dates = [...new Set(todays.values())];
  const [people, foods, acts, weights, streaks, ai] = await Promise.all([
    personMap(c, ids),
    c.db.selectDistinct({ userId: s.foodLogs.userId, date: s.foodLogs.date }).from(s.foodLogs).where(and(inArray(s.foodLogs.userId, ids), inArray(s.foodLogs.date, dates), isNull(s.foodLogs.deletedAt))),
    c.db.selectDistinct({ userId: s.activityLogs.userId, date: s.activityLogs.date }).from(s.activityLogs).where(and(inArray(s.activityLogs.userId, ids), inArray(s.activityLogs.date, dates), isNull(s.activityLogs.deletedAt))),
    c.db.selectDistinct({ userId: s.weightEntries.userId, date: s.weightEntries.date }).from(s.weightEntries).where(and(inArray(s.weightEntries.userId, ids), inArray(s.weightEntries.date, dates), isNull(s.weightEntries.deletedAt))),
    c.db.query.streakStates.findMany({ where: and(inArray(s.streakStates.userId, ids), eq(s.streakStates.kind, 'logging')) }),
    c.db
      .select({ userId: s.aiCalls.userId, n: sql<number>`count(*)::int` })
      .from(s.aiCalls)
      .where(and(eq(s.aiCalls.teamId, teamId), inArray(s.aiCalls.userId, ids), gte(s.aiCalls.startedAt, monthStartUtc(now)), eq(s.aiCalls.test, false), sql`${s.aiCalls.outcome} not in ('budget_blocked','cap_blocked')`))
      .groupBy(s.aiCalls.userId),
  ]);
  const logged = new Set([...foods, ...acts, ...weights].map((r) => `${r.userId}:${r.date}`));
  const rows: AdminMemberRow[] = [];
  for (const u of users) {
    const today = todays.get(u.id)!;
    const progress = await weekPlanProgress(c, u.id, weekStartOf(today));
    const weekly = progress.items.filter((i) => i.target > 0);
    rows.push({
      id: u.id,
      person: personOf(people, u.id)!,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status === 'deactivated' ? 'deactivated' : u.mustChangePassword ? 'invited' : 'active',
      timezone: tzOf(u, team.timezone),
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
      loggedToday: logged.has(`${u.id}:${today}`),
      streak: streaks.find((x) => x.userId === u.id)?.current ?? 0,
      plan: weekly.length ? { done: weekly.reduce((a, i) => a + Math.min(i.done, i.target), 0), target: weekly.reduce((a, i) => a + i.target, 0) } : null,
      aiCallsMonth: ai.find((x) => x.userId === u.id)?.n ?? 0,
      tempPasswordExpiresAt: u.mustChangePassword ? (u.tempPasswordExpiresAt?.toISOString() ?? null) : null,
      totpEnabled: !!u.totpEnabledAt,
      createdAt: u.createdAt.toISOString(),
    });
  }
  return rows;
}

export async function memberRow(c: Container, teamId: string, userId: string): Promise<AdminMemberRow> {
  const u = await getMember(c, teamId, userId);
  return (await memberRows(c, teamId, [u]))[0]!;
}

export async function listMembers(c: Container, a: Actor) {
  return memberRows(c, a.user.teamId, await teamUsers(c, a.user.teamId));
}

async function assertUnique(c: Container, username: string, email: string | null | undefined, exceptId?: string) {
  const conds = [sql`lower(${s.users.username}) = ${username.toLowerCase()}`];
  if (email) conds.push(sql`lower(${s.users.email}) = ${email.toLowerCase()}`);
  const hits = await c.db.select({ id: s.users.id, username: s.users.username, email: s.users.email }).from(s.users).where(and(or(...conds), exceptId ? ne(s.users.id, exceptId) : undefined));
  if (hits.some((h) => h.username.toLowerCase() === username.toLowerCase())) throw conflict('That username is taken.', 'username_taken');
  if (email && hits.some((h) => h.email?.toLowerCase() === email.toLowerCase())) throw conflict('That email is already used by another account.', 'email_taken');
}

function checkTimezone(tz: string | null | undefined) {
  if (tz && !isValidTimeZone(tz)) throw badRequest('Unknown timezone.', 'invalid_timezone', { timezone: 'Unknown timezone' });
}

type CreateInput = z.infer<typeof CreateMemberRequest>;

async function createOne(c: Container, a: Actor, input: CreateInput) {
  const team = await getTeam(c, a.user.teamId);
  const pw = tempPassword();
  const hash = await c.hasher.hash(pw);
  const u = await seed.provisionMember(c.db, {
    teamId: a.user.teamId,
    username: input.username,
    displayName: input.displayName,
    email: input.email ?? null,
    role: input.role,
    passwordHash: hash,
    mustChangePassword: true,
    tempPasswordExpiresAt: new Date(c.clock.now().getTime() + TEMP_PASSWORD_DAYS * 86400_000),
    createdBy: a.user.id,
    timezone: input.timezone && input.timezone !== team.timezone ? input.timezone : null,
  });
  return { user: u, tempPassword: pw };
}

/** ADM-USR-02: create with a 12-character temporary password, shown once, valid for 7 days. */
export async function createMember(c: Container, a: Actor, input: CreateInput) {
  if (input.role !== 'member') requireSuper(a, 'create admins');
  checkTimezone(input.timezone);
  await assertUnique(c, input.username, input.email);
  const { user, tempPassword: pw } = await createOne(c, a, input);
  await logAudit(c, a, { action: 'member.create', targetType: 'user', targetId: user.id, memberId: user.id, after: { username: user.username, displayName: user.displayName, email: user.email, role: user.role } });
  return { member: await memberRow(c, a.user.teamId, user.id), tempPassword: pw };
}

export async function updateMember(c: Container, a: Actor, userId: string, input: z.infer<typeof UpdateMemberRequest>) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  checkTimezone(input.timezone);
  if (input.username || input.email) await assertUnique(c, input.username ?? u.username, input.email ?? null, u.id);
  const team = await getTeam(c, a.user.teamId);
  const patch: Partial<typeof s.users.$inferInsert> = { updatedAt: c.clock.now() };
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.username !== undefined) patch.username = input.username.toLowerCase();
  if (input.email !== undefined) patch.email = input.email ? input.email.toLowerCase() : null;
  if (input.timezone !== undefined) patch.timezone = input.timezone && input.timezone !== team.timezone ? input.timezone : null;
  await c.db.update(s.users).set(patch).where(eq(s.users.id, u.id));
  if (input.timezone !== undefined) await rescheduleUser(c, u.id);
  await logAudit(c, a, {
    action: 'member.update',
    targetType: 'user',
    targetId: u.id,
    memberId: u.id,
    before: { displayName: u.displayName, username: u.username, email: u.email, timezone: u.timezone },
    after: { displayName: patch.displayName ?? u.displayName, username: patch.username ?? u.username, email: patch.email !== undefined ? patch.email : u.email, timezone: patch.timezone !== undefined ? patch.timezone : u.timezone },
  });
  return memberRow(c, a.user.teamId, u.id);
}

/** SYS-ROLE-03: role changes need a reason; nobody changes their own role; the last Super Admin stays (row locks). */
export async function changeRole(c: Container, a: Actor, userId: string, input: z.infer<typeof RoleChangeRequest>) {
  requireSuper(a, 'change roles');
  if (userId === a.user.id) throw forbidden('You can’t change your own role. Ask another Super Admin.', 'own_role');
  const before = await c.db.transaction(async (tx) => {
    const supers = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.teamId, a.user.teamId), eq(s.users.role, 'super_admin'), eq(s.users.status, 'active'))).for('update');
    const [target] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.teamId, a.user.teamId))).for('update');
    if (!target) throw badRequest('Member not found.', 'not_found');
    if (target.role === input.role) return target.role;
    if (target.role === 'super_admin' && target.status === 'active' && supers.length <= 1) throw conflict('This is the last Super Admin. Promote someone else first.', 'last_super_admin');
    await tx.update(s.users).set({ role: input.role, updatedAt: c.clock.now() }).where(eq(s.users.id, userId));
    return target.role;
  });
  await logAudit(c, a, { action: 'member.role_change', targetType: 'user', targetId: userId, memberId: userId, before: { role: before }, after: { role: input.role }, reason: input.reason });
  return memberRow(c, a.user.teamId, userId);
}

export async function resetPassword(c: Container, a: Actor, userId: string) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  if (u.id === a.user.id) throw badRequest('Use “Change password” for your own account.', 'own_password');
  const pw = tempPassword();
  await c.db
    .update(s.users)
    .set({ passwordHash: await c.hasher.hash(pw), mustChangePassword: true, tempPasswordExpiresAt: new Date(c.clock.now().getTime() + TEMP_PASSWORD_DAYS * 86400_000), updatedAt: c.clock.now() })
    .where(eq(s.users.id, u.id));
  const revoked = await revokeAllSessions(c, u.id);
  await logAudit(c, a, { action: 'member.reset_password', targetType: 'user', targetId: u.id, memberId: u.id, after: { mustChangePassword: true, sessionsRevoked: revoked } });
  return { tempPassword: pw };
}

async function revokeEverything(c: Container, userId: string) {
  const n = await revokeAllSessions(c, userId);
  await c.db.update(s.pushSubscriptions).set({ revokedAt: c.clock.now() }).where(and(eq(s.pushSubscriptions.userId, userId), isNull(s.pushSubscriptions.revokedAt)));
  return n;
}

export async function deactivate(c: Container, a: Actor, userId: string, reason: string | undefined) {
  if (userId === a.user.id) throw badRequest('You can’t deactivate yourself.', 'own_account');
  const before = await c.db.transaction(async (tx) => {
    const supers = await tx.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.teamId, a.user.teamId), eq(s.users.role, 'super_admin'), eq(s.users.status, 'active'))).for('update');
    const [target] = await tx.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.teamId, a.user.teamId))).for('update');
    if (!target) throw badRequest('Member not found.', 'not_found');
    assertCanManage(a, target);
    if (target.status === 'deactivated') return target.status;
    if (target.role === 'super_admin' && supers.length <= 1) throw conflict('This is the last Super Admin and can’t be deactivated.', 'last_super_admin');
    await tx.update(s.users).set({ status: 'deactivated', deactivatedAt: c.clock.now(), updatedAt: c.clock.now() }).where(eq(s.users.id, userId));
    return target.status;
  });
  const revoked = await revokeEverything(c, userId);
  await rescheduleUser(c, userId);
  await logAudit(c, a, { action: 'member.deactivate', targetType: 'user', targetId: userId, memberId: userId, before: { status: before }, after: { status: 'deactivated', sessionsRevoked: revoked }, reason: reason ?? null });
  return memberRow(c, a.user.teamId, userId);
}

export async function reactivate(c: Container, a: Actor, userId: string) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  await c.db.update(s.users).set({ status: 'active', deactivatedAt: null, updatedAt: c.clock.now() }).where(eq(s.users.id, u.id));
  await rescheduleUser(c, u.id);
  await logAudit(c, a, { action: 'member.reactivate', targetType: 'user', targetId: u.id, memberId: u.id, before: { status: u.status }, after: { status: 'active' } });
  return memberRow(c, a.user.teamId, u.id);
}

export async function revokeSessions(c: Container, a: Actor, userId: string) {
  const u = await getMember(c, a.user.teamId, userId);
  assertCanManage(a, u);
  const revoked = await revokeAllSessions(c, u.id, u.id === a.user.id ? a.sessionId : undefined);
  await logAudit(c, a, { action: 'member.revoke_sessions', targetType: 'user', targetId: u.id, memberId: u.id, after: { revoked } });
  return { revoked };
}

export async function resetTotp(c: Container, a: Actor, userId: string, reason: string) {
  requireSuper(a, 'reset two-step verification');
  const u = await getMember(c, a.user.teamId, userId);
  await c.db.update(s.users).set({ totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpRecoveryHashes: null, updatedAt: c.clock.now() }).where(eq(s.users.id, u.id));
  await logAudit(c, a, { action: 'member.reset_totp', targetType: 'user', targetId: u.id, memberId: u.id, before: { totpEnabled: !!u.totpEnabledAt }, after: { totpEnabled: false }, reason });
}

/** Admin-set vacation bypasses the member's quarterly quota (the range records who set it). */
export async function setMemberVacation(c: Container, a: Actor, userId: string, input: z.infer<typeof VacationRequest>) {
  const u = await getMember(c, a.user.teamId, userId);
  const team = await getTeam(c, a.user.teamId);
  const user = asAuthUser(u, team);
  const ranges = await setVacation(c, user, input, a.user.id);
  await recomputeMemberStreaks(c, u.id, localDateOf(c.clock.now(), user.timezone));
  await logAudit(c, a, { action: 'member.vacation_set', targetType: 'user', targetId: u.id, memberId: u.id, after: { from: input.from, to: input.to, ranges } });
}

/**
 * SYS-PRIV-03: delete a member's personal data (super admin, typed confirmation in the UI, reason required).
 * The account row stays so audit history resolves; logs, plans, notifications and AI outputs go; chat messages
 * are blanked and detached from the author; images are expired so the retention job purges them.
 */
export async function deleteMemberData(c: Container, a: Actor, userId: string, input: z.infer<typeof TypedConfirmRequest>) {
  requireSuper(a, 'delete a member’s data');
  if (!input.confirm.trim()) throw badRequest('Type the confirmation word to continue.', 'confirm_required');
  if (userId === a.user.id) throw badRequest('You can’t delete your own data from the admin panel.', 'own_account');
  const u = await getMember(c, a.user.teamId, userId);
  const now = c.clock.now();
  const counts = await c.db.transaction(async (tx) => {
    const n = async (p: Promise<{ length: number }>) => (await p).length;
    const out: Record<string, number> = {};
    out.foodLogs = await n(tx.delete(s.foodLogs).where(eq(s.foodLogs.userId, userId)).returning({ id: s.foodLogs.id }));
    out.activityLogs = await n(tx.delete(s.activityLogs).where(eq(s.activityLogs.userId, userId)).returning({ id: s.activityLogs.id }));
    out.weightEntries = await n(tx.delete(s.weightEntries).where(eq(s.weightEntries.userId, userId)).returning({ id: s.weightEntries.id }));
    await tx.delete(s.dayFacts).where(eq(s.dayFacts.userId, userId));
    await tx.delete(s.userBadges).where(eq(s.userBadges.userId, userId));
    await tx.delete(s.personalRecords).where(eq(s.personalRecords.userId, userId));
    await tx.delete(s.weeklyRecaps).where(eq(s.weeklyRecaps.userId, userId));
    await tx.update(s.streakStates).set({ current: 0, best: 0, status: 'active', graceLeft: 0, pausedSince: null, lastCountedDate: null, atRisk: false, history: [], computedFor: null, updatedAt: now }).where(eq(s.streakStates.userId, userId));
    await tx.delete(s.foodUsage).where(eq(s.foodUsage.userId, userId));
    out.foods = await n(tx.update(s.foodItems).set({ deletedAt: now }).where(and(eq(s.foodItems.ownerId, userId), isNull(s.foodItems.deletedAt), eq(s.foodItems.verified, false))).returning({ id: s.foodItems.id }));
    await tx.update(s.recipes).set({ deletedAt: now }).where(and(eq(s.recipes.ownerId, userId), isNull(s.recipes.deletedAt), eq(s.recipes.promoted, false)));
    out.dietPlans = await n(tx.delete(s.dietPlans).where(eq(s.dietPlans.userId, userId)).returning({ id: s.dietPlans.id }));
    await tx.delete(s.dietFeedback).where(eq(s.dietFeedback.userId, userId));
    await tx.delete(s.activityPlans).where(eq(s.activityPlans.userId, userId));
    await tx.delete(s.activityPlanProposals).where(eq(s.activityPlanProposals.userId, userId));
    await tx.delete(s.restWeeks).where(eq(s.restWeeks.userId, userId));
    out.notifications = await n(tx.delete(s.notifications).where(eq(s.notifications.userId, userId)).returning({ id: s.notifications.id }));
    await tx.update(s.notificationSchedules).set({ nextSendAt: null, claimedAt: null, updatedAt: now }).where(eq(s.notificationSchedules.userId, userId));
    await tx.delete(s.aiSummaries).where(eq(s.aiSummaries.userId, userId));
    await tx.update(s.aiCalls).set({ userId: null, promptSnapshot: null }).where(eq(s.aiCalls.userId, userId));
    await tx.delete(s.memeFires).where(eq(s.memeFires.userId, userId));
    await tx.delete(s.triggerEvaluations).where(eq(s.triggerEvaluations.userId, userId));
    await tx.delete(s.reactions).where(eq(s.reactions.userId, userId));
    await tx.delete(s.messageReports).where(eq(s.messageReports.reporterId, userId));
    out.messages = await n(
      tx.update(s.messages).set({ userId: null, body: '', attachments: [], mentions: [], meta: {}, deletedAt: now, deletedBy: a.user.id }).where(eq(s.messages.userId, userId)).returning({ id: s.messages.id }),
    );
    await tx.delete(s.chatMutes).where(eq(s.chatMutes.userId, userId));
    await tx.delete(s.presence).where(eq(s.presence.userId, userId));
    out.images = await n(tx.update(s.images).set({ expiresAt: now }).where(and(eq(s.images.ownerId, userId), isNull(s.images.purgedAt))).returning({ id: s.images.id }));
    await tx
      .update(s.profiles)
      .set({
        heightCm: null,
        weightKg: null,
        dob: null,
        sex: null,
        activityLevel: null,
        goalType: null,
        targetWeightKg: null,
        targetDate: null,
        paceKgWeek: null,
        calorieTarget: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        fibreG: null,
        tdee: null,
        targetsWeightKg: null,
        targetsComputedAt: null,
        targetOverrides: null,
        targetsOverriddenBy: null,
        overrideReason: null,
        thresholdsOverride: null,
        dietPrefs: { allergies: [], dislikes: [], cuisines: [], diet: 'none' },
        vacationRanges: [],
        smartTimes: {},
        rolledOverFor: null,
        updatedAt: now,
      })
      .where(eq(s.profiles.userId, userId));
    await tx.update(s.users).set({ avatarImageId: null, onboardedAt: null, updatedAt: now }).where(eq(s.users.id, userId));
    await tx.update(s.deletionRequests).set({ status: 'done', handledBy: a.user.id, handledAt: now }).where(and(eq(s.deletionRequests.userId, userId), eq(s.deletionRequests.status, 'open')));
    return out;
  });
  await logAudit(c, a, { action: 'member.delete_data', targetType: 'user', targetId: u.id, memberId: u.id, before: { username: u.username }, after: counts, reason: input.reason });
}

/* ───────── CSV import ───────── */

const pickCol = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(r).find((x) => x.trim().toLowerCase().replace(/[\s_-]/g, '') === k);
    if (hit && r[hit]?.trim()) return r[hit]!.trim();
  }
  return '';
};

/** ADM-USR-03: CSV import with a dry run; temporary passwords come back once, per created row. */
export async function importMembers(c: Container, a: Actor, csv: string, dryRun: boolean): Promise<ImportMembersResult> {
  const records = parseCsv(csv);
  if (!records.length) throw badRequest('The CSV needs a header row and at least one member.', 'empty_csv');
  if (records.length > 200) throw badRequest('Import at most 200 members at a time.', 'too_many_rows');
  const existing = await c.db.select({ username: s.users.username, email: s.users.email }).from(s.users);
  const takenUsers = new Set(existing.map((e) => e.username.toLowerCase()));
  const takenEmails = new Set(existing.map((e) => e.email?.toLowerCase()).filter((x): x is string => !!x));
  const rows: ImportMembersResult['rows'] = [];
  let created = 0;
  let errors = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const raw = {
      displayName: pickCol(r, 'displayname', 'name', 'fullname'),
      username: pickCol(r, 'username', 'user', 'login'),
      email: pickCol(r, 'email', 'mail') || null,
      role: (pickCol(r, 'role') || 'member').toLowerCase().replace(/[\s-]/g, '_'),
      timezone: pickCol(r, 'timezone', 'tz') || null,
    };
    const line = i + 2;
    const parsed = CreateMemberRequest.safeParse(raw);
    let error: string | null = null;
    if (!parsed.success) error = `${parsed.error.issues[0]?.path.join('.') || 'row'}: ${parsed.error.issues[0]?.message ?? 'invalid'}`;
    else if (takenUsers.has(parsed.data.username)) error = 'Username is taken.';
    else if (parsed.data.email && takenEmails.has(parsed.data.email.toLowerCase())) error = 'Email is already used.';
    else if (parsed.data.role !== 'member' && !isSuper(a)) error = 'Only a Super Admin can import admins.';
    else if (parsed.data.timezone && !isValidTimeZone(parsed.data.timezone)) error = 'Unknown timezone.';
    const base = { line, displayName: raw.displayName, username: raw.username.toLowerCase(), email: raw.email, role: raw.role };
    if (error || !parsed.success) {
      errors++;
      rows.push({ ...base, status: 'error', error, tempPassword: null });
      continue;
    }
    takenUsers.add(parsed.data.username);
    if (parsed.data.email) takenEmails.add(parsed.data.email.toLowerCase());
    if (dryRun) {
      rows.push({ ...base, status: 'ok', error: null, tempPassword: null });
      continue;
    }
    try {
      const { user, tempPassword: pw } = await createOne(c, a, parsed.data);
      created++;
      rows.push({ ...base, status: 'created', error: null, tempPassword: pw });
      void user;
    } catch (e) {
      errors++;
      rows.push({ ...base, status: 'error', error: (e as Error).message.slice(0, 200), tempPassword: null });
    }
  }
  if (!dryRun) await logAudit(c, a, { action: 'member.import', targetType: 'user', after: { created, errors, usernames: rows.filter((r) => r.status === 'created').map((r) => r.username) } });
  return { rows, created, errors };
}

/* ───────── Detail ───────── */

export async function memberDetail(c: Container, a: Actor, userId: string): Promise<AdminMemberDetail> {
  const u = await getMember(c, a.user.teamId, userId);
  const team = await getTeam(c, a.user.teamId);
  const tz = tzOf(u, team.timezone);
  const now = c.clock.now();
  const today = localDateOf(now, tz);
  const [member, profile, streakRows, prefs, diet, aiRows, facts, logCounts, auditLogRows, sessions] = await Promise.all([
    memberRow(c, a.user.teamId, userId),
    c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId) }),
    c.db.query.streakStates.findMany({ where: eq(s.streakStates.userId, userId) }),
    c.db.query.notificationPreferences.findMany({ where: eq(s.notificationPreferences.userId, userId) }),
    c.db.query.dietPlans.findMany({ where: and(eq(s.dietPlans.userId, userId), inArray(s.dietPlans.status, ['published', 'draft'])), orderBy: [desc(s.dietPlans.updatedAt)] }),
    c.db
      .select({ feature: s.aiCalls.feature, calls: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${s.aiCalls.costUsd}), 0)::float8` })
      .from(s.aiCalls)
      .where(and(eq(s.aiCalls.userId, userId), eq(s.aiCalls.teamId, a.user.teamId), gte(s.aiCalls.startedAt, monthStartUtc(now)), eq(s.aiCalls.test, false), sql`${s.aiCalls.outcome} not in ('budget_blocked','cap_blocked')`))
      .groupBy(s.aiCalls.feature),
    c.db.query.dayFacts.findMany({ where: and(eq(s.dayFacts.userId, userId), gte(s.dayFacts.date, addDays(today, -13))) }),
    c.db
      .select({ date: s.foodLogs.date, n: sql<number>`count(*)::int` })
      .from(s.foodLogs)
      .where(and(eq(s.foodLogs.userId, userId), gte(s.foodLogs.date, addDays(today, -13)), isNull(s.foodLogs.deletedAt)))
      .groupBy(s.foodLogs.date),
    c.db.query.auditLogs.findMany({ where: and(eq(s.auditLogs.teamId, a.user.teamId), or(eq(s.auditLogs.memberId, userId), eq(s.auditLogs.targetId, userId))), orderBy: [desc(s.auditLogs.id)], limit: 50 }),
    c.db.query.sessions.findMany({ where: and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt), sql`${s.sessions.expiresAt} > now()`), orderBy: [desc(s.sessions.lastSeenAt)] }),
  ]);
  const plan = diet.find((d) => d.status === 'published') ?? diet[0] ?? null;
  const streaks: StreakDto[] = streakRows.map((r) => ({
    kind: r.kind as StreakDto['kind'],
    current: r.current,
    best: r.best,
    status: r.status as StreakDto['status'],
    graceLeft: r.graceLeft,
    pausedSince: r.pausedSince,
    atRisk: r.atRisk,
    history: r.history.slice(-30),
  }));
  const recentDays: AdminMemberDetail['recentDays'] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, -i);
    const f = facts.find((x) => x.date === d);
    const logs = logCounts.find((x) => x.date === d)?.n ?? 0;
    const eaten = Math.round(f?.kcalEaten ?? 0);
    const target = f?.kcalTarget ?? null;
    recentDays.push({ date: d, eaten, target, burned: Math.round(f?.kcalBurned ?? 0), logs, band: target && logs ? dayCalorieClass(eaten, target, team.settings.thresholds) : 'none' });
  }
  return {
    member,
    timezone: tz,
    profile: profile
      ? {
          units: profile.units,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          dob: profile.dob,
          sex: profile.sex,
          activityLevel: profile.activityLevel,
          goalType: profile.goalType,
          paceKgWeek: profile.paceKgWeek,
          targetWeightKg: profile.targetWeightKg,
          targetDate: profile.targetDate,
          eatBackExercise: profile.eatBackExercise,
          dietPrefs: profile.dietPrefs,
        }
      : null,
    targets: profile ? await targetsDto(c, profile, today) : null,
    thresholdsOverride: profile?.thresholdsOverride ?? null,
    diet: plan ? { id: plan.id, name: plan.name, version: plan.version, status: plan.status, publishedAt: plan.publishedAt?.toISOString() ?? null, aiGenerated: plan.aiGenerated } : null,
    plan: { items: await planItemsDto(c, userId, weekStartOf(today)), weeks: await planWeeks(c, userId, today), usualDays: await usualDays(c, userId) },
    streaks,
    vacation: (profile?.vacationRanges ?? []).map((r) => ({ from: r.from, to: r.to })),
    notificationPrefs: NOTIFICATION_TYPES.map((t: NotificationType) =>
      prefDto(t, prefs.find((p) => p.type === t), team.settings.notificationDefaults[t] ?? { enabled: true, time: null, days: [0, 1, 2, 3, 4, 5, 6], smartTime: false }, profile?.smartTimes ?? {}),
    ),
    ai: {
      callsMonth: aiRows.reduce((acc, r) => acc + r.calls, 0),
      costMonth: Math.round(aiRows.reduce((acc, r) => acc + Number(r.cost), 0) * 1e4) / 1e4,
      byFeature: aiRows.map((r) => ({ feature: r.feature, calls: r.calls, cost: Math.round(Number(r.cost) * 1e4) / 1e4 })),
    },
    recentDays,
    audit: await auditRows(c, auditLogRows),
    sessions: sessions.map((x) => ({ id: x.id, deviceLabel: x.deviceLabel, lastSeenAt: x.lastSeenAt.toISOString(), ip: x.ip })),
  };
}

