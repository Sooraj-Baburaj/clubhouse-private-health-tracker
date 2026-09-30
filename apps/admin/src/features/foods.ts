import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type { AdminFoodRow } from '@clubhouse/contracts';
import { qk } from './keys';
import { useAction, useOptimistic } from './mutations';

type ApiArg<F> = F extends (...args: infer A) => unknown ? A : never;
export type FoodListQuery = ApiArg<typeof adminApi.foods.list>[0];
type FoodUpdateBody = ApiArg<typeof adminApi.foods.update>[1];

/** Server-side food list (search + source + verified). Keeps the previous page while a new search loads. */
export function useFoodList(q: FoodListQuery, enabled = true) {
  return useQuery({
    queryKey: qk.foods(q),
    queryFn: () => adminApi.foods.list(q),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Writes an updated row into every cached food list so open tables reflect it right away. */
function usePatchFoodCaches() {
  const qc = useQueryClient();
  return (row: AdminFoodRow) => {
    qc.setQueriesData<AdminFoodRow[]>({ queryKey: qk.foodsAll }, (old) =>
      Array.isArray(old) ? old.map((r) => (r.id === row.id ? row : r)) : old,
    );
  };
}

export function useUpdateFood() {
  const patch = usePatchFoodCaches();
  return useAction(
    ({ id, body }: { id: string; body: FoodUpdateBody }) => adminApi.foods.update(id, body),
    {
      success: 'Food saved',
      invalidate: [qk.foodsAll],
      onSuccess: (row) => patch(row),
    },
  );
}

/** Quick verify from the table (optimistic, rolls back on error). */
export function useVerifyFood(listKey: FoodListQuery) {
  return useOptimistic<AdminFoodRow[], { id: string; verified: boolean }>({
    queryKey: qk.foods(listKey),
    mutationFn: ({ id, verified }) => adminApi.foods.update(id, { verified }),
    apply: (old, v) => old.map((r) => (r.id === v.id ? { ...r, verified: v.verified } : r)),
    success: (v) => (v.verified ? 'Marked verified' : 'Marked unverified'),
    invalidate: [qk.foodsAll],
  });
}

export function usePromoteFood() {
  const patch = usePatchFoodCaches();
  return useAction((id: string) => adminApi.foods.promote(id), {
    success: (r) => `${r.name} is now a team food`,
    invalidate: [qk.foodsAll],
    onSuccess: (row) => patch(row),
  });
}

export function useMergeFoods() {
  return useAction((b: { sourceId: string; targetId: string }) => adminApi.foods.merge(b), {
    success: 'Foods merged',
    invalidate: [qk.foodsAll],
  });
}

export function useDeleteFood() {
  return useAction((id: string) => adminApi.foods.delete(id), {
    success: 'Food deleted',
    invalidate: [qk.foodsAll],
  });
}

export function useImportFoods() {
  return useAction((csv: string) => adminApi.foods.import(csv), {
    success: (r) => `Imported ${r.inserted} new, updated ${r.updated}`,
    invalidate: [qk.foodsAll],
  });
}
