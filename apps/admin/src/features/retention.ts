import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@clubhouse/client';
import type { RetentionResponse } from '@clubhouse/contracts';
import { fmtBytes, plural } from '@/lib/format';
import { qk } from './keys';
import { useAction } from './mutations';

/** Export statuses that are still being prepared (poll while any exist). */
export const PENDING_EXPORT = new Set(['pending', 'queued', 'running', 'processing']);

export function useRetention(enabled = true) {
  return useQuery({
    queryKey: qk.retention,
    queryFn: adminApi.retention.get,
    enabled,
    refetchInterval: (q) => {
      const d = q.state.data as RetentionResponse | undefined;
      const busy = d?.exports.some((e) => PENDING_EXPORT.has(e.status)) || d?.runs.some((r) => r.status === 'running');
      return busy ? 4_000 : false;
    },
  });
}

export function useUpdateRetention() {
  return useAction((b: { retentionDays: number; reason: string }) => adminApi.retention.update(b), {
    success: (_d, b) => `Images now kept for ${b.retentionDays} days`,
    invalidate: [qk.retention, qk.settings, qk.dashboard],
  });
}

/** Dry run: counts what would be deleted (quiet; it only feeds the confirmation). */
export function useCleanupPreview() {
  return useAction(() => adminApi.retention.run(true), { success: false, invalidate: [qk.retention] });
}

/** Real cleanup: toasts what was removed. */
export function useRunCleanup() {
  return useAction(() => adminApi.retention.run(false), {
    success: (r) => (r.images ? `Cleanup done: ${plural(r.images, 'image')} removed, ${fmtBytes(r.bytes)} freed` : 'Cleanup done: nothing was due'),
    invalidate: [qk.retention, qk.dashboard, qk.jobs],
  });
}

export function useExportTeam() {
  return useAction(() => adminApi.retention.exportTeam(), {
    success: (r) => (r.url ? 'Export ready to download' : 'Export started. The download link appears here when it’s ready.'),
    invalidate: [qk.retention],
  });
}

export function useHandleDeletion() {
  return useAction((v: { id: string; action: 'done' | 'dismissed' }) => adminApi.retention.handleDeletion(v.id, v.action), {
    success: (_d, v) => (v.action === 'done' ? 'Request marked done' : 'Request dismissed'),
    invalidate: [qk.retention, qk.dashboard],
  });
}
