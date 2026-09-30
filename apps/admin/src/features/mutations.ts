import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from '@clubhouse/ui';
import { errorMessage } from '@/lib/errors';

/**
 * Mutation with the admin conventions: success toast, error toast (API message), and cache invalidation.
 * `success` may be a string or a function of (data, vars); pass `false` to stay quiet.
 */
export function useAction<TVars = void, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string | false | ((data: TData, vars: TVars) => string); invalidate?: QueryKey[]; onSuccess?: (data: TData, vars: TVars) => void; errorToast?: boolean } = {},
) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(data, vars) : opts.success);
      opts.onSuccess?.(data, vars);
    },
    onError: (e) => {
      if (opts.errorToast !== false) toast.error(errorMessage(e));
    },
    onSettled: () => {
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

/**
 * Optimistic cache update with rollback (toggles, pins, enable/disable).
 * `apply` edits the cached value for `queryKey`; on error the snapshot is restored and a toast shown.
 */
export function useOptimistic<TCache, TVars, TData = unknown>(opts: {
  queryKey: QueryKey;
  mutationFn: (vars: TVars) => Promise<TData>;
  apply: (old: TCache, vars: TVars) => TCache;
  success?: string | ((vars: TVars) => string);
  invalidate?: QueryKey[];
}) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars, { prev: TCache | undefined }>({
    mutationFn: opts.mutationFn,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: opts.queryKey });
      const prev = qc.getQueryData<TCache>(opts.queryKey);
      if (prev !== undefined) qc.setQueryData<TCache>(opts.queryKey, opts.apply(prev, vars));
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(opts.queryKey, ctx.prev);
      toast.error(errorMessage(e));
    },
    onSuccess: (_d, vars) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(vars) : opts.success);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: opts.queryKey });
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: k });
    },
  });
}
