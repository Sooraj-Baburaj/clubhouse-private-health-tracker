import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { createHarness, uuid, type Client, type Harness } from './harness';

let h: Harness;
let member: Client;
let other: Client;
let admin: Client;
beforeAll(async () => {
  h = await createHarness();
  const m = await h.createUser();
  const o = await h.createUser();
  const a = await h.createUser({ role: 'admin' });
  member = await h.login(m.username, m.password);
  other = await h.login(o.username, o.password);
  admin = await h.login(a.username, a.password);
});
afterAll(() => h.close());

describe('food catalogue sync', () => {
  it('pages a full snapshot, then returns only changes and removals', async () => {
    const all: string[] = [];
    let after: string | undefined;
    let syncedAt = '';
    do {
      const r = await member.req('GET', `/foods/catalog?limit=500${after ? `&after=${after}` : ''}`);
      expect(r.status).toBe(200);
      all.push(...r.json.items.map((f: { id: string }) => f.id));
      syncedAt ||= r.json.syncedAt;
      after = r.json.next ?? undefined;
    } while (after);
    expect(all.length).toBeGreaterThan(2000);
    expect(new Set(all).size).toBe(all.length);

    // Create a private food, then delete it: it must come back as added, then as removed.
    const created = await member.req('POST', '/foods', { name: `Test laddoo ${uuid().slice(0, 6)}`, servingLabel: '1 piece', servingGrams: 40, perServing: { kcal: 180, protein: 3, carbs: 22, fat: 9, fibre: 1 } });
    expect(created.status).toBe(201);
    // Deltas page like snapshots (the freshly seeded catalogue is inside the overlap window here).
    const delta = async (c: Client, since: string) => {
      const items: { id: string; scope: string }[] = [];
      const removed: string[] = [];
      let next: string | undefined;
      let at = '';
      do {
        const r = await c.req('GET', `/foods/catalog?since=${encodeURIComponent(since)}${next ? `&after=${next}` : ''}`);
        items.push(...r.json.items);
        removed.push(...r.json.removed);
        at ||= r.json.syncedAt;
        next = r.json.next ?? undefined;
      } while (next);
      return { items, removed, syncedAt: at };
    };
    const d1 = await delta(member, syncedAt);
    expect(d1.items.find((f) => f.id === created.json.id)?.scope).toBe('mine');

    // Another member never sees it, not even in their delta.
    const o1 = await delta(other, syncedAt);
    expect(o1.items.map((f) => f.id)).not.toContain(created.json.id);

    await member.req('DELETE', `/foods/${created.json.id}`);
    const d2 = await delta(member, d1.syncedAt);
    expect(d2.removed).toContain(created.json.id);
    expect(d2.items.map((f) => f.id)).not.toContain(created.json.id);
  });
});

describe('chat changes feed', () => {
  it('returns the latest page first, then reactions and new messages as deltas', async () => {
    const id = uuid();
    await member.req('PUT', `/chat/messages/${id}`, { body: 'hello delta', attachments: [] });
    const first = await member.req('GET', '/chat/changes');
    expect(first.status).toBe(200);
    expect(first.json.reset).toBe(false);
    expect(first.json.messages.some((m: { id: string }) => m.id === id)).toBe(true);

    await other.req('POST', `/chat/messages/${id}/reactions`, { emoji: '🔥', on: true });
    const id2 = uuid();
    await other.req('PUT', `/chat/messages/${id2}`, { body: 'second', attachments: [] });
    const delta = await member.req('GET', `/chat/changes?since=${encodeURIComponent(first.json.syncedAt)}&epoch=${first.json.epoch}`);
    expect(delta.json.reset).toBe(false);
    const changed = new Map(delta.json.messages.map((m: { id: string; reactions: unknown[] }) => [m.id, m]));
    expect((changed.get(id) as { reactions: { emoji: string }[] }).reactions[0]!.emoji).toBe('🔥');
    expect(changed.has(id2)).toBe(true);
  });

  it('tells caches to reset after an admin clears a period', async () => {
    const before = await member.req('GET', '/chat/changes');
    const now = new Date(h.clock.now().getTime() + 60_000).toISOString();
    const from = new Date(h.clock.now().getTime() - 24 * 3600_000).toISOString();
    const preview = await admin.req('POST', '/admin/chat/clear/preview', { from, to: now });
    expect(preview.status).toBe(200);
    const cleared = await admin.req('POST', '/admin/chat/clear', { from, to: now, confirm: preview.json.confirmWord, reason: 'test' });
    expect(cleared.status).toBe(200);
    const after = await member.req('GET', `/chat/changes?since=${encodeURIComponent(before.json.syncedAt)}&epoch=${before.json.epoch}`);
    expect(after.json.reset).toBe(true);
    expect(after.json.epoch).not.toBe(before.json.epoch);
    // The reset response is a fresh latest page (the cache replaces everything it held).
    expect(Array.isArray(after.json.messages)).toBe(true);
    const row = await h.c.db.query.settingsKv.findFirst({ where: eq(s.settingsKv.key, `chat.epoch:${h.teamId}`) });
    expect(row).toBeTruthy();
  });
});
