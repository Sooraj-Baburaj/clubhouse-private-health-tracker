import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@clubhouse/client';
import type { CaloriesProgressResponse, WeightProgressResponse } from '@clubhouse/contracts';
import { qk } from './keys';

export type WeightRange = WeightProgressResponse['range'];
export type CaloriesRange = CaloriesProgressResponse['range'];

export function useWeightProgress(range: WeightRange) {
  return useQuery({ queryKey: qk.progress('weight', range), queryFn: () => api.progress.weight(range), placeholderData: keepPreviousData, staleTime: 60_000 });
}

/** "What if" forecast for a daily kcal delta (debounced by the caller). */
export function useWhatIf(delta: number) {
  return useQuery({ queryKey: qk.progress('what-if', String(delta)), queryFn: () => api.progress.whatIf(delta), enabled: delta !== 0, placeholderData: keepPreviousData, staleTime: 5 * 60_000 });
}

export function useCaloriesProgress(range: CaloriesRange) {
  return useQuery({ queryKey: qk.progress('calories', range), queryFn: () => api.progress.calories(range), placeholderData: keepPreviousData, staleTime: 60_000 });
}

export function useNutrientGrid(weekStart?: string) {
  return useQuery({ queryKey: qk.progress('nutrients', weekStart), queryFn: () => api.progress.nutrients(weekStart), placeholderData: keepPreviousData, staleTime: 60_000 });
}

export function useActivityProgress() {
  return useQuery({ queryKey: qk.progress('activity'), queryFn: () => api.progress.activity(), staleTime: 60_000 });
}

export function useConsistency() {
  return useQuery({ queryKey: qk.progress('consistency'), queryFn: () => api.progress.consistency(), staleTime: 5 * 60_000 });
}

export function useRecaps() {
  return useQuery({ queryKey: qk.progress('recaps'), queryFn: () => api.progress.recaps(), staleTime: 10 * 60_000 });
}

/** Momentum summary (same cache entry as the Momentum screen). */
export function useMomentumSummary() {
  return useQuery({ queryKey: qk.momentum, queryFn: () => api.momentum(), staleTime: 60_000 });
}
