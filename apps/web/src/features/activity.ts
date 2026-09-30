import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import { GymFocus, Intensity, type ActivityLogDto, type ActivityLogUpsert, type ActivityTypeDto, type TodayResponse } from '@clubhouse/contracts';
import { nowIso } from '@/lib/ids';
import { qk } from './keys';

export function useActivityTypes() {
  return useQuery({ queryKey: qk.activityTypes, queryFn: () => api.activityTypes(), staleTime: 60 * 60_000 });
}

export function usePlan() {
  return useQuery({ queryKey: qk.plan, queryFn: () => api.plan.get(), staleTime: 5 * 60_000 });
}

/**
 * The activity log being edited. There is no single-activity endpoint, so look in the cached Today payloads first,
 * then fetch that day's logs.
 */
export function useActivityLogById(id: string | undefined, date: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: [...qk.logsForDate(date), 'activity', id ?? ''],
    enabled: !!id,
    staleTime: 0,
    queryFn: async (): Promise<ActivityLogDto | null> => {
      for (const [, t] of qc.getQueriesData<TodayResponse>({ queryKey: ['today'] })) {
        const hit = t?.activityLogs.find((a) => a.id === id);
        if (hit) return hit;
      }
      const day = await api.logs.forDate(date);
      return day.activityLogs.find((a) => a.id === id) ?? null;
    },
  });
}

export function optimisticActivity(id: string, data: ActivityLogUpsert, type: ActivityTypeDto, kcal: number, met: number | null): ActivityLogDto {
  return {
    id,
    date: data.date,
    loggedAt: data.loggedAt,
    typeId: type.id,
    typeKey: type.key,
    typeName: type.name,
    icon: type.icon,
    durationMin: data.durationMin,
    distanceKm: data.distanceKm ?? null,
    intensity: data.intensity ?? null,
    focus: data.focus ?? null,
    kcalBurned: kcal,
    kcalOverridden: data.kcalOverride != null,
    met,
    planItemId: data.planItemId ?? null,
    note: data.note ?? null,
    addedLate: false,
    clientUpdatedAt: data.clientUpdatedAt,
    deleted: !!data.deleted,
  };
}

/** Upsert body that recreates a saved activity (delete, duplicate, log again). */
export function activityLogToUpsert(a: ActivityLogDto, over: Partial<ActivityLogUpsert> = {}): ActivityLogUpsert {
  return {
    date: a.date,
    loggedAt: a.loggedAt,
    typeId: a.typeId,
    durationMin: a.durationMin,
    distanceKm: a.distanceKm,
    intensity: Intensity.safeParse(a.intensity).data ?? null,
    focus: GymFocus.safeParse(a.focus).data ?? null,
    kcalOverride: a.kcalOverridden ? a.kcalBurned : null,
    planItemId: a.planItemId,
    note: a.note,
    clientUpdatedAt: nowIso(),
    ...over,
  };
}

export const INTENSITY_OPTIONS = [
  { value: 'light' as const, label: 'Easy' },
  { value: 'moderate' as const, label: 'Moderate' },
  { value: 'hard' as const, label: 'Hard' },
];
export const FOCUS_OPTIONS = [
  { value: 'strength' as const, label: 'Strength' },
  { value: 'cardio' as const, label: 'Cardio' },
  { value: 'mixed' as const, label: 'Mixed' },
];
