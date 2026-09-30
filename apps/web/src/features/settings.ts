import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { api, ApiError } from '@clubhouse/client';
import type { GoalUpdateRequest, PreferencesUpdateRequest, ProfileDto, ProfileUpdateRequest, TargetsDto } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { db } from '@/infrastructure/idb';
import { compressImage } from '@/infrastructure/images';
import { persister, queryClient } from '@/infrastructure/queryClient';
import { live } from '@/infrastructure/realtime';
import { applyTheme } from '@/infrastructure/theme';
import { qk } from './keys';
import type { Me } from './me';

export const errorText = (e: unknown, fallback = 'Something went wrong. Try again?') => (e instanceof ApiError ? e.message : fallback);

function setMeProfile(profile: ProfileDto, targets: TargetsDto | null | undefined) {
  const me = queryClient.getQueryData<Me>(qk.me);
  if (me) queryClient.setQueryData<Me>(qk.me, { ...me, profile, targets: targets === undefined ? me.targets : targets });
}

/** Optimistic local view of a preferences patch on the cached profile. */
function applyPrefsLocally(p: ProfileDto, b: PreferencesUpdateRequest): ProfileDto {
  const next: ProfileDto = { ...p };
  if (b.dietPrefs) next.dietPrefs = b.dietPrefs;
  if (b.privacy) next.privacy = { ...p.privacy, ...b.privacy };
  if (b.aiOptOuts) next.aiOptOuts = { ...p.aiOptOuts, ...b.aiOptOuts };
  if (b.momentumPrefs) next.momentumPrefs = b.momentumPrefs;
  if (b.appPrefs) next.appPrefs = { ...p.appPrefs, ...b.appPrefs };
  if (b.quietHours !== undefined) next.quietHours = b.quietHours;
  if (b.notificationsMaster !== undefined) next.notificationsMaster = b.notificationsMaster;
  if (b.eatBackExercise !== undefined) next.eatBackExercise = b.eatBackExercise;
  return next;
}

/** PATCH /profile/preferences with an optimistic update of the cached /me. */
export function useUpdatePreferences(opts: { quiet?: boolean } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: PreferencesUpdateRequest) => api.profile.updatePreferences(b),
    onMutate: async (b) => {
      await qc.cancelQueries({ queryKey: qk.me });
      const prev = qc.getQueryData<Me>(qk.me);
      if (prev) {
        const profile = applyPrefsLocally(prev.profile, b);
        qc.setQueryData<Me>(qk.me, { ...prev, profile });
        if (b.appPrefs) applyTheme(profile.appPrefs);
      }
      return { prev };
    },
    onError: (err, _b, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(qk.me, ctx.prev);
        applyTheme(ctx.prev.profile.appPrefs);
      }
      toast.error(errorText(err, 'Couldn’t save that setting.'));
    },
    onSuccess: (r) => {
      setMeProfile(r.profile, r.targets);
      if (!opts.quiet) toast.show('Saved');
    },
    onSettled: (_r, _e, b) => {
      if (b.privacy) void qc.invalidateQueries({ queryKey: ['team'] });
      if (b.chatMute) void qc.invalidateQueries({ queryKey: qk.chat });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ProfileUpdateRequest) => api.profile.update(b),
    onSuccess: (r) => {
      setMeProfile(r.profile, r.targets);
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: ['today'] });
      void qc.invalidateQueries({ queryKey: ['diet'] });
      toast.show('Profile saved');
    },
    onError: (err) => toast.error(errorText(err, 'Couldn’t save your profile.')),
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: GoalUpdateRequest) => api.profile.updateGoal(b),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: ['today'] });
      void qc.invalidateQueries({ queryKey: ['diet'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      toast.show('Goal saved · targets updated');
    },
    onError: (err) => toast.error(errorText(err, 'Couldn’t save your goal.')),
  });
}

/** Live preview of targets for a profile/goal change before saving. */
export function useTargetsPreview(input: Record<string, unknown> | null) {
  return useQuery({
    queryKey: ['targets-preview', JSON.stringify(input)],
    queryFn: () => api.profile.previewTargets(input ?? {}),
    enabled: !!input,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Avatar upload: compress on the device, upload, then attach to the profile. */
export function useAvatarUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const c = await compressImage(file);
      const form = new FormData();
      form.append('file', c.blob, c.blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg');
      form.append('kind', 'avatar');
      const up = await api.media.upload(form);
      URL.revokeObjectURL(c.previewUrl);
      return api.profile.update({ avatarImageId: up.id });
    },
    onSuccess: (r) => {
      setMeProfile(r.profile, r.targets);
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.chatMembers });
      toast.show('New photo saved');
    },
    onError: (err) => toast.error(errorText(err, 'Couldn’t upload that photo.')),
  });
}

export function useSessions() {
  return useQuery({ queryKey: qk.sessions, queryFn: () => api.auth.sessions(), staleTime: 30_000 });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.auth.revokeSession(id),
    onSuccess: () => toast.show('Signed out on that device'),
    onError: (err) => toast.error(errorText(err)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sessions }),
  });
}

async function clearSession() {
  live.stop();
  queryClient.clear();
  await persister.removeClient();
}

/** Log out (this device or everywhere), wipe cached data and go to sign-in. */
export function useLogout() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (all: boolean) => {
      try {
        await (all ? api.auth.logoutAll() : api.auth.logout());
      } catch (e) {
        if (all) throw e;
      }
    },
    onSuccess: async () => {
      await navigate({ to: '/login' });
      await clearSession();
    },
    onError: (err) => toast.error(errorText(err, 'Couldn’t sign out everywhere. Try again?')),
  });
}

/** Settings › App: clear the query cache and IndexedDB key-value data but keep the offline outbox, then reload. */
export async function clearLocalCache() {
  queryClient.clear();
  await persister.removeClient();
  const d = await db();
  await d.clear('kv');
  await d.clear('shared');
  window.location.reload();
}
