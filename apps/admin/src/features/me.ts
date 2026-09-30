import { useQuery } from '@tanstack/react-query';
import { api } from '@clubhouse/client';

/** Signed-in user + team (from GET /api/me). Shared by the shell, pages and the reauth dialog. */
export function useMeAdmin() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.me(), retry: false, staleTime: 60_000 });
}

/** Role helpers. Super-admin-only controls are hidden for admins (403s are still handled). */
export function useRole() {
  const me = useMeAdmin();
  const role = me.data?.user.role ?? 'member';
  return { role, isSuper: role === 'super_admin', isAdmin: role === 'admin' || role === 'super_admin', me: me.data, userId: me.data?.user.id ?? null };
}
