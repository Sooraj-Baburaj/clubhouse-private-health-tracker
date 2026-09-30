import { ApiError, NetworkError } from '@clubhouse/client';

/** Human message for any thrown value (API problem+json title, network, or fallback). */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof ApiError) {
    if (e.status === 403 && (e.code === 'forbidden' || e.code === 'super_admin_required' || e.code === 'error')) {
      return e.message && e.message !== 'Request failed' ? e.message : 'That needs a Super Admin.';
    }
    if (e.status === 429) {
      const mins = e.retryAfter ? Math.ceil(e.retryAfter / 60) : null;
      return mins ? `${e.message}. Try again in ${mins} min.` : e.message;
    }
    if (e.fields && Object.keys(e.fields).length) {
      const first = Object.entries(e.fields)[0];
      if (first) return `${e.message}: ${first[1]}`;
    }
    return e.message || fallback;
  }
  if (e instanceof NetworkError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiError && e.fields ? e.fields : {};
}
