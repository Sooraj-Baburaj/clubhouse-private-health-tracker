import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import { qk } from './keys';
import { useAction } from './mutations';

export function useAdminSessions() {
  return useQuery({ queryKey: qk.sessions, queryFn: adminApi.sessions.list });
}
export function useRevokeSession() {
  return useAction((id: string) => adminApi.sessions.revoke(id), { success: 'Session revoked', invalidate: [qk.sessions] });
}

export function useJobRuns() {
  return useQuery({ queryKey: qk.jobs, queryFn: adminApi.jobs.runs, refetchInterval: 30_000 });
}
export function useRunJobStep() {
  return useAction((step: string) => adminApi.jobs.run(step), {
    success: (r, step) => (r.ok ? `${step} finished` : `${step} ran with problems`),
    invalidate: [qk.jobs, qk.dashboard],
  });
}
