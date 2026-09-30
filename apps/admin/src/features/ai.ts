import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type { AdminAiResponse } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { errorMessage } from '@/lib/errors';
import { qk } from './keys';
import { useAction } from './mutations';

/** The shell sidebar's ON/OFF tag reads this key (AdminShell). Keep it fresh after AI changes. */
export const AI_MINI_KEY = ['admin', 'ai-mini'] as const;

export type AiFeatureRow = AdminAiResponse['features'][number];
export type AiFeaturePatch = Parameters<typeof adminApi.ai.updateFeature>[1];
export type AiBudgetInput = Parameters<typeof adminApi.ai.budget>[0];
export type AiPricingInput = Parameters<typeof adminApi.ai.addPricing>[0];
export type AiRegistryEntry = Awaited<ReturnType<typeof adminApi.ai.registry>>[number];
export type AiTestResult = Awaited<ReturnType<typeof adminApi.ai.testCall>>;
export type AiCallFilters = { userId?: string; feature?: string; outcome?: string };

const CALLS_PAGE = 50;

/** Invalidate the overview (exactly — not the usage/calls/registry queries under the same prefix), the sidebar tag and the dashboard. */
function useRefreshOverview() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.ai, exact: true });
    void qc.invalidateQueries({ queryKey: AI_MINI_KEY });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
  };
}

/* ───────── Queries ───────── */

export function useAiOverview() {
  return useQuery({ queryKey: qk.ai, queryFn: () => adminApi.ai.overview(), staleTime: 15_000 });
}

export function useAiUsage(from: string, to: string, enabled = true) {
  return useQuery({ queryKey: qk.aiUsage(from, to), queryFn: () => adminApi.ai.usage(from, to), enabled, placeholderData: (prev) => prev });
}

export function useAiRegistry() {
  return useQuery({ queryKey: qk.aiRegistry, queryFn: () => adminApi.ai.registry(), staleTime: 5 * 60_000 });
}

export function useAiCall(id: string | undefined) {
  return useQuery({ queryKey: qk.aiCall(id ?? ''), queryFn: () => adminApi.ai.call(id!), enabled: !!id });
}

/** Gateway log, newest first, paged by the last row's `startedAt`. */
export function useAiCalls(filters: AiCallFilters) {
  const f: AiCallFilters = {};
  if (filters.userId) f.userId = filters.userId;
  if (filters.feature) f.feature = filters.feature;
  if (filters.outcome) f.outcome = filters.outcome;
  return useInfiniteQuery({
    queryKey: qk.aiCalls(f),
    queryFn: ({ pageParam }) => adminApi.ai.calls({ ...f, before: pageParam, limit: CALLS_PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.calls[last.calls.length - 1]?.startedAt : undefined),
  });
}

/* ───────── Mutations ───────── */

/** Team-wide AI switch. Errors surface in the confirm dialog (no toast); success refreshes the shell tag, `me` and the dashboard. */
export function useSetAiGlobal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ on, reason }: { on: boolean; reason?: string }) => adminApi.ai.setGlobal(on, reason || undefined),
    onSuccess: (_d, { on }) => {
      qc.setQueryData<AdminAiResponse>(qk.ai, (old) => (old ? { ...old, globalOn: on } : old));
      toast.success(on ? 'AI mode is on. Features resume within a few seconds.' : 'AI mode is off. Members get the logic-only fallbacks.');
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.ai, exact: true });
      void qc.invalidateQueries({ queryKey: AI_MINI_KEY });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

/** Per-feature on/model/daily cap — optimistic with rollback. */
export function useUpdateAiFeature() {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, { key: string; name: string; patch: AiFeaturePatch }, { prev: AdminAiResponse | undefined }>({
    mutationFn: ({ key, patch }) => adminApi.ai.updateFeature(key, patch),
    onMutate: async ({ key, patch }) => {
      await qc.cancelQueries({ queryKey: qk.ai, exact: true });
      const prev = qc.getQueryData<AdminAiResponse>(qk.ai);
      if (prev) {
        qc.setQueryData<AdminAiResponse>(qk.ai, {
          ...prev,
          features: prev.features.map((f) =>
            f.key === key ? { ...f, ...(patch.on !== undefined && { on: patch.on }), ...(patch.model !== undefined && { model: patch.model }), ...(patch.dailyCap !== undefined && { dailyCap: patch.dailyCap }) } : f,
          ),
        });
      }
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.ai, ctx.prev);
      toast.error(errorMessage(e));
    },
    onSuccess: (_d, { name, patch }) => {
      if (patch.on !== undefined) toast.success(`${name} ${patch.on ? 'on' : 'off'}`);
      else if (patch.model !== undefined) toast.success(`${name} now uses ${patch.model}`);
      else if (patch.dailyCap !== undefined) toast.success(`${name}: daily cap set to ${patch.dailyCap} per member`);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.ai, exact: true });
      void qc.invalidateQueries({ queryKey: AI_MINI_KEY });
    },
  });
}

export function useSaveAiBudget() {
  const refresh = useRefreshOverview();
  return useAction((b: AiBudgetInput) => adminApi.ai.budget(b), { success: 'Budget saved', onSuccess: refresh });
}

export function useAddAiPricing() {
  const refresh = useRefreshOverview();
  return useAction((b: AiPricingInput) => adminApi.ai.addPricing(b), { success: (_d, b) => `Pricing added for ${b.model}`, onSuccess: refresh });
}

export function useSaveAiRetention() {
  const refresh = useRefreshOverview();
  return useAction((days: number) => adminApi.ai.retention({ promptRetentionDays: days }), {
    success: (_d, days) => (days === 0 ? 'Prompts will no longer be kept' : `Prompts kept for ${days} days`),
    onSuccess: refresh,
  });
}

/** One real call with sample data (logged as a test). The result is shown by the caller. */
export function useAiTestCall() {
  const qc = useQueryClient();
  return useAction((key: string) => adminApi.ai.testCall(key), {
    success: false,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'ai', 'calls'] });
      void qc.invalidateQueries({ queryKey: qk.ai, exact: true });
    },
  });
}
