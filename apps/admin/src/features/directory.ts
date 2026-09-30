import { useQuery } from '@tanstack/react-query';
import { adminApi, api } from '@clubhouse/client';
import { qk } from './keys';

/** Shared look-ups used by many pages (one cache entry each). */

export function useMembers() {
  return useQuery({ queryKey: qk.members, queryFn: adminApi.members.list });
}

export function useActivityTypes() {
  return useQuery({ queryKey: qk.activityTypes, queryFn: api.activityTypes, staleTime: 10 * 60_000 });
}

export function useTeamSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: adminApi.settings.get });
}
