import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@clubhouse/client';
import type { HabitCheckinDto, HabitDayItem, HabitDayResponse, HabitDetailResponse, HabitPrefUpdate } from '@clubhouse/contracts';
import { isHabitComplete } from '@clubhouse/domain';
import { haptic, toast } from '@clubhouse/ui';
import { outbox } from '@/infrastructure/outbox';
import { nowIso } from '@/lib/ids';
import { qk } from './keys';
import { saveWithFallback } from './logs';

/** Habits checklist for a day (`undefined` = today; the today snapshot is persisted for offline reads). */
export function useHabitDay(date?: string) {
  return useQuery({ queryKey: qk.habits(date), queryFn: () => api.habits.day(date), staleTime: 15_000 });
}

export function useHabitWeek(enabled = true) {
  return useQuery({ queryKey: qk.habitWeek, queryFn: () => api.habits.week(), staleTime: 60_000, enabled });
}

export function useHabitDetail(id: string) {
  return useQuery({ queryKey: qk.habit(id), queryFn: () => api.habits.get(id), staleTime: 30_000 });
}

function withValue(day: HabitDayResponse, habitId: string, value: number, checkinId: string): HabitDayResponse {
  const items = day.items.map((i): HabitDayItem => {
    if (i.id !== habitId) return i;
    const done = isHabitComplete(i.kind, value, i.target);
    const week = i.week ? { ...i.week, done: Math.max(0, i.week.done + Number(done) - Number(i.done)) } : null;
    return { ...i, value, done, checkinId, week };
  });
  return { ...day, items, done: items.filter((i) => i.done).length };
}

/**
 * Tick a habit: the cached list updates at once, the save goes to the API, and on a network failure it waits in the
 * outbox (last write wins on the server, so a replay is harmless). Rapid taps only refetch once the last one settles.
 */
export function useTickHabit(date?: string) {
  const qc = useQueryClient();
  const key = qk.habits(date);
  return useMutation({
    mutationKey: ['habit-tick'],
    /** `id` is the item's check-in id, or a fresh one for the first tick of the day (reused by later taps). */
    mutationFn: ({ item, value, day, id }: { item: HabitDayItem; value: number; day: string; id: string }) => {
      const data = { habitId: item.id, date: day, value, clientUpdatedAt: nowIso() };
      return saveWithFallback<HabitCheckinDto>(
        () => api.habits.checkin(id, data),
        () => outbox.enqueue({ kind: 'habit_checkin', id, data }),
      );
    },
    onMutate: async ({ item, value, id }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<HabitDayResponse>(key);
      if (prev) qc.setQueryData<HabitDayResponse>(key, withValue(prev, item.id, value, id));
      haptic(isHabitComplete(item.kind, value, item.target) ? [10, 40, 10] : 8);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that tick.');
    },
    onSuccess: (r) => {
      if (r.queued) toast.show('Saved on your phone. It will sync when you’re back online.');
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey: ['habit-tick'] }) <= 1) void qc.invalidateQueries({ queryKey: ['habits'] });
    },
  });
}

export function useHabitPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: HabitPrefUpdate }) => api.habits.prefs(id, patch),
    onMutate: async ({ id, patch }) => {
      const key = qk.habit(id);
      const prev = qc.getQueryData<HabitDetailResponse>(key);
      if (prev && (patch.reminderTime !== undefined || patch.reminderOff !== undefined)) {
        const off = patch.reminderOff ?? prev.habit.reminderOff;
        const time = patch.reminderTime !== undefined ? (patch.reminderTime ?? prev.habit.defaultReminderTime) : prev.habit.reminderTime;
        qc.setQueryData<HabitDetailResponse>(key, { ...prev, habit: { ...prev.habit, reminderOff: off, reminderTime: off ? null : time } });
      }
      return { prev, key };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that.');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['habits'] }),
  });
}
