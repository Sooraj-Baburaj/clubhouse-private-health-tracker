import { and, eq, inArray } from 'drizzle-orm';
import { ROLE_RANK, type PersonRef, type Role } from '@clubhouse/contracts';
import { localDateOf, startOfLocalDay } from '@clubhouse/domain';
import { schema as s, seed, type Db } from '@clubhouse/db';
import type { Container } from '../../container';
import type { AuthUser } from '../../interface/http/types';
import { initials } from '../../lib/crypto';
import { forbidden, notFound } from '../../lib/errors';
import { audit, type AuditInput } from '../audit';
import { imageUrlMap, pick } from '../images';
import { getTeam } from '../team';

export type UserRow = typeof s.users.$inferSelect;
export type TeamRow = typeof s.teams.$inferSelect;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Who is doing an admin action, with the request metadata the audit log records. */
export interface Actor {
  user: AuthUser;
  sessionId: string;
  ip: string;
  userAgent: string;
}

export const isSuper = (a: Actor) => a.user.role === 'super_admin';

/** Super-admin-only operations fail with a clear 403 (SYS-ROLE-02). */
export function requireSuper(a: Actor, what: string) {
  if (!isSuper(a)) throw forbidden(`Only a Super Admin can ${what}.`, 'super_admin_required');
}

/** Admins may not act on someone ranked above them (an admin cannot reset a Super Admin, for example). */
export function assertCanManage(a: Actor, target: Pick<UserRow, 'role'>) {
  if (ROLE_RANK[target.role] > ROLE_RANK[a.user.role]) throw forbidden('Only a Super Admin can manage another Super Admin.', 'super_admin_required');
}

export async function logAudit(c: Container, a: Actor, x: Omit<AuditInput, 'teamId' | 'actorId' | 'actorRole' | 'ip' | 'userAgent'>) {
  await audit(c, { ...x, teamId: a.user.teamId, actorId: a.user.id, actorRole: a.user.role, ip: a.ip, userAgent: a.userAgent });
}

/** A user of the admin's own team, or 404 (team scoping on every lookup). */
export async function getMember(c: Container, teamId: string, userId: string): Promise<UserRow> {
  const u = await c.db.query.users.findFirst({ where: and(eq(s.users.id, userId), eq(s.users.teamId, teamId)) });
  if (!u) throw notFound('Member not found.');
  return u;
}

export async function teamUsers(c: Container, teamId: string, opts: { activeOnly?: boolean } = {}): Promise<UserRow[]> {
  const rows = await c.db.query.users.findMany({ where: eq(s.users.teamId, teamId), orderBy: (t, { asc }) => [asc(t.displayName)] });
  return opts.activeOnly ? rows.filter((u) => u.status === 'active') : rows;
}

export function asAuthUser(u: UserRow, team: TeamRow): AuthUser {
  return {
    id: u.id,
    teamId: u.teamId,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    timezone: u.timezone || team.timezone,
    teamTimezone: team.timezone,
    totpEnabled: !!u.totpEnabledAt,
    avatarImageId: u.avatarImageId,
  };
}

export async function memberAuthUser(c: Container, teamId: string, userId: string): Promise<{ row: UserRow; user: AuthUser; team: TeamRow }> {
  const row = await getMember(c, teamId, userId);
  const team = await getTeam(c, teamId);
  return { row, user: asAuthUser(row, team), team };
}

/** PersonRef for many user ids at once (avatars resolved to signed thumbnails). */
export async function personMap(c: Container, ids: (string | null | undefined)[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, PersonRef>();
  if (!unique.length) return out;
  const rows = await c.db.select({ id: s.users.id, displayName: s.users.displayName, avatarImageId: s.users.avatarImageId }).from(s.users).where(inArray(s.users.id, unique));
  const images = await imageUrlMap(c, rows.map((r) => r.avatarImageId));
  for (const r of rows) {
    const av = pick(images, r.avatarImageId);
    out.set(r.id, { id: r.id, name: r.displayName, initials: initials(r.displayName), avatarUrl: av.thumbUrl ?? av.url });
  }
  return out;
}

export const personOf = (m: Map<string, PersonRef>, id: string | null | undefined): PersonRef | null => (id ? (m.get(id) ?? { id, name: 'Former member', initials: '?', avatarUrl: null }) : null);

export function teamClock(c: Container, team: TeamRow) {
  const now = c.clock.now();
  const today = localDateOf(now, team.timezone);
  return { now, today, dayStart: startOfLocalDay(today, team.timezone), tz: team.timezone };
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export const toCsv = (rows: Record<string, unknown>[], columns?: string[]) => seed.toCsv(rows, columns);
export const parseCsv = (text: string) => seed.parseCsv(text);

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function memberStatus(u: Pick<UserRow, 'status' | 'mustChangePassword'>): 'active' | 'invited' | 'deactivated' {
  if (u.status === 'deactivated') return 'deactivated';
  return u.mustChangePassword ? 'invited' : 'active';
}

export const ROLE_LABEL: Record<Role, string> = { member: 'Member', admin: 'Admin', super_admin: 'Super Admin' };
