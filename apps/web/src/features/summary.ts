import { useQuery } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import { localDateOf, localTimeOf } from '@clubhouse/domain';
import type { Me } from './me';
import { qk } from './keys';

/** The member's own calendar date and wall-clock time right now (their profile timezone, else the team's). */
export function memberNow(me: Pick<Me, 'profile' | 'team' | 'today' | 'localTime'>, at = new Date()): { date: string; time: string } {
  const tz = me.profile.timezone || me.team.timezone;
  try {
    return { date: localDateOf(at, tz), time: localTimeOf(at, tz) };
  } catch {
    return { date: me.today, time: me.localTime };
  }
}

/**
 * APP-HOME AI daily summary. The server returns the cached text or regenerates it when stale, so this is fetched
 * lazily only when the member can actually get an AI summary (team AI on, feature on, not opted out).
 */
export function useAiSummary(date: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.summary(date),
    queryFn: () => api.ai.summary(date),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
