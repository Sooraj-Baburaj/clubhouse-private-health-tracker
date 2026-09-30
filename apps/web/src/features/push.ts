import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@clubhouse/client';
import { toast } from '@clubhouse/ui';
import { currentEndpoint, enablePush, pushState, type PushState } from '@/infrastructure/push';
import { qk } from './keys';
import { errorText } from './settings';

/** Current push permission state; re-read when the app comes back to the foreground. */
export function usePushState(): [PushState, () => void] {
  const [state, setState] = useState<PushState>(() => pushState());
  const refresh = useCallback(() => setState(pushState()), []);
  useEffect(() => {
    const h = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [refresh]);
  return [state, refresh];
}

/** Turn push on. Must run inside a user gesture (iOS). */
export function useEnablePush(onDone?: (s: PushState) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vapidPublicKey: string | null) => enablePush(vapidPublicKey),
    onSuccess: (s) => {
      onDone?.(s);
      if (s === 'granted') toast.success('Push is on for this device');
      else if (s === 'denied') toast.show('Notifications are blocked in this browser');
      void qc.invalidateQueries({ queryKey: qk.devices });
    },
    onError: (err) => toast.error(errorText(err, 'Couldn’t turn on push here.')),
  });
}

export function useEndpoint() {
  return useQuery({ queryKey: ['push-endpoint'], queryFn: () => currentEndpoint(), staleTime: Infinity, networkMode: 'always' });
}

export function useDevices() {
  const ep = useEndpoint();
  return useQuery({ queryKey: [...qk.devices, ep.data ?? ''], queryFn: () => api.push.devices(ep.data ?? undefined), enabled: ep.isFetched, staleTime: 30_000 });
}

export function useRemoveDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.push.removeDevice(id),
    onSuccess: () => toast.show('Device removed'),
    onError: (err) => toast.error(errorText(err)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.devices }),
  });
}

export function useTestPush() {
  return useMutation({
    mutationFn: () => api.push.test(),
    onSuccess: (r) => (r.devices === 0 ? toast.show('No devices with push yet — turn it on first') : toast.success(`Test sent to ${r.delivered} of ${r.devices} device${r.devices === 1 ? '' : 's'}`)),
    onError: (err) => toast.error(errorText(err, 'Couldn’t send a test.')),
  });
}
