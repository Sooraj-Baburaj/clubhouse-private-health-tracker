import { ApiError } from '@clubhouse/client';
import { db, type SyncMeta } from '../idb';

/**
 * Synced collections: large datasets (food catalogue, chat history) live in IndexedDB and in memory, and are kept
 * fresh with delta pulls from the API. This module is the policy layer every collection shares:
 *
 *  - Scope: data belongs to `${userId}:${teamId}`. Binding a different person (or a new payload format) drops it.
 *  - Freshness: a revalidation inside `ttlMs` is skipped unless forced (realtime hint, local write, manual refresh).
 *  - Single flight: one pull at a time per collection; a forced request during a pull runs once more afterwards.
 *  - Cross-tab: a Web Lock lets only one tab pull; the others re-read IndexedDB when it broadcasts a change.
 *  - Failure: data is kept, the error is recorded, and retries back off exponentially (1 s → 5 min, with jitter).
 *  - Offline: no pulls while offline; going online triggers one.
 *  - Self-healing: a full re-download every `fullEveryMs`, or immediately when the server says `reset`.
 *
 * Collections implement four primitives (hydrate, clear, pull, and their own read API); triggers (focus, online,
 * realtime signals, intervals) are wired by cache/index.ts.
 */

export type SyncReason = 'start' | 'focus' | 'online' | 'interval' | 'signal' | 'write' | 'manual';

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'error';
  /** IndexedDB has been read into memory (data, possibly stale, is usable). */
  hydrated: boolean;
  /** At least one sync completed for this scope (the data is the server's, not empty-because-new). */
  ready: boolean;
  syncedAt: number | null;
  error: string | null;
  count: number;
  /** Bumps on every data change; cheap equality for React subscriptions. */
  version: number;
}

export interface PullContext {
  meta: SyncMeta;
  /** Download everything (first sync, format change, periodic self-heal, server reset). */
  full: boolean;
  signal: AbortSignal;
}

export interface PullResult {
  cursor: string;
  epoch?: string | null;
  count: number;
  extra?: Record<string, unknown>;
  /** The server asked for a full reload; the engine runs one immediately. */
  resetRequested?: boolean;
}

export interface CollectionSpec {
  name: string;
  format: number;
  ttlMs: number;
  /** Full re-download period, as a safety net against any missed delta. */
  fullEveryMs: number;
  /** IndexedDB → memory. Returns the number of records. */
  hydrate(): Promise<number>;
  /** Drop memory and IndexedDB rows. */
  clear(): Promise<void>;
  /** Network → IndexedDB + memory. Must be idempotent (deltas overlap). */
  pull(ctx: PullContext): Promise<PullResult>;
  /** Free space after a QuotaExceededError (e.g. evict old chat). */
  onQuotaExceeded?(): Promise<void>;
}

const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('clubhouse-cache') : null;
// Node (tests) keeps the process alive for an open channel; browsers ignore this.
(channel as unknown as { unref?: () => void } | null)?.unref?.();
const PULL_TIMEOUT_MS = 45_000;
const MAX_BACKOFF_MS = 5 * 60_000;

/** Where sync bookkeeping is stored (IndexedDB in the app; in memory in tests). */
export interface MetaStore {
  get(name: string): Promise<SyncMeta | undefined>;
  put(meta: SyncMeta): Promise<void>;
  delete(name: string): Promise<void>;
}

const idbMetaStore: MetaStore = {
  get: async (name) => (await db()).get('syncMeta', name),
  put: async (meta) => {
    await (await db()).put('syncMeta', meta);
  },
  delete: async (name) => {
    await (await db()).delete('syncMeta', name);
  },
};

const emptyMeta = (name: string, scope: string, format: number): SyncMeta => ({
  name,
  scope,
  format,
  cursor: null,
  epoch: null,
  syncedAt: null,
  count: 0,
});

export class SyncedCollection {
  private scope: string | null = null;
  private meta: SyncMeta | null = null;
  private inflight: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private nextAttemptAt = 0;
  private status: SyncStatus = {
    state: 'idle',
    hydrated: false,
    ready: false,
    syncedAt: null,
    error: null,
    count: 0,
    version: 0,
  };
  private listeners = new Set<() => void>();

  constructor(
    readonly spec: CollectionSpec,
    private readonly metaStore: MetaStore = idbMetaStore,
  ) {
    channel?.addEventListener('message', (e: MessageEvent<{ name: string; scope: string }>) => {
      if (e.data?.name === spec.name && e.data.scope === this.scope) void this.rehydrate();
    });
  }

  /* ── reactive status ── */
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getStatus = () => this.status;
  private set(patch: Partial<SyncStatus>, changed = false) {
    this.status = { ...this.status, ...patch, version: this.status.version + (changed ? 1 : 0) };
    this.listeners.forEach((l) => l());
  }
  /** Collections call this after local writes (optimistic edits) so views re-render and other tabs re-read. */
  touched(broadcast = true) {
    this.set({}, true);
    if (broadcast && this.scope) channel?.postMessage({ name: this.spec.name, scope: this.scope });
  }

  get currentScope() {
    return this.scope;
  }

  /* ── lifecycle ── */

  /** Attach to the signed-in person. Different person or payload format → drop; same → load from IndexedDB. */
  async bind(scope: string) {
    if (this.scope === scope && this.status.hydrated) return;
    this.scope = scope;
    const stored = await this.metaStore.get(this.spec.name);
    if (!stored || stored.scope !== scope || stored.format !== this.spec.format) {
      await this.spec.clear();
      this.meta = emptyMeta(this.spec.name, scope, this.spec.format);
      await this.metaStore.put(this.meta);
      this.set({ hydrated: true, ready: false, syncedAt: null, count: 0, error: null }, true);
      return;
    }
    this.meta = stored;
    const count = await this.spec.hydrate();
    this.set(
      { hydrated: true, ready: stored.syncedAt != null, syncedAt: stored.syncedAt, count },
      true,
    );
  }

  /** Signed out or "clear local cache": forget everything. */
  async reset() {
    this.inflight = null;
    this.scope = null;
    await this.spec.clear();
    await this.metaStore.delete(this.spec.name);
    this.meta = null;
    this.failures = 0;
    this.nextAttemptAt = 0;
    this.set(
      { state: 'idle', hydrated: false, ready: false, syncedAt: null, error: null, count: 0 },
      true,
    );
  }

  private async rehydrate() {
    const stored = await this.metaStore.get(this.spec.name);
    if (!stored || stored.scope !== this.scope) return;
    this.meta = stored;
    const count = await this.spec.hydrate();
    this.set({ ready: stored.syncedAt != null, syncedAt: stored.syncedAt, count }, true);
  }

  getMeta() {
    return this.meta;
  }

  async saveExtra(extra: Record<string, unknown>) {
    if (!this.meta) return;
    this.meta = { ...this.meta, extra: { ...this.meta.extra, ...extra } };
    await this.metaStore.put(this.meta);
  }

  isFresh() {
    return !!this.meta?.syncedAt && Date.now() - this.meta.syncedAt < this.spec.ttlMs;
  }

  /* ── revalidation ── */

  /**
   * Bring the collection up to date. Cheap to call often: skipped while fresh (unless forced), offline, backing off
   * after errors (unless manual), or already running (a forced call schedules exactly one more run).
   */
  revalidate(reason: SyncReason, opts: { force?: boolean; full?: boolean } = {}): Promise<void> {
    if (!this.scope || !this.meta) return Promise.resolve();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();
    const force =
      !!opts.force ||
      reason === 'manual' ||
      reason === 'write' ||
      reason === 'signal' ||
      reason === 'online';
    if (this.inflight) {
      if (force) this.again = true;
      return this.inflight;
    }
    if (!force && !opts.full && this.isFresh()) return Promise.resolve();
    if (reason !== 'manual' && Date.now() < this.nextAttemptAt) return Promise.resolve();
    this.inflight = this.runWithLock(!!opts.full).finally(() => {
      this.inflight = null;
      if (this.again) {
        this.again = false;
        void this.revalidate('signal', { force: true });
      }
    });
    return this.inflight;
  }

  private async runWithLock(full: boolean) {
    const scope = this.scope!;
    const locks =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;
    if (!locks) return this.run(full, scope);
    await locks.request(
      `clubhouse-sync:${this.spec.name}:${scope}`,
      { ifAvailable: true },
      async (lock) => {
        // Another tab is pulling the same collection; it will broadcast and this tab re-reads IndexedDB.
        if (!lock) return;
        await this.run(full, scope);
      },
    );
  }

  private async run(forceFull: boolean, scope: string, attempt = 0): Promise<void> {
    const meta = this.meta!;
    const full =
      forceFull ||
      !meta.cursor ||
      (!!meta.extra?.fullAt && Date.now() - Number(meta.extra.fullAt) > this.spec.fullEveryMs);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PULL_TIMEOUT_MS);
    this.set({ state: 'syncing' });
    try {
      const res = await this.spec.pull({ meta, full, signal: ac.signal });
      if (this.scope !== scope) return; // signed out / switched person mid-pull: discard
      if (res.resetRequested && attempt === 0) {
        clearTimeout(timer);
        return this.run(true, scope, 1);
      }
      this.meta = {
        ...meta,
        cursor: res.cursor,
        epoch: res.epoch ?? meta.epoch,
        syncedAt: Date.now(),
        count: res.count,
        extra: { ...meta.extra, ...res.extra, ...(full ? { fullAt: Date.now() } : {}) },
      };
      await this.metaStore.put(this.meta);
      this.failures = 0;
      this.nextAttemptAt = 0;
      this.set(
        { state: 'idle', ready: true, error: null, syncedAt: this.meta.syncedAt, count: res.count },
        true,
      );
      channel?.postMessage({ name: this.spec.name, scope });
    } catch (e) {
      if (
        (e as DOMException)?.name === 'QuotaExceededError' &&
        this.spec.onQuotaExceeded &&
        attempt === 0
      ) {
        await this.spec.onQuotaExceeded();
        clearTimeout(timer);
        return this.run(forceFull, scope, 1);
      }
      // Auth problems are handled globally (sign-in redirect); don't hammer the API meanwhile.
      const authError = e instanceof ApiError && (e.status === 401 || e.status === 403);
      this.failures += 1;
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (this.failures - 1));
      this.nextAttemptAt =
        Date.now() + (authError ? MAX_BACKOFF_MS : backoff * (0.75 + Math.random() * 0.5));
      this.set({
        state: 'error',
        error:
          (e as Error)?.name === 'AbortError'
            ? 'Timed out'
            : ((e as Error)?.message ?? 'Sync failed'),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
