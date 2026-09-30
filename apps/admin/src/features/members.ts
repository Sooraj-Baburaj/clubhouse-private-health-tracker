import { useQuery } from '@tanstack/react-query';
import { adminApi, ApiError } from '@clubhouse/client';
import type { CreateMemberRequest, RoleChangeRequest, UpdateMemberRequest } from '@clubhouse/contracts';
import type { z } from 'zod';
import { qk } from './keys';
import { useAction } from './mutations';

/**
 * Members data + mutations. `qk.members` is a prefix of `qk.member(id)`, so invalidating the list
 * also refreshes any open member detail.
 */

export function useMember(id: string | null | undefined) {
  return useQuery({ queryKey: qk.member(id ?? ''), queryFn: () => adminApi.members.get(id!), enabled: !!id, retry: (n, e) => n < 2 && !(e instanceof ApiError && (e.status === 404 || e.status === 403)) });
}

export function useCreateMember() {
  return useAction((b: z.input<typeof CreateMemberRequest>) => adminApi.members.create(b), { success: (r) => `${r.member.person.name} added`, invalidate: [qk.members, qk.dashboard] });
}

export function useUpdateMember() {
  return useAction(({ id, body }: { id: string; body: z.input<typeof UpdateMemberRequest> }) => adminApi.members.update(id, body), { invalidate: [qk.members, qk.goals, qk.dashboard] });
}

export function useChangeRole() {
  return useAction(({ id, body }: { id: string; body: z.input<typeof RoleChangeRequest> }) => adminApi.members.role(id, body), { invalidate: [qk.members, qk.sessions] });
}

export function useResetPassword() {
  return useAction((id: string) => adminApi.members.resetPassword(id), { success: 'Temporary password created', invalidate: [qk.members, qk.dashboard] });
}

export function useDeactivateMember() {
  return useAction(({ id, reason }: { id: string; reason?: string }) => adminApi.members.deactivate(id, reason), { success: (r) => `${r.person.name} deactivated`, invalidate: [qk.members, qk.dashboard, qk.goals, qk.sessions] });
}

export function useReactivateMember() {
  return useAction((id: string) => adminApi.members.reactivate(id), { success: (r) => `${r.person.name} reactivated`, invalidate: [qk.members, qk.dashboard, qk.goals] });
}

export function useRevokeMemberSessions() {
  return useAction((id: string) => adminApi.members.revokeSessions(id), { success: (r) => (r.revoked === 1 ? '1 session revoked' : `${r.revoked} sessions revoked`), invalidate: [qk.members, qk.sessions] });
}

export function useDeleteMemberData() {
  return useAction(({ id, confirm, reason }: { id: string; confirm: string; reason: string }) => adminApi.members.deleteData(id, { confirm, reason }), { success: 'Member data deleted', invalidate: [qk.members, qk.dashboard, qk.goals] });
}

export function useResetTotp() {
  return useAction(({ id, reason }: { id: string; reason: string }) => adminApi.members.resetTotp(id, reason), { success: 'Two-step sign-in reset', invalidate: [qk.members] });
}

export function useSetVacation() {
  return useAction(({ id, from, to }: { id: string; from: string; to: string }) => adminApi.members.setVacation(id, { from, to }), { success: 'Vacation saved', invalidate: [qk.members] });
}

/** Import never toasts errors itself: the modal shows them inline next to the rows. */
export function useImportMembers() {
  return useAction((b: { csv: string; dryRun: boolean }) => adminApi.members.import(b), { errorToast: false, invalidate: [qk.members, qk.dashboard] });
}
