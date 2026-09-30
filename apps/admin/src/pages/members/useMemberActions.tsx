import type { AdminMemberRow } from '@clubhouse/contracts';
import { useDeactivateMember, useReactivateMember, useResetPassword, useRevokeMemberSessions } from '@/features/members';
import { plural } from '@/lib/format';
import { confirmAction } from '@/ui';

type MemberLike = Pick<AdminMemberRow, 'id' | 'person' | 'username'>;

/** Confirmed member actions shared by the list drawer and the detail page. */
export function useMemberActions() {
  const reset = useResetPassword();
  const deactivateM = useDeactivateMember();
  const reactivateM = useReactivateMember();
  const revoke = useRevokeMemberSessions();

  /** Resolves to the new temporary password (shown once), or null if cancelled. */
  const resetPassword = async (m: MemberLike): Promise<string | null> => {
    let pw: string | null = null;
    const r = await confirmAction({
      title: `Reset ${m.person.name}’s password?`,
      tone: 'default',
      body: 'Their current password stops working straight away. You’ll get a temporary password to share with them privately.',
      impact: ['Current password stops working', 'New temporary password, shown once', 'Must be changed on first sign-in · expires in 7 days'],
      confirmLabel: 'Reset password',
      onConfirm: async () => {
        pw = (await reset.mutateAsync(m.id)).tempPassword;
      },
    });
    return r === null ? null : pw;
  };

  const deactivate = async (m: MemberLike): Promise<boolean> => {
    const r = await confirmAction({
      title: `Deactivate ${m.person.name}?`,
      body: 'They can’t sign in until you reactivate them. Nothing is deleted.',
      impact: ['Signed out on every device', 'Hidden from the team, chat and leaderboards', 'Logs, plans and history are kept'],
      confirmLabel: 'Deactivate',
      requireReason: true,
      reasonPlaceholder: 'e.g. Left the team',
      onConfirm: (reason) => deactivateM.mutateAsync({ id: m.id, reason }),
    });
    return r !== null;
  };

  const reactivate = async (m: MemberLike): Promise<boolean> => {
    const r = await confirmAction({
      title: `Reactivate ${m.person.name}?`,
      tone: 'default',
      body: 'They can sign in again with their existing password and reappear for the team. Their history is right where they left it.',
      confirmLabel: 'Reactivate',
      onConfirm: () => reactivateM.mutateAsync(m.id),
    });
    return r !== null;
  };

  const revokeSessions = async (m: MemberLike, count: number | null): Promise<boolean> => {
    const r = await confirmAction({
      title: `Sign ${m.person.name} out everywhere?`,
      body: 'Every device they’re signed in on is signed out. Their account and password are unchanged.',
      impact: [count == null ? 'All active sessions' : count === 0 ? 'No active sessions right now' : plural(count, 'active session')],
      confirmLabel: 'Revoke all sessions',
      onConfirm: () => revoke.mutateAsync(m.id),
    });
    return r !== null;
  };

  return { resetPassword, deactivate, reactivate, revokeSessions };
}
