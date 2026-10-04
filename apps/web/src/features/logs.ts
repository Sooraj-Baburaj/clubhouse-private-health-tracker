import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type { ActivityLogDto, ActivityLogUpsert, FoodLogDto, FoodLogUpsert, LogSideEffects, TodayResponse, UpsertResult, WeightEntryDto, WeightUpsert } from '@clubhouse/contracts';
import { haptic, toast } from '@clubhouse/ui';
import { outbox } from '@/infrastructure/outbox';
import { qk } from './keys';

export interface SaveOutcome<T> {
  entity: T | null;
  queued: boolean;
  effects: LogSideEffects | null;
}

function addTotals(t: TodayResponse, log: { totals: { kcal: number; protein: number; carbs: number; fat: number; fibre: number } }, sign = 1): TodayResponse {
  const eaten = { ...t.eaten };
  for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fibre'] as const) eaten[k] = Math.max(0, eaten[k] + sign * log.totals[k]);
  return { ...t, eaten, remainingKcal: t.budgetKcal - eaten.kcal };
}

/**
 * Save through the API when online (so effects like meme moments come back immediately); on a network failure queue
 * it in the outbox and apply an optimistic update so the member keeps going offline (NFR-REL-03).
 */
export async function saveWithFallback<T>(direct: () => Promise<UpsertResult<T>>, queue: () => Promise<void>): Promise<SaveOutcome<T>> {
  try {
    const r = await direct();
    return { entity: r.entity, queued: false, effects: r.effects };
  } catch (e) {
    if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
      await queue();
      return { entity: null, queued: true, effects: null };
    }
    throw e;
  }
}

export function useSaveFoodLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: FoodLogUpsert; optimistic?: FoodLogDto }) =>
      saveWithFallback<FoodLogDto>(
        () => api.logs.upsertFood(id, data),
        () => outbox.enqueue({ kind: 'food_log', id, data }),
      ),
    onMutate: async ({ data, optimistic }) => {
      if (!optimistic) return;
      const key = qk.today(undefined);
      await qc.cancelQueries({ queryKey: ['today'] });
      const prev = qc.getQueryData<TodayResponse>(key);
      if (prev && prev.date === data.date) {
        const others = prev.foodLogs.filter((f) => f.id !== optimistic.id);
        const old = prev.foodLogs.find((f) => f.id === optimistic.id);
        let next = old ? addTotals(prev, old, -1) : prev;
        next = data.deleted ? next : addTotals(next, optimistic);
        qc.setQueryData<TodayResponse>(key, { ...next, foodLogs: data.deleted ? others : [optimistic, ...others], slots: next.slots.map((s) => (s.slot === data.mealSlot && !data.deleted ? { ...s, logged: true } : s)) });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.today(undefined), ctx.prev);
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that log.');
    },
    onSuccess: (r) => {
      haptic(10);
      if (r.queued) toast.show('Saved on your phone. It will sync when you’re back online.');
    },
    onSettled: (r) => {
      if (!r?.queued) {
        void qc.invalidateQueries({ queryKey: ['today'] });
        void qc.invalidateQueries({ queryKey: ['diet'] });
        void qc.invalidateQueries({ queryKey: qk.momentum });
        void qc.invalidateQueries({ queryKey: qk.usuals });
        void qc.invalidateQueries({ queryKey: ['progress'] });
        // Crew today and the leaderboard move with every log.
        void qc.invalidateQueries({ queryKey: ['team'] });
      }
    },
  });
}

export function useSaveActivityLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ActivityLogUpsert; optimistic?: ActivityLogDto }) =>
      saveWithFallback<ActivityLogDto>(
        () => api.logs.upsertActivity(id, data),
        () => outbox.enqueue({ kind: 'activity_log', id, data }),
      ),
    onMutate: async ({ data, optimistic }) => {
      if (!optimistic) return;
      const key = qk.today(undefined);
      const prev = qc.getQueryData<TodayResponse>(key);
      if (prev && prev.date === data.date) {
        const others = prev.activityLogs.filter((a) => a.id !== optimistic.id);
        const burned = others.reduce((s, a) => s + a.kcalBurned, 0) + (data.deleted ? 0 : optimistic.kcalBurned);
        qc.setQueryData<TodayResponse>(key, { ...prev, burned, activityLogs: data.deleted ? others : [optimistic, ...others] });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.today(undefined), ctx.prev);
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that activity.');
    },
    onSuccess: (r) => {
      haptic(10);
      if (r.queued) toast.show('Saved on your phone. It will sync when you’re back online.');
    },
    onSettled: (r) => {
      if (!r?.queued) {
        void qc.invalidateQueries({ queryKey: ['today'] });
        void qc.invalidateQueries({ queryKey: qk.plan });
        void qc.invalidateQueries({ queryKey: qk.momentum });
        void qc.invalidateQueries({ queryKey: ['progress'] });
        void qc.invalidateQueries({ queryKey: ['team'] });
      }
    },
  });
}

export function useSaveWeight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: WeightUpsert }) =>
      saveWithFallback<WeightEntryDto>(
        () => api.logs.upsertWeight(id, data),
        () => outbox.enqueue({ kind: 'weight', id, data }),
      ),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Couldn’t save your weight.'),
    onSuccess: (r) => {
      haptic(10);
      if (r.queued) toast.show('Saved on your phone. It will sync when you’re back online.');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['today'] });
      void qc.invalidateQueries({ queryKey: ['progress'] });
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}
