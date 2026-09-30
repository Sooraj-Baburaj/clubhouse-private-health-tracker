import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import type { MyPlanResponse, SetPlanDaysRequest } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { qk } from './keys';
import { errorText } from './settings';

export function usePlan() {
  return useQuery({ queryKey: qk.plan, queryFn: () => api.plan.get(), staleTime: 60_000 });
}

export function useSetPlanDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: SetPlanDaysRequest) => api.plan.setDays(b),
    onSuccess: (r) => {
      qc.setQueryData<MyPlanResponse>(qk.plan, r);
      toast.show('Days saved');
      void qc.invalidateQueries({ queryKey: ['today'] });
    },
    onError: (err) => toast.error(errorText(err, 'Couldn’t save those days.')),
  });
}

export function useProposePlanChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.plan.propose(text),
    onSuccess: () => toast.success('Sent to your admin'),
    onError: (err) => toast.error(errorText(err, 'Couldn’t send that.')),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.plan }),
  });
}

export function useRestWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ weekStart, reason }: { weekStart: string; reason?: string }) => api.plan.restWeek(weekStart, reason),
    onSuccess: () => toast.success('Rest week requested'),
    onError: (err) => toast.error(errorText(err, 'Couldn’t request that.')),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.plan }),
  });
}
