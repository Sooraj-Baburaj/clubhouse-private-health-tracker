import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type { ChangePasswordRequest, LoginRequest } from '@clubhouse/contracts';
import { live } from '@/infrastructure/realtime';
import { qk } from './keys';
import type { Me } from './me';

export type AuthDestination = '/change-password' | '/verify' | '/onboarding' | '/';

/** Where a signed-in person goes next (APP-NAV-01..05). */
export function destinationFor(me: Me): AuthDestination {
  if (me.user.mustChangePassword) return '/change-password';
  if (me.mfaPending) return '/verify';
  if (!me.user.onboarded) return '/onboarding';
  return '/';
}

function useRefetchMe() {
  const qc = useQueryClient();
  return async () => {
    await qc.cancelQueries({ queryKey: qk.me });
    return qc.fetchQuery({ queryKey: qk.me, queryFn: () => api.me(), staleTime: 0 });
  };
}

export function useLogin() {
  const qc = useQueryClient();
  const refetchMe = useRefetchMe();
  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      await api.auth.login(input);
      // A different person may have used this phone before: never show their cached data.
      qc.clear();
      live.stop();
      const me = await refetchMe();
      return destinationFor(me);
    },
  });
}

export function useChangePassword() {
  const refetchMe = useRefetchMe();
  return useMutation({
    mutationFn: async (input: ChangePasswordRequest) => {
      await api.auth.changePassword(input);
      return destinationFor(await refetchMe());
    },
  });
}

export function useVerifyTotp() {
  const refetchMe = useRefetchMe();
  return useMutation({
    mutationFn: async (code: string) => {
      await api.auth.verifyTotp(code);
      return destinationFor(await refetchMe());
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout().catch(() => undefined),
    onSettled: () => {
      qc.clear();
      live.stop();
    },
  });
}

/** Friendly copy for sign-in errors (lockout minutes, deactivated, expired temp password). */
export function authErrorMessage(err: unknown): string {
  if (err instanceof NetworkError) return 'Couldn’t reach the server. Check your connection and try again.';
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const mins = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : null;
      return mins ? `Too many tries. Take a breather and try again in ${mins} minute${mins === 1 ? '' : 's'}.` : err.message;
    }
    if (err.code === 'deactivated') return 'This account is switched off. Ask your admin to turn it back on.';
    if (err.code === 'temp_password_expired') return 'Your temporary password has expired. Ask your admin for a fresh one.';
    if (err.code === 'invalid_credentials') return 'That username and password don’t match. Check them and try again.';
    return err.message;
  }
  return 'Something went sideways. Try again in a moment.';
}
