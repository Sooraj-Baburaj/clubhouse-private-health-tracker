import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncMeta } from '../idb';
import { SyncedCollection, type CollectionSpec, type MetaStore, type PullContext, type PullResult } from './engine';

function memoryStore(): MetaStore & { rows: Map<string, SyncMeta> } {
  const rows = new Map<string, SyncMeta>();
  return {
    rows,
    get: async (n) => rows.get(n),
    put: async (m) => {
      rows.set(m.name, structuredClone(m));
    },
    delete: async (n) => {
      rows.delete(n);
    },
  };
}

function fakeSpec(pull: (ctx: PullContext) => Promise<PullResult>, over: Partial<CollectionSpec> = {}) {
  const data = { cleared: 0, hydrated: 0 };
  const spec: CollectionSpec = {
    name: 'test',
    format: 1,
    ttlMs: 60_000,
    fullEveryMs: 24 * 3600_000,
    hydrate: async () => {
      data.hydrated++;
      return 5;
    },
    clear: async () => {
      data.cleared++;
    },
    pull,
    ...over,
  };
  return { spec, data };
}

const ok = (cursor = '2026-10-01T00:00:00.000Z'): PullResult => ({ cursor, count: 5 });

describe('SyncedCollection', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('first sync is a full download; later ones are deltas from the stored cursor', async () => {
    const calls: PullContext[] = [];
    const { spec } = fakeSpec(async (ctx) => (calls.push(ctx), ok(`c${calls.length}`)));
    const c = new SyncedCollection(spec, memoryStore());
    await c.bind('u1:t1');
    await c.revalidate('start');
    expect(calls[0]!.full).toBe(true);
    await c.revalidate('manual');
    expect(calls[1]!.full).toBe(false);
    expect(calls[1]!.meta.cursor).toBe('c1');
    expect(c.getStatus()).toMatchObject({ ready: true, state: 'idle', count: 5 });
  });

  it('skips revalidation while fresh unless forced', async () => {
    const pull = vi.fn(async () => ok());
    const c = new SyncedCollection(fakeSpec(pull).spec, memoryStore());
    await c.bind('u1:t1');
    await c.revalidate('start');
    await c.revalidate('focus');
    expect(pull).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 61_000);
    await c.revalidate('focus');
    expect(pull).toHaveBeenCalledTimes(2);
    await c.revalidate('signal');
    expect(pull).toHaveBeenCalledTimes(3);
  });

  it('runs one pull at a time; a forced call during a pull runs exactly once more', async () => {
    let release!: () => void;
    let n = 0;
    const pull = vi.fn(() => {
      n++;
      return n === 1 ? new Promise<PullResult>((r) => (release = () => r(ok()))) : Promise.resolve(ok());
    });
    const c = new SyncedCollection(fakeSpec(pull).spec, memoryStore());
    await c.bind('u1:t1');
    const first = c.revalidate('start');
    void c.revalidate('signal');
    void c.revalidate('signal');
    release();
    await first;
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
  });

  it('keeps data and backs off after a failure; a manual refresh still goes through', async () => {
    let fail = true;
    const pull = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return ok();
    });
    const { spec, data } = fakeSpec(pull);
    const c = new SyncedCollection(spec, memoryStore());
    await c.bind('u1:t1');
    await c.revalidate('start');
    expect(c.getStatus()).toMatchObject({ state: 'error', error: 'boom' });
    expect(data.cleared).toBe(1); // only the initial bind of a new scope, never on errors
    await c.revalidate('focus');
    expect(pull).toHaveBeenCalledTimes(1); // backing off
    fail = false;
    await c.revalidate('manual');
    expect(pull).toHaveBeenCalledTimes(2);
    expect(c.getStatus().state).toBe('idle');
  });

  it('drops data when a different person binds or the payload format changes; keeps it for the same person', async () => {
    const store = memoryStore();
    const a = fakeSpec(async () => ok());
    const c1 = new SyncedCollection(a.spec, store);
    await c1.bind('u1:t1');
    await c1.revalidate('start');
    // Same person on a fresh page load: hydrate, no clear.
    const b = fakeSpec(async () => ok());
    await new SyncedCollection(b.spec, store).bind('u1:t1');
    expect(b.data).toEqual({ cleared: 0, hydrated: 1 });
    // Someone else signs in on this device.
    const d = fakeSpec(async () => ok());
    await new SyncedCollection(d.spec, store).bind('u2:t1');
    expect(d.data.cleared).toBe(1);
    // A new app version with a different payload format.
    const e = fakeSpec(async () => ok(), { format: 2 });
    await new SyncedCollection(e.spec, store).bind('u2:t1');
    expect(e.data.cleared).toBe(1);
  });

  it('runs a full download when the server requests a reset, and periodically as a safety net', async () => {
    const calls: boolean[] = [];
    const { spec } = fakeSpec(async (ctx) => {
      calls.push(ctx.full);
      return calls.length === 2 ? { ...ok(), resetRequested: true } : ok();
    });
    const c = new SyncedCollection(spec, memoryStore());
    await c.bind('u1:t1');
    await c.revalidate('start'); // full
    await c.revalidate('manual'); // delta → server says reset → full
    expect(calls).toEqual([true, false, true]);
    vi.setSystemTime(Date.now() + 25 * 3600_000);
    await c.revalidate('manual');
    expect(calls.at(-1)).toBe(true);
  });

  it('does nothing after sign-out', async () => {
    const pull = vi.fn(async () => ok());
    const c = new SyncedCollection(fakeSpec(pull).spec, memoryStore());
    await c.bind('u1:t1');
    await c.reset();
    await c.revalidate('manual');
    expect(pull).not.toHaveBeenCalled();
    expect(c.getStatus().hydrated).toBe(false);
  });
});
