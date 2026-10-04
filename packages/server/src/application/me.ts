import { and, count, eq, gte } from 'drizzle-orm';
import { AI_FEATURE_KEYS, type AiFeatureKey, type MeResponse } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import type { AuthUser } from '../interface/http/types';
import { memberClock } from './clockCtx';
import { imageUrls } from './images';
import { loadProfile, profileToDto } from './profile';
import { teamTopic, userTopic } from './realtime';
import { targetsDto } from './targets';
import { getTeam } from './team';

export async function buildMe(c: Container, user: AuthUser): Promise<MeResponse> {
  const team = await getTeam(c, user.teamId);
  const p = await loadProfile(c, user.id);
  const u = await c.db.query.users.findFirst({ where: eq(s.users.id, user.id) });
  const clock = memberClock(c, user.timezone);
  const ai = await c.db.query.aiSettings.findFirst({ where: eq(s.aiSettings.teamId, user.teamId) });
  const teamOn = !!ai?.globalOn && c.ai.mode !== 'off';
  const features = Object.fromEntries(AI_FEATURE_KEYS.map((k) => [k, teamOn && !!ai?.features[k]?.on])) as Record<AiFeatureKey, boolean>;
  const monthStart = new Date(Date.UTC(clock.now.getUTCFullYear(), clock.now.getUTCMonth(), 1));
  const [calls] = await c.db.select({ n: count() }).from(s.aiCalls).where(and(eq(s.aiCalls.userId, user.id), gte(s.aiCalls.startedAt, monthStart)));
  const [members] = await c.db.select({ n: count() }).from(s.users).where(and(eq(s.users.teamId, user.teamId), eq(s.users.status, 'active')));
  const banner = team.settings.maintenanceBanner;
  const bannerActive = banner && (!banner.startsAt || new Date(banner.startsAt) <= clock.now) && (!banner.endsAt || new Date(banner.endsAt) >= clock.now);
  const avatar = await imageUrls(c, user.avatarImageId);
  const logo = await imageUrls(c, team.logoImageId);
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      // Your own avatar renders at 44–72 px (header, settings), so the 256 px main rather than the list thumbnail.
      avatarUrl: avatar.url,
      mustChangePassword: user.mustChangePassword,
      onboarded: !!u?.onboardedAt,
      totpEnabled: user.totpEnabled,
    },
    team: {
      id: team.id,
      name: team.name,
      timezone: team.timezone,
      units: team.units as 'metric' | 'imperial',
      logoUrl: logo.url,
      mealSlots: team.settings.mealSlots,
      thresholds: team.settings.thresholds,
      streaks: team.settings.streaks,
      featureFlags: team.settings.featureFlags,
      maintenanceBanner: bannerActive && banner ? { message: banner.message } : null,
      memberCount: members?.n ?? 0,
    },
    profile: profileToDto(p, user.timezone, clock.today, team.settings.streaks.vacationDaysPerQuarter),
    targets: await targetsDto(c, p, clock.today),
    ai: {
      teamOn,
      features,
      photoAvailable: features['food.photo'] && !p.aiOptOuts.photo,
      summaryAvailable: features['home.summary'] && !p.aiOptOuts.summary,
      noticeRequired: teamOn && !p.aiOptOuts.noticeSeen,
      callsThisMonth: calls?.n ?? 0,
    },
    realtime:
      c.broadcast.enabled && c.env.SUPABASE_URL && c.env.SUPABASE_ANON_KEY
        ? { url: c.env.SUPABASE_URL, anonKey: c.env.SUPABASE_ANON_KEY, teamTopic: teamTopic(team.id, team.realtimeTopicSecret), userTopic: userTopic(user.id, p.realtimeSecret) }
        : null,
    vapidPublicKey: c.env.VAPID_PUBLIC_KEY ?? null,
    today: clock.today,
    localTime: clock.localTime,
    serverTime: clock.now.toISOString(),
    version: c.env.APP_VERSION,
  };
}
