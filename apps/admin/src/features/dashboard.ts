import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import { qk } from './keys';

export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: adminApi.dashboard, refetchInterval: 60_000 });
}
