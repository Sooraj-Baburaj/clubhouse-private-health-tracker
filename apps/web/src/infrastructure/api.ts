import { configure } from '@clubhouse/client';

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

configure({
  baseUrl: import.meta.env.VITE_API_BASE ?? '/api',
  onUnauthorized: (err) => {
    if (err.code === 'unauthorized') onUnauthorized?.();
  },
});

export { api, ApiError, NetworkError } from '@clubhouse/client';
