import { eq, sql } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import type { AuthUser } from '../../interface/http/types';
import { getTeam } from '../team';

export type Stats = Record<string, number | string | boolean>;

export interface StepCtx {
  source: string;
  /** Epoch ms after which a step must stop starting new batches. */
  deadline: number;
  /** Run even when a step would normally throttle itself (admin "Run step now"). */
  force?: boolean;
}

export const hasTime = (ctx: StepCtx, reserveMs = 0) => Date.now() + reserveMs < ctx.deadline;

type UserRow = typeof s.users.$inferSelect;

/** The request-shaped user the application services expect, built for a background job. */
export async function authUserFor(c: Container, u: UserRow): Promise<AuthUser> {
  const team = await getTeam(c, u.teamId);
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

export async function getJobState<T extends Record<string, unknown>>(c: Container, key: string): Promise<T | null> {
  const row = await c.db.query.jobState.findFirst({ where: eq(s.jobState.key, key) });
  return (row?.value as T | undefined) ?? null;
}

export async function setJobState(c: Container, key: string, value: Record<string, unknown>) {
  await c.db
    .insert(s.jobState)
    .values({ key, value, updatedAt: c.clock.now() })
    .onConflictDoUpdate({ target: s.jobState.key, set: { value, updatedAt: sql`now()` } });
}
