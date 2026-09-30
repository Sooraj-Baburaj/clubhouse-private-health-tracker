import type { ActivityLogUpsert, FoodLogUpsert, SendMessageRequest, SyncOp, WeightUpsert } from '@clubhouse/contracts';
import { api, ApiError, NetworkError } from '@clubhouse/client';
import { db, type OutboxOp } from './idb';

/**
 * Offline outbox (SYS-PWA-03, NFR-REL-03). Writes that fail for network reasons are queued in IndexedDB and
 * replayed in order on reconnect. Ids are client-generated and the server upserts with last-write-wins, so a replay
 * never duplicates. A 4xx marks the op failed so the UI can surface it; 5xx and network errors retry with backoff.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: { pending: OutboxOp[]; syncing: boolean } = { pending: [], syncing: false };
let flushing: Promise<void> | null = null;
let backoffMs = 2000;
let onSynced: ((ops: OutboxOp[]) => void) | null = null;

export function setSyncedHandler(fn: (ops: OutboxOp[]) => void) {
  onSynced = fn;
}

async function refresh() {
  const all = await (await db()).getAllFromIndex('outbox', 'byCreated');
  snapshot = { ...snapshot, pending: all };
  listeners.forEach((l) => l());
}

export const outbox = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => snapshot,
  isPending: (id: string) => snapshot.pending.some((op) => op.id === id),
  async enqueue(op: { kind: 'food_log'; id: string; data: FoodLogUpsert } | { kind: 'activity_log'; id: string; data: ActivityLogUpsert } | { kind: 'weight'; id: string; data: WeightUpsert } | { kind: 'chat'; id: string; data: SendMessageRequest }) {
    const d = await db();
    const key = `${op.kind}:${op.id}`;
    const existing = await d.get('outbox', key);
    await d.put('outbox', { key, kind: op.kind, id: op.id, data: op.data, createdAt: existing?.createdAt ?? Date.now(), attempts: 0, lastError: null, failed: false });
    await refresh();
    void outbox.flush();
  },
  async discard(key: string) {
    await (await db()).delete('outbox', key);
    await refresh();
  },
  async retry(key: string) {
    const d = await db();
    const op = await d.get('outbox', key);
    if (op) await d.put('outbox', { ...op, failed: false, lastError: null });
    await refresh();
    void outbox.flush();
  },
  flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = doFlush().finally(() => {
      flushing = null;
    });
    return flushing;
  },
  init() {
    void refresh().then(() => outbox.flush());
    window.addEventListener('online', () => void outbox.flush());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void outbox.flush());
    setInterval(() => snapshot.pending.some((o) => !o.failed) && void outbox.flush(), 30_000);
  },
};

async function doFlush() {
  if (!navigator.onLine) return;
  const d = await db();
  let ops = (await d.getAllFromIndex('outbox', 'byCreated')).filter((o) => !o.failed);
  if (!ops.length) return;
  snapshot = { ...snapshot, syncing: true };
  listeners.forEach((l) => l());
  const done: OutboxOp[] = [];
  try {
    const logOps = ops.filter((o) => o.kind !== 'chat');
    for (let i = 0; i < logOps.length; i += 50) {
      const chunk = logOps.slice(i, i + 50);
      const res = await api.logs.sync({ ops: chunk.map((o) => ({ kind: o.kind, id: o.id, data: o.data }) as SyncOp) });
      for (const r of res.results) {
        const op = chunk.find((o) => o.id === r.id && o.kind === r.kind)!;
        if (r.status === 'rejected') await d.put('outbox', { ...op, failed: true, attempts: op.attempts + 1, lastError: r.error ?? 'Rejected' });
        else {
          await d.delete('outbox', op.key);
          done.push(op);
        }
      }
    }
    ops = ops.filter((o) => o.kind === 'chat');
    for (const op of ops) {
      try {
        await api.chat.send(op.id, op.data as SendMessageRequest);
        await d.delete('outbox', op.key);
        done.push(op);
      } catch (e) {
        if (e instanceof ApiError && e.status < 500 && e.status !== 429) await d.put('outbox', { ...op, failed: true, attempts: op.attempts + 1, lastError: e.message });
        else throw e;
      }
    }
    backoffMs = 2000;
  } catch (e) {
    if (!(e instanceof NetworkError)) console.warn('outbox flush failed', e);
    setTimeout(() => void outbox.flush(), backoffMs);
    backoffMs = Math.min(backoffMs * 2, 60_000);
  } finally {
    snapshot = { ...snapshot, syncing: false };
    await refresh();
    if (done.length) onSynced?.(done);
  }
}
