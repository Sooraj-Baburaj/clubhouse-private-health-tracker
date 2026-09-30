import { eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { notFound } from '../lib/errors';

type TeamRow = typeof s.teams.$inferSelect;
const cache = new Map<string, { at: number; team: TeamRow }>();
const TTL_MS = 5000;

/** Team row with its settings, cached briefly per function instance. */
export async function getTeam(c: Container, teamId: string): Promise<TeamRow> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.team;
  const team = await c.db.query.teams.findFirst({ where: eq(s.teams.id, teamId) });
  if (!team) throw notFound('Team not found.');
  cache.set(teamId, { at: Date.now(), team });
  return team;
}

export function invalidateTeam(teamId: string) {
  cache.delete(teamId);
}
