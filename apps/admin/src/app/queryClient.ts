import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@clubhouse/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
