import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import type { OnboardingRequest, PreferencesUpdateRequest } from '@clubhouse/contracts';
import { qk } from './keys';
import type { Me } from './me';

export function deviceTimezone(fallback = 'Asia/Kolkata'): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

/** IANA zones for the timezone picker; falls back to a short list on older browsers. */
export function timezoneList(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    const list = intl.supportedValuesOf?.('timeZone');
    if (list?.length) return list;
  } catch {
    /* unsupported */
  }
  return ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
}

export function useSubmitOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OnboardingRequest) => api.profile.onboarding(input),
    onSuccess: (r) => {
      qc.setQueryData<Me>(qk.me, (m) => (m ? { ...m, targets: r.targets ?? m.targets } : m));
    },
  });
}

/** Partial preference update (AI opt-outs, privacy, …); keeps the cached /me in step. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PreferencesUpdateRequest) => api.profile.updatePreferences(input),
    onSuccess: (r) => {
      qc.setQueryData<Me>(qk.me, (m) => (m ? { ...m, profile: r.profile, targets: r.targets ?? m.targets } : m));
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
