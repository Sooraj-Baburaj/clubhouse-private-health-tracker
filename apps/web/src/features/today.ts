import { useQuery } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import { qk } from './keys';

export function useToday(date?: string) {
  return useQuery({ queryKey: qk.today(date), queryFn: () => api.today(date), staleTime: 15_000, refetchInterval: 5 * 60_000 });
}
