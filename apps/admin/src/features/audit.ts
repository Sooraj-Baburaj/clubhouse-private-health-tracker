import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import { qk } from './keys';

/** Server-side audit filters (all optional; empty strings are dropped before the request). */
export interface AuditFilters {
  actorId?: string;
  memberId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  highImpact?: '1';
}

export const AUDIT_PAGE_SIZE = 50;

/** Drop empty values so the query key and the request only carry real filters. */
export function cleanAuditFilters(f: AuditFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  return out;
}

/** ADM-AUD-02: newest first, cursor on the monotonic id ("Load more"). */
export function useAuditLog(filters: AuditFilters) {
  const f = cleanAuditFilters(filters);
  return useInfiniteQuery({
    queryKey: qk.audit(f),
    queryFn: ({ pageParam }) => adminApi.audit.list({ ...f, ...(pageParam != null ? { cursor: pageParam } : {}), limit: AUDIT_PAGE_SIZE }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}
