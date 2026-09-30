import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import { createHarness, uuid, type Client, type Harness } from './harness';

let h: Harness;
let a: Client;
let b: Client;
let bId: string;
let bName: string;
beforeAll(async () => {
  h = await createHarness();
  const ua = await h.createUser();
  const ub = await h.createUser();
  bId = ub.id;
  bName = ub.username;
  a = await h.login(ua.username, ua.password);
  b = await h.login(ub.username, ub.password);
});
afterAll(() => h.close());

describe('chat', () => {
  it('sends idempotently, notifies mentions and counts unread', async () => {
    const id = uuid();
    const first = await a.req('PUT', `/chat/messages/${id}`, { body: `Lunch done @${bName}`, attachments: [] });
    expect(first.status).toBe(200);
    expect(first.json.duplicate).toBe(false);
    expect(first.json.message.mentions).toContain(bId);
    const again = await a.req('PUT', `/chat/messages/${id}`, { body: `Lunch done @${bName}`, attachments: [] });
    expect(again.json.duplicate).toBe(true);
    const unread = await b.req('GET', '/chat/unread');
    expect(unread.json.chat).toBe(1);
    expect(unread.json.inbox).toBeGreaterThanOrEqual(1);
    const notes = await h.c.db.query.notifications.findMany({ where: eq(s.notifications.userId, bId) });
    expect(notes.some((n) => n.type === 'chat_mention')).toBe(true);
  });

  it('reacts, lists and marks read', async () => {
    const page = await b.req('GET', '/chat/messages?limit=10');
    const msg = page.json.messages.at(-1);
    expect((await b.req('POST', `/chat/messages/${msg.id}/reactions`, { emoji: '🔥', on: true })).status).toBe(200);
    const after = await a.req('GET', '/chat/messages?limit=10');
    expect(after.json.messages.at(-1).reactions[0]).toMatchObject({ emoji: '🔥', count: 1, mine: false });
    await b.req('POST', '/chat/read', { seq: page.json.latestSeq });
    expect((await b.req('GET', '/chat/unread')).json.chat).toBe(0);
  });

  it('only lets authors delete their own messages', async () => {
    const id = uuid();
    await a.req('PUT', `/chat/messages/${id}`, { body: 'mine', attachments: [] });
    expect((await b.req('DELETE', `/chat/messages/${id}`)).status).toBe(404);
    expect((await a.req('DELETE', `/chat/messages/${id}`)).status).toBe(200);
  });
});
