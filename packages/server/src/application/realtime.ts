import { eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { getTeam } from './team';

export const teamTopic = (teamId: string, secret: string) => `team:${teamId}:${secret}`;
export const userTopic = (userId: string, secret: string) => `user:${userId}:${secret}`;

/** Fire-and-forget "poll now" hints; payloads carry ids only. */
export async function signalTeam(c: Container, teamId: string, event: string, payload: Record<string, unknown> = {}) {
  if (!c.broadcast.enabled) return;
  const team = await getTeam(c, teamId);
  await c.broadcast.publish(teamTopic(teamId, team.realtimeTopicSecret), event, payload);
}

export async function signalUser(c: Container, userId: string, event: string, payload: Record<string, unknown> = {}) {
  if (!c.broadcast.enabled) return;
  const p = await c.db.query.profiles.findFirst({ where: eq(s.profiles.userId, userId), columns: { realtimeSecret: true } });
  if (p) await c.broadcast.publish(userTopic(userId, p.realtimeSecret), event, payload);
}
