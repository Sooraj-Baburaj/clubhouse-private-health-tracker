import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import type { DietOptionDto, DietResponse, FoodLogDto, FoodLogUpsert, MealSlot, Nutrients } from '@clubhouse/contracts';
import { haptic, toast } from '@clubhouse/ui';
import { outbox } from '@/infrastructure/outbox';
import { nowIso, uuid } from '@/lib/ids';
import { qk } from './keys';

export function useDiet(date?: string, dayType?: 'training' | 'rest') {
  return useQuery({ queryKey: qk.diet(date, dayType), queryFn: () => api.diet.get(date, dayType), staleTime: 60_000 });
}

/** Read-only previous version of the plan (only while `DietResponse.previous` is present). */
export function useDietPrevious(planId: string | null) {
  return useQuery({ queryKey: ['diet', 'previous', planId ?? ''], queryFn: () => api.diet.previous(planId!), enabled: !!planId, staleTime: 10 * 60_000 });
}

const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
export function scaleNutrients(n: Nutrients, k: number): Nutrients {
  return { kcal: n.kcal * k, protein: n.protein * k, carbs: n.carbs * k, fat: n.fat * k, fibre: n.fibre * k };
}
export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce((a, n) => ({ kcal: a.kcal + n.kcal, protein: a.protein + n.protein, carbs: a.carbs + n.carbs, fat: a.fat + n.fat, fibre: a.fibre + n.fibre }), ZERO);
}
/** Totals of an option with a portion factor per item (1 = as planned). */
export function optionTotals(option: DietOptionDto, portions?: number[]): Nutrients {
  if (!portions) return option.nutrition;
  return sumNutrients(option.items.map((it, i) => scaleNutrients(it.nutrition, portions[i] ?? 1)));
}

/** Best fit first, then options that fit today, then the rest; "not for me" sinks to the bottom. */
export function sortOptions(options: DietOptionDto[]): DietOptionDto[] {
  const rank = (o: DietOptionDto) => (o.notForMe ? 3 : o.bestFit ? 0 : o.favourite ? 1 : o.fits ? 1.5 : 2);
  return [...options].sort((a, b) => rank(a) - rank(b));
}

function offlineUpsert(option: DietOptionDto, slot: MealSlot, date: string, loggedAt: string, portions?: number[]): FoodLogUpsert {
  return {
    date,
    mealSlot: slot,
    loggedAt,
    clientUpdatedAt: loggedAt,
    items: option.items.map((it, i) => {
      const k = portions?.[i] ?? 1;
      return {
        foodId: it.foodId,
        name: it.name,
        grams: Math.round(it.grams * k),
        servings: Math.round(it.servings * k * 100) / 100,
        servingLabel: it.servingLabel,
        nutrition: scaleNutrients(it.nutrition, k),
        source: 'diet' as const,
        dietOptionId: option.id,
        aiEstimate: it.aiEstimate,
      };
    }),
  };
}

export interface LogOptionVars {
  option: DietOptionDto;
  slot: MealSlot;
  date: string;
  portions?: number[];
}

/** Log a plan option (APP-DIET-04). Falls back to the offline outbox with the option's items on a network error. */
export function useLogOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ option, slot, date, portions }: LogOptionVars): Promise<{ logId: string; entity: FoodLogDto | null; queued: boolean; upsert: FoodLogUpsert }> => {
      const logId = uuid();
      const loggedAt = nowIso();
      const upsert = offlineUpsert(option, slot, date, loggedAt, portions);
      try {
        const r = await api.diet.logOption(option.id, { logId, date, mealSlot: slot, loggedAt, portions });
        return { logId, entity: r.entity, queued: false, upsert };
      } catch (e) {
        if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
          await outbox.enqueue({ kind: 'food_log', id: logId, data: upsert });
          return { logId, entity: null, queued: true, upsert };
        }
        throw e;
      }
    },
    onSuccess: () => haptic(10),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Couldn’t log that plate.'),
    onSettled: (r) => {
      if (r?.queued) toast.show('Saved on your phone. It will sync when you’re back online.');
      void qc.invalidateQueries({ queryKey: ['diet'] });
      void qc.invalidateQueries({ queryKey: ['today'] });
      void qc.invalidateQueries({ queryKey: qk.momentum });
      void qc.invalidateQueries({ queryKey: ['progress'] });
    },
  });
}

function patchOption(d: DietResponse, optionId: string, patch: Partial<DietOptionDto>): DietResponse {
  return { ...d, slots: d.slots.map((s) => ({ ...s, options: s.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) })) };
}

/** Favourite / not for me on an option (APP-DIET-06), applied optimistically. */
export function useOptionFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ optionId, reaction }: { optionId: string; reaction: 'favourite' | 'dislike' | null }) => api.diet.feedback(optionId, reaction),
    onMutate: async ({ optionId, reaction }) => {
      await qc.cancelQueries({ queryKey: ['diet'] });
      const snapshot = qc.getQueriesData<DietResponse>({ queryKey: ['diet'] });
      for (const [key, data] of snapshot) if (data && 'slots' in data) qc.setQueryData(key, patchOption(data, optionId, { favourite: reaction === 'favourite', notForMe: reaction === 'dislike' }));
      return { snapshot };
    },
    onError: (err, _v, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that.');
    },
    onSuccess: (_r, { reaction }) => {
      haptic(8);
      toast.show(reaction === 'favourite' ? 'Added to your favourites' : reaction === 'dislike' ? 'Got it — we’ll show it less' : 'Cleared');
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['diet'] }),
  });
}

/** An upsert that removes a just-made log (Undo). */
export function deleteUpsert(u: FoodLogUpsert): FoodLogUpsert {
  return { ...u, clientUpdatedAt: nowIso(), deleted: true };
}
