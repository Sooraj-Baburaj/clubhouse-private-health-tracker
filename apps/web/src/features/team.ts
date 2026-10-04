import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@clubhouse/client';
import type { TeamSummaryResponse } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { qk } from './keys';
import type { Me } from './me';

export function useTeamSummary(date?: string) {
  return useQuery({ queryKey: qk.team(date), queryFn: () => api.team.summary(date), staleTime: 60_000, refetchInterval: 5 * 60_000 });
}

export function useMemberDay(memberId: string, date?: string) {
  return useQuery({ queryKey: qk.memberDay(memberId, date), queryFn: () => api.team.memberDay(memberId, date), enabled: !!memberId, staleTime: 60_000 });
}

/** "Join team pulse" (opt-in, off by default). */
export function useTeamPulseOptIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => api.profile.updatePreferences({ privacy: { teamPulseOptIn: on } }),
    onMutate: async (on) => {
      const prev = qc.getQueryData<TeamSummaryResponse>(qk.team());
      if (prev) qc.setQueryData<TeamSummaryResponse>(qk.team(), { ...prev, myPulseOptIn: on });
      const me = qc.getQueryData<Me>(qk.me);
      if (me) qc.setQueryData<Me>(qk.me, { ...me, profile: { ...me.profile, privacy: { ...me.profile.privacy, teamPulseOptIn: on } } });
      return { prev, me };
    },
    onError: (err, _on, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.team(), ctx.prev);
      if (ctx?.me) qc.setQueryData(qk.me, ctx.me);
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t change that.');
    },
    onSuccess: (_r, on) => toast.show(on ? 'You’re in the team pulse' : 'You left the team pulse'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['team'] });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/** A teammate's profile (or your own): streaks, records, badges, the board and habits. */
export function useMemberProfile(memberId: string) {
  return useQuery({ queryKey: qk.memberProfile(memberId), queryFn: () => api.team.memberProfile(memberId), enabled: !!memberId, staleTime: 60_000 });
}
