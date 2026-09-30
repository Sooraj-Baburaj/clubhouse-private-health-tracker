import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@clubhouse/client';
import type { MomentumResponse, VacationRequest } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { qk } from './keys';

export function useMomentum() {
  return useQuery({ queryKey: qk.momentum, queryFn: () => api.momentum(), staleTime: 60_000 });
}

/** Mark new badges seen once they have been shown (the pop plays from the unseen flag on first view). */
export function useMarkBadgesSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.badgesSeen(),
    onSuccess: () => {
      setTimeout(() => qc.setQueryData<MomentumResponse>(qk.momentum, (m) => (m ? { ...m, badges: m.badges.map((b) => ({ ...b, seen: true })) } : m)), 2000);
    },
  });
}

function useRefreshAfterVacation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.momentum });
    void qc.invalidateQueries({ queryKey: qk.me });
    void qc.invalidateQueries({ queryKey: ['today'] });
  };
}

export function useSetVacation() {
  const refresh = useRefreshAfterVacation();
  return useMutation({
    mutationFn: (input: VacationRequest) => api.profile.setVacation(input),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Couldn’t set your break.'),
  });
}

export function useEndVacation() {
  const refresh = useRefreshAfterVacation();
  return useMutation({
    mutationFn: () => api.profile.endVacation(),
    onSuccess: () => {
      refresh();
      toast.success('Welcome back. Your streak picks up from here.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Couldn’t end your break.'),
  });
}
