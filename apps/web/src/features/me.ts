import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@clubhouse/client';
import type { MeResponse } from '@clubhouse/contracts';
import { applyTheme, watchSystemTheme } from '@/infrastructure/theme';
import { qk } from './keys';

export type Me = MeResponse & { mfaPending: boolean };

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api.me(), staleTime: 60_000, retry: false });
}

/** The loaded /me, for components rendered inside the authenticated shell. */
export function useMeData(): Me {
  const { data } = useMe();
  if (!data) throw new Error('useMeData used outside the authenticated shell');
  return data;
}

export function useThemeSync() {
  const { data } = useMe();
  const prefs = data?.profile.appPrefs;
  useEffect(() => {
    if (!prefs) return;
    applyTheme(prefs);
    return watchSystemTheme(() => prefs);
  }, [prefs]);
}

export function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.me });
}
