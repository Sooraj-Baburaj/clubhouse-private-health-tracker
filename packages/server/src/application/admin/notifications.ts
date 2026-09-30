import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { LOCKED_NOTIFICATION_TYPES, NOTIFICATION_TYPES, SCHEDULED_NOTIFICATION_TYPES, TeamSettings, type NotificationDefault, type NotificationDefaultsUpdate, type NotificationPrefDto, type NotificationType, type PushHealthResponse } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { z } from 'zod';
import type { Container } from '../../container';
import { unprocessable } from '../../lib/errors';
import { pushToUser } from '../notify';
import { getTeam, invalidateTeam } from '../team';
import { logAudit, personMap, personOf, teamUsers, type Actor } from './shared';

type Group = NotificationPrefDto['group'];

/** Labels for the notification catalogue (SRS Appendix C), shared by the defaults editor and member detail. */
export const NOTIFICATION_LABELS: Record<NotificationType, { label: string; hint: string; group: Group }> = {
  breakfast_reminder: { label: 'Breakfast reminder', hint: 'Only if breakfast isn’t logged yet', group: 'meals' },
  morning_snack_reminder: { label: 'Morning snack reminder', hint: 'Only if the snack isn’t logged yet', group: 'meals' },
  lunch_reminder: { label: 'Lunch reminder', hint: 'Only if lunch isn’t logged yet', group: 'meals' },
  evening_snack_reminder: { label: 'Evening snack reminder', hint: 'Only if the snack isn’t logged yet', group: 'meals' },
  dinner_reminder: { label: 'Dinner reminder', hint: 'Only if dinner isn’t logged yet', group: 'meals' },
  activity_reminder: { label: 'Activity reminder', hint: '30 minutes before a planned session', group: 'activity' },
  momentum_at_risk: { label: 'Momentum at risk', hint: 'Evening nudge when nothing is logged today', group: 'momentum' },
  weekly_recap: { label: 'Weekly recap', hint: 'Sunday evening summary of the week', group: 'momentum' },
  chat_mention: { label: 'Mentions and replies', hint: 'When someone @mentions or replies to you', group: 'chat' },
  chat_digest: { label: 'Chat digest', hint: 'A roundup when the chat is busy', group: 'chat' },
  meme_fired: { label: 'Meme moments', hint: 'When a meme trigger fires for you', group: 'chat' },
  milestone: { label: 'Milestones', hint: 'Streak badges and personal records', group: 'momentum' },
  plan_updated: { label: 'Plan updates', hint: 'When your admin changes your diet or activity plan', group: 'team' },
  announcement: { label: 'Announcements', hint: 'Messages from your admins', group: 'team' },
  ai_budget_alert: { label: 'AI budget alerts', hint: 'Admins only: spend thresholds', group: 'system' },
  weigh_in_reminder: { label: 'Weigh-in reminder', hint: 'A weekly reminder to step on the scale', group: 'momentum' },
  system: { label: 'System', hint: 'Account and security messages', group: 'system' },
};

const MEAL_TYPES: NotificationType[] = ['breakfast_reminder', 'morning_snack_reminder', 'lunch_reminder', 'evening_snack_reminder', 'dinner_reminder'];
const SLOT_OF: Partial<Record<NotificationType, string>> = { breakfast_reminder: 'breakfast', morning_snack_reminder: 'morning_snack', lunch_reminder: 'lunch', evening_snack_reminder: 'evening_snack', dinner_reminder: 'dinner' };

export function prefDto(type: NotificationType, p: { enabled: boolean; time: string | null; days: number[]; smartTime: boolean } | undefined, fallback: NotificationDefault, smartTimes: Record<string, string>): NotificationPrefDto {
  const l = NOTIFICATION_LABELS[type];
  const v = p ?? fallback;
  const slot = SLOT_OF[type];
  return {
    type,
    label: l.label,
    hint: l.hint,
    group: l.group,
    enabled: v.enabled,
    time: v.time,
    days: v.days,
    smartTime: v.smartTime,
    smartTimeValue: slot ? (smartTimes[slot] ?? null) : null,
    supportsTime: SCHEDULED_NOTIFICATION_TYPES.includes(type) && type !== 'activity_reminder',
    supportsDays: SCHEDULED_NOTIFICATION_TYPES.includes(type),
    supportsSmartTime: MEAL_TYPES.includes(type),
    locked: LOCKED_NOTIFICATION_TYPES.includes(type),
  };
}

export async function getDefaults(c: Container, a: Actor) {
  const team = await getTeam(c, a.user.teamId);
  const labels = Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, { ...NOTIFICATION_LABELS[t], locked: LOCKED_NOTIFICATION_TYPES.includes(t) }]));
  return { defaults: team.settings.notificationDefaults, defaultQuietHours: team.settings.defaultQuietHours, copyPool: team.settings.copyPool, labels };
}

/** Team defaults apply to members created later; existing members keep their own choices (SYS-NOTIF-02). */
export async function updateDefaults(c: Container, a: Actor, input: z.infer<typeof NotificationDefaultsUpdate>) {
  const team = await getTeam(c, a.user.teamId);
  const before = { defaults: team.settings.notificationDefaults, defaultQuietHours: team.settings.defaultQuietHours, copyPool: team.settings.copyPool };
  const next = {
    ...team.settings,
    notificationDefaults: input.defaults ? { ...team.settings.notificationDefaults, ...input.defaults } : team.settings.notificationDefaults,
    defaultQuietHours: input.defaultQuietHours !== undefined ? input.defaultQuietHours : team.settings.defaultQuietHours,
    copyPool: input.copyPool ? { ...team.settings.copyPool, ...input.copyPool } : team.settings.copyPool,
  };
  const parsed = TeamSettings.safeParse(next);
  if (!parsed.success) throw unprocessable(parsed.error.issues[0]?.message ?? 'Those settings are not valid.', 'invalid_settings');
  await c.db.update(s.teams).set({ settings: parsed.data, updatedAt: c.clock.now() }).where(eq(s.teams.id, team.id));
  invalidateTeam(team.id);
  await logAudit(c, a, { action: 'notifications.defaults_update', targetType: 'team', targetId: team.id, before, after: { defaults: parsed.data.notificationDefaults, defaultQuietHours: parsed.data.defaultQuietHours, copyPool: parsed.data.copyPool } });
}

export async function pushHealth(c: Container, a: Actor): Promise<PushHealthResponse> {
  const users = await teamUsers(c, a.user.teamId, { activeOnly: true });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { subscriptions: [], total: 0, failures7d: 0, revoked7d: 0, membersWithoutPush: [] };
  const since = new Date(c.clock.now().getTime() - 7 * 86400_000);
  const subs = await c.db.query.pushSubscriptions.findMany({ where: and(inArray(s.pushSubscriptions.userId, ids), isNull(s.pushSubscriptions.revokedAt)) });
  const [revoked] = await c.db.select({ n: sql<number>`count(*)::int` }).from(s.pushSubscriptions).where(and(inArray(s.pushSubscriptions.userId, ids), gte(s.pushSubscriptions.revokedAt, since)));
  // A push "failure" is a notification whose push reached fewer devices than the member had ("1/2", "0/1").
  const [failed] = await c.db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.notifications)
    .where(
      and(
        inArray(s.notifications.userId, ids),
        gte(s.notifications.createdAt, since),
        isNotNull(s.notifications.pushResult),
        sql`${s.notifications.pushResult} ~ '^[0-9]+/[0-9]+$' and split_part(${s.notifications.pushResult}, '/', 1)::int < split_part(${s.notifications.pushResult}, '/', 2)::int`,
      ),
    );
  const byPlatform = new Map<string, number>();
  for (const sub of subs) byPlatform.set(sub.platform || 'unknown', (byPlatform.get(sub.platform || 'unknown') ?? 0) + 1);
  const withPush = new Set(subs.map((x) => x.userId));
  const without = users.filter((u) => !withPush.has(u.id));
  const people = await personMap(c, without.map((u) => u.id));
  return {
    subscriptions: [...byPlatform.entries()].map(([platform, count]) => ({ platform, count })).sort((x, y) => y.count - x.count),
    total: subs.length,
    failures7d: failed?.n ?? 0,
    revoked7d: revoked?.n ?? 0,
    membersWithoutPush: without.map((u) => personOf(people, u.id)!),
  };
}

export async function testToMe(c: Container, a: Actor) {
  const r = await pushToUser(c, a.user.id, { title: 'Test from Clubhouse', body: 'Push works on this device.', url: '/admin/notifications', tag: 'push-test' }, { ttlSec: 600 });
  return { delivered: r.delivered, devices: r.devices };
}
