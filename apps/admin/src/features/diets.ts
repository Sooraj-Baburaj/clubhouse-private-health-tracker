import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, api } from '@clubhouse/client';
import type { AdminDietPlan, MealSlot } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { compressImage } from '@/lib/compressImage';
import { errorMessage } from '@/lib/errors';
import { qk } from './keys';
import { useAction } from './mutations';

type ApiArg<F> = F extends (...args: infer A) => unknown ? A : never;
type CreateDraftBody = ApiArg<typeof adminApi.diets.createDraft>[0];
type UpdatePlanBody = ApiArg<typeof adminApi.diets.updatePlan>[1];
type UpsertOptionBody = ApiArg<typeof adminApi.diets.addOption>[1];
type DraftWithAiBody = ApiArg<typeof adminApi.diets.draftWithAi>[0];
type BulkAssignBody = ApiArg<typeof adminApi.diets.bulkAssign>[0];

/* ───────── Queries ───────── */

export function useDietList() {
  return useQuery({ queryKey: qk.diets, queryFn: adminApi.diets.list });
}

export function useDietTemplates() {
  return useQuery({ queryKey: qk.dietTemplates, queryFn: adminApi.diets.templates });
}

export function useDietPlan(planId: string) {
  return useQuery({ queryKey: qk.dietPlan(planId), queryFn: () => adminApi.diets.plan(planId) });
}

export function useDietDiff(planId: string, otherId: string | null) {
  return useQuery({
    queryKey: qk.dietDiff(planId, otherId ?? ''),
    queryFn: () => adminApi.diets.diff(planId, otherId!),
    enabled: !!otherId,
  });
}

export function useDietFeedback(userId: string | null) {
  return useQuery({
    queryKey: qk.dietFeedback(userId ?? ''),
    queryFn: () => adminApi.diets.feedback(userId!),
    enabled: !!userId,
  });
}

/** Member food search for the option editor (debounce the query before passing it in). */
export function useFoodSearch(q: string, slot: MealSlot | undefined) {
  const term = q.trim();
  return useQuery({
    queryKey: ['admin', 'diets', 'food-search', slot ?? '', term],
    queryFn: ({ signal }) => api.foods.search(term, slot, signal),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/* ───────── Mutations ───────── */

/**
 * Invalidate the list views without refetching every cached plan
 * (qk.diets is a prefix of the plan/diff/feedback keys, so match it exactly).
 */
function useInvalidateLists() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.diets, exact: true });
    void qc.invalidateQueries({ queryKey: qk.dietTemplates, exact: true });
  };
}

/** Plan mutation that returns the updated plan: writes it straight into the plan cache. */
function usePlanMutation<TVars>(
  planId: string,
  fn: (vars: TVars) => Promise<AdminDietPlan>,
  success?: string | false | ((vars: TVars) => string),
) {
  const qc = useQueryClient();
  const lists = useInvalidateLists();
  return useMutation<AdminDietPlan, unknown, TVars>({
    mutationFn: fn,
    onSuccess: (plan, vars) => {
      qc.setQueryData(qk.dietPlan(planId), plan);
      if (success) toast.success(typeof success === 'function' ? success(vars) : success);
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: lists,
  });
}

export function useCreateDraft() {
  const qc = useQueryClient();
  return useAction((b: CreateDraftBody) => adminApi.diets.createDraft(b), {
    success: (p) => (p.isTemplate ? 'Template created' : 'Draft started'),
    onSuccess: (p) => {
      qc.setQueryData(qk.dietPlan(p.id), p);
      void qc.invalidateQueries({ queryKey: qk.diets, exact: true });
      void qc.invalidateQueries({ queryKey: qk.dietTemplates, exact: true });
    },
  });
}

export function useDraftWithAi() {
  const qc = useQueryClient();
  return useAction((b: DraftWithAiBody) => adminApi.diets.draftWithAi(b), {
    success: 'AI draft ready. Review each slot before publishing.',
    onSuccess: (p) => {
      qc.setQueryData(qk.dietPlan(p.id), p);
      void qc.invalidateQueries({ queryKey: qk.diets, exact: true });
    },
  });
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useAction((b: BulkAssignBody) => adminApi.diets.bulkAssign(b), {
    success: (r, b) =>
      `${r.created} ${r.created === 1 ? 'plan' : 'plans'} ${b.publish ? 'published' : 'drafted'}`,
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.diets, exact: true }),
  });
}

export function useUpdatePlan(planId: string) {
  return usePlanMutation(
    planId,
    (b: UpdatePlanBody) => adminApi.diets.updatePlan(planId, b),
    'Plan saved',
  );
}

export function useSaveOption(planId: string) {
  return usePlanMutation(
    planId,
    ({ optionId, body }: { optionId: string | null; body: UpsertOptionBody }) =>
      optionId
        ? adminApi.diets.updateOption(planId, optionId, body)
        : adminApi.diets.addOption(planId, body),
    (v) => (v.optionId ? 'Option saved' : 'Option added'),
  );
}

export function useDeleteOption(planId: string) {
  return usePlanMutation(
    planId,
    (optionId: string) => adminApi.diets.deleteOption(planId, optionId),
    'Option removed',
  );
}

export function useReviewSlot(planId: string) {
  return usePlanMutation(planId, (slot: MealSlot) => adminApi.diets.review(planId, slot), false);
}

export function usePublishPlan(planId: string) {
  const qc = useQueryClient();
  return usePlanMutation(
    planId,
    async (note: string | null) => {
      const p = await adminApi.diets.publish(planId, note);
      if (p.userId) void qc.invalidateQueries({ queryKey: qk.dietFeedback(p.userId) });
      return p;
    },
    'Published. The member gets a heads-up.',
  );
}

export function useSaveAsTemplate(planId: string) {
  const qc = useQueryClient();
  return useAction((name: string) => adminApi.diets.saveAsTemplate(planId, name), {
    success: (t) => `Saved as template “${t.name}”`,
    onSuccess: (t) => {
      qc.setQueryData(qk.dietPlan(t.id), t);
      void qc.invalidateQueries({ queryKey: qk.dietTemplates, exact: true });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useAction((planId: string) => adminApi.diets.deletePlan(planId), {
    success: 'Deleted',
    onSuccess: (_d, planId) => {
      qc.removeQueries({ queryKey: qk.dietPlan(planId) });
      void qc.invalidateQueries({ queryKey: qk.diets, exact: true });
      void qc.invalidateQueries({ queryKey: qk.dietTemplates, exact: true });
    },
  });
}

/** Photo for an option (kind "diet": kept for as long as the plan uses it, unlike member photos). */
export function useUploadDietImage() {
  return useAction(
    async (file: File) => {
      const blob = await compressImage(file);
      const form = new FormData();
      form.append('file', blob, blob === file ? file.name : blob.type === 'image/webp' ? 'option.webp' : 'option.jpg');
      form.append('kind', 'diet');
      return api.media.upload(form);
    },
    { success: false },
  );
}
