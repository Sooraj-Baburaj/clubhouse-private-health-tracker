import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type { NotificationDefaultsUpdate } from '@clubhouse/contracts';
import type { z } from 'zod';
import { qk } from './keys';
import { useAction } from './mutations';

/** Team notification defaults, reminder copy pool and push health. */

export type NotifDefaultsResponse = Awaited<ReturnType<typeof adminApi.notifications.defaults>>;

export function useNotifDefaults() {
  return useQuery({ queryKey: qk.notifDefaults, queryFn: adminApi.notifications.defaults });
}

export function useUpdateNotifDefaults(success: string) {
  return useAction(
    (body: z.input<typeof NotificationDefaultsUpdate>) =>
      adminApi.notifications.updateDefaults(body),
    {
      success,
      invalidate: [qk.notifDefaults, qk.settings],
    },
  );
}

export function usePushHealth() {
  return useQuery({ queryKey: qk.pushHealth, queryFn: adminApi.notifications.pushHealth });
}

export function useTestToMe() {
  return useAction(() => adminApi.notifications.testToMe(), {
    success: false,
    invalidate: [qk.pushHealth],
  });
}
