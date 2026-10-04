import { useQuery } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import type { BoardDayState, LogSideEffects } from '@clubhouse/contracts';
import { qk } from './keys';

/** The crew leaderboard for this week (or a past one). Realtime "pulse" hints refetch it (AppShell). */
export function useBoard(week?: string, enabled = true) {
  return useQuery({ queryKey: qk.board(week), queryFn: () => api.team.board(week), staleTime: 30_000, refetchInterval: 5 * 60_000, enabled });
}

export function useMemberPoints(memberId: string | null, week?: string) {
  return useQuery({ queryKey: qk.memberPoints(memberId ?? '', week), queryFn: () => api.team.memberPoints(memberId!, week), enabled: !!memberId, staleTime: 30_000 });
}

/** "· +10 pts" after a save, when the leaderboard is on and the save earned points this week. */
export function pointsSuffix(effects: LogSideEffects | null | undefined): string {
  const p = effects?.points;
  return p && p.gained > 0 ? ` · +${p.gained} pts` : '';
}

/** Day dot legend order and wording (design: ● full day ◐ partial ○ nothing logged 🏖 away ◎ today). */
export const DAY_STATE_LABEL: Record<BoardDayState, string> = {
  full: 'solid day',
  partial: 'partial',
  none: 'nothing logged',
  away: 'away',
  today: 'today, still open',
  future: 'still to come',
};
