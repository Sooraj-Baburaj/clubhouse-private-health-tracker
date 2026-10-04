import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, api } from '@clubhouse/client';
import type { TeamSettingsUpdate } from '@clubhouse/contracts';
import { qk } from './keys';
import { useAction } from './mutations';

export { useTeamSettings } from './directory';

/** GET /admin/settings response (team basics + the settings document). */
export type TeamSettingsData = Awaited<ReturnType<typeof adminApi.settings.get>>;

/**
 * PATCH /admin/settings with only the changed sections. The fresh response replaces the cache so the
 * form re-bases on what the server stored; `['me']` is invalidated because members read team config from /api/me.
 */
export function useSaveTeamSettings(onSaved?: (data: TeamSettingsData) => void) {
  const qc = useQueryClient();
  return useAction((body: TeamSettingsUpdate) => adminApi.settings.update(body), {
    success: 'Team settings saved',
    // The Overview shows the leaderboard card only while it's switched on.
    invalidate: [qk.settings, ['me'], qk.dashboard],
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      onSaved?.(data);
    },
  });
}

/** Upload a team logo (kind "logo"); the returned id is sent as `logoImageId` on save. */
export function useUploadLogo() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'logo');
      return api.media.upload(form);
    },
  });
}
