import { eq } from 'drizzle-orm';
import { withSettingDefaults } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { notFound } from '../lib/errors';

type TeamRow = typeof s.teams.$inferSelect;
const cache = new Map<string, { at: number; team: TeamRow }>();
const TTL_MS = 5000;

/**
 * Team row with its settings, cached briefly per function instance. Settings added after the team was created (a new
 * flag, a new notification type) are filled with their defaults, so callers never read `undefined`.
 */
export async function getTeam(c: Container, teamId: string): Promise<TeamRow> {
  const hit = cache.get(teamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.team;
  const row = await c.db.query.teams.findFirst({ where: eq(s.teams.id, teamId) });
  if (!row) throw notFound('Team not found.');
  const team = { ...row, settings: withSettingDefaults(row.settings) };
  cache.set(teamId, { at: Date.now(), team });
  return team;
}

export function invalidateTeam(teamId: string) {
  cache.delete(teamId);
}
