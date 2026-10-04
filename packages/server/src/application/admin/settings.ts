import { and, eq, isNull } from 'drizzle-orm';
import { TeamSettings, type TeamSettingsUpdate } from '@clubhouse/contracts';
import { isValidTimeZone } from '@clubhouse/domain';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../../container';
import { badRequest, unprocessable } from '../../lib/errors';
import { imageUrls } from '../images';
import { refreshTeamCurrentWeek } from '../board';
import { rescheduleUser } from '../scheduler';
import { getTeam, invalidateTeam } from '../team';
import { logAudit, type Actor } from './shared';

export async function getSettings(c: Container, a: Actor) {
  const team = await getTeam(c, a.user.teamId);
  return { name: team.name, timezone: team.timezone, units: team.units as 'metric' | 'imperial', logoUrl: (await imageUrls(c, team.logoImageId)).url, settings: team.settings };
}

/** Only the keys that changed, for a readable audit entry. */
function changed(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

export async function updateSettings(c: Container, a: Actor, input: TeamSettingsUpdate) {
  const team = await getTeam(c, a.user.teamId);
  if (input.timezone && !isValidTimeZone(input.timezone)) throw badRequest('Unknown timezone.', 'invalid_timezone', { timezone: 'Unknown timezone' });
  if (input.logoImageId) {
    const img = await c.db.query.images.findFirst({ where: and(eq(s.images.id, input.logoImageId), eq(s.images.teamId, team.id), isNull(s.images.purgedAt)) });
    if (!img) throw badRequest('Upload the logo first.', 'bad_image');
    await c.db.update(s.images).set({ kind: 'logo', expiresAt: null }).where(eq(s.images.id, img.id));
  }
  const cur = team.settings;
  const next = {
    ...cur,
    ...(input.mealSlots ? { mealSlots: { ...cur.mealSlots, ...input.mealSlots } } : {}),
    ...(input.thresholds ? { thresholds: input.thresholds } : {}),
    ...(input.streaks ? { streaks: input.streaks } : {}),
    ...(input.privacyDefault !== undefined ? { privacyDefault: input.privacyDefault } : {}),
    ...(input.roastDefault !== undefined ? { roastDefault: input.roastDefault } : {}),
    ...(input.eatBackDefault !== undefined ? { eatBackDefault: input.eatBackDefault } : {}),
    ...(input.featureFlags ? { featureFlags: { ...cur.featureFlags, ...input.featureFlags } } : {}),
    ...(input.board ? { board: { ...cur.board, ...input.board } } : {}),
    ...(input.memes ? { memes: { ...cur.memes, ...input.memes } } : {}),
    ...(input.chat ? { chat: { ...cur.chat, ...input.chat } } : {}),
    ...(input.maintenanceBanner !== undefined ? { maintenanceBanner: input.maintenanceBanner } : {}),
  };
  const parsed = TeamSettings.safeParse(next);
  if (!parsed.success) throw unprocessable(parsed.error.issues[0]?.message ?? 'Those settings are not valid.', 'invalid_settings');
  const row = {
    name: input.name ?? team.name,
    timezone: input.timezone ?? team.timezone,
    units: input.units ?? team.units,
    logoImageId: input.logoImageId !== undefined ? input.logoImageId : team.logoImageId,
  };
  await c.db.update(s.teams).set({ ...row, settings: parsed.data, updatedAt: c.clock.now() }).where(eq(s.teams.id, team.id));
  invalidateTeam(team.id);
  const diff = changed({ name: team.name, timezone: team.timezone, units: team.units, logoImageId: team.logoImageId, ...cur }, { ...row, ...parsed.data });
  await logAudit(c, a, { action: 'team.settings_update', targetType: 'team', targetId: team.id, before: diff.before, after: diff.after });
  // Members on the team timezone (users.timezone null) get their reminders re-planned.
  if (row.timezone !== team.timezone) {
    const users = await c.db.query.users.findMany({ where: and(eq(s.users.teamId, team.id), isNull(s.users.timezone), eq(s.users.status, 'active')) });
    for (const u of users) await rescheduleUser(c, u.id);
  }
  // Leaderboard rule changes apply to the current week: workouts may count differently, so day facts are redone too.
  const saved = parsed.data;
  const boardChanged = JSON.stringify(cur.board) !== JSON.stringify(saved.board) || (!cur.featureFlags.leaderboard && saved.featureFlags.leaderboard);
  if (saved.featureFlags.leaderboard && boardChanged) await refreshTeamCurrentWeek(c, team.id, cur.board.workoutMinMinutes !== saved.board.workoutMinMinutes);
  return getSettings(c, a);
}
