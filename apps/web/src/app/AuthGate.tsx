import { useNavigate } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { ApiError } from '@clubhouse/client';
import { setUnauthorizedHandler } from '@/infrastructure/api';
import { queryClient } from '@/infrastructure/queryClient';
import { resyncPush } from '@/infrastructure/push';
import { live } from '@/infrastructure/realtime';
import { useMe } from '@/features/me';
import { Splash } from './Splash';

/** Sends people to sign-in, the forced password change, the TOTP step or onboarding before the app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const me = useMe();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      live.stop();
      void navigate({ to: '/login' });
    });
  }, [navigate]);
  const status = me.error instanceof ApiError ? me.error.status : null;
  useEffect(() => {
    if (status === 401) void navigate({ to: '/login' });
    else if (status === 403 && (me.error as ApiError).code === 'password_change_required') void navigate({ to: '/change-password' });
  }, [status, me.error, navigate]);
  useEffect(() => {
    const d = me.data;
    if (!d) return;
    if (d.mfaPending) void navigate({ to: '/verify' });
    else if (d.user.mustChangePassword) void navigate({ to: '/change-password' });
    else if (!d.user.onboarded) void navigate({ to: '/onboarding', search: {} });
  }, [me.data, navigate]);
  useEffect(() => {
    if (me.data?.realtime) void live.start(me.data.realtime);
    if (me.data) void resyncPush();
  }, [me.data]);
  if (!me.data || me.data.mfaPending || me.data.user.mustChangePassword || !me.data.user.onboarded) return <Splash offline={!!me.error && status == null} />;
  return <>{children}</>;
}
