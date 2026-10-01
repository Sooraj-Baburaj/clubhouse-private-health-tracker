import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ApiError } from '@clubhouse/client';
import { kv } from './idb';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 3600_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'always', retry: false },
  },
});

/**
 * SYS-PWA-02: screen data (Today, Diet, Progress, …) is persisted for offline reads. Large datasets are NOT kept
 * here: the food catalogue and chat history live in their own IndexedDB stores with delta sync (infrastructure/cache).
 * Bump CACHE_SCHEMA when a persisted response changes shape so old snapshots are discarded instead of mis-rendered.
 */
export const CACHE_SCHEMA = 'v3';
export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => kv.get<string>(k).then((v) => v ?? null), setItem: (k, v) => kv.set(k, v), removeItem: (k) => kv.del(k) },
  key: 'ch:query-cache',
  throttleTime: 1500,
});

const PERSISTED = new Set(['me', 'today', 'diet', 'progress', 'momentum', 'inbox', 'activity-types', 'plan', 'usuals', 'team', 'chat-members', 'memes', 'habits']);
export const persistOptions = {
  persister,
  maxAge: 7 * 24 * 3600_000,
  buster: CACHE_SCHEMA,
  dehydrateOptions: { shouldDehydrateQuery: (q: { queryKey: readonly unknown[]; state: { status: string } }) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])) },
};
