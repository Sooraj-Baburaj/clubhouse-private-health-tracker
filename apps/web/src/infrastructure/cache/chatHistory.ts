import { api } from '@clubhouse/client';
import type { ChatChangesResponse, ChatMessageDto, ChatPageResponse } from '@clubhouse/contracts';
import { db } from '../idb';
import { SyncedCollection } from './engine';

/**
 * Chat history cached in IndexedDB: the chat opens instantly (and offline) from the cache, then a delta pull brings
 * new messages and every change since the last sync (reactions, deletions, pins). Scrolling up first reveals cached
 * history, then pages older messages from the server into the cache. At most MAX_CACHED messages are kept.
 */

export const CHAT_FORMAT = 1;
const MAX_CACHED = 2000;
const INITIAL_WINDOW = 80;
const PAGE = 50;

type Meta = Pick<ChatPageResponse, 'pinned' | 'lastReadSeq' | 'latestSeq' | 'muted'> & {
  serverHasMoreBefore: boolean;
};
const EMPTY_META: Meta = {
  pinned: [],
  lastReadSeq: 0,
  latestSeq: 0,
  muted: null,
  serverHasMoreBefore: true,
};

const byId = new Map<string, ChatMessageDto>();
let sorted: ChatMessageDto[] = [];
let meta: Meta = EMPTY_META;
let windowSize = INITIAL_WINDOW;
let feedCache: { version: number; feed: ChatPageResponse } | null = null;

function resort() {
  sorted = [...byId.values()].sort((a, b) => a.seq - b.seq);
  feedCache = null;
}

async function putMany(rows: ChatMessageDto[]) {
  if (!rows.length) return;
  const tx = (await db()).transaction('chatMessages', 'readwrite');
  for (const m of rows) void tx.store.put(m);
  await tx.done;
}

/** Keep the newest MAX_CACHED messages; anything older is fetched again if someone scrolls that far. */
async function evict(max = MAX_CACHED) {
  if (sorted.length <= max) return;
  const drop = sorted.slice(0, sorted.length - max);
  const tx = (await db()).transaction('chatMessages', 'readwrite');
  for (const m of drop) {
    void tx.store.delete(m.id);
    byId.delete(m.id);
  }
  await tx.done;
  meta = { ...meta, serverHasMoreBefore: true };
  resort();
}

function metaFrom(r: ChatChangesResponse | ChatPageResponse, serverHasMoreBefore: boolean): Meta {
  return {
    pinned: r.pinned,
    lastReadSeq: r.lastReadSeq,
    latestSeq: r.latestSeq,
    muted: r.muted,
    serverHasMoreBefore,
  };
}

export const chatHistory = new SyncedCollection({
  name: 'chat',
  format: CHAT_FORMAT,
  // Chat is revalidated by signals, focus and the open Chat tab; 15 s keeps back-to-back triggers cheap.
  ttlMs: 15_000,
  fullEveryMs: 3 * 24 * 3600_000,
  async hydrate() {
    const d = await db();
    const rows = await d.getAll('chatMessages');
    byId.clear();
    for (const m of rows) byId.set(m.id, m);
    const stored = await d.get('syncMeta', 'chat');
    meta = { ...EMPTY_META, ...((stored?.extra?.chat as Meta | undefined) ?? {}) };
    resort();
    return byId.size;
  },
  async clear() {
    byId.clear();
    meta = EMPTY_META;
    windowSize = INITIAL_WINDOW;
    resort();
    await (await db()).clear('chatMessages');
  },
  async pull({ meta: syncMeta, full, signal }) {
    const since = full ? undefined : (syncMeta.cursor ?? undefined);
    const r = await api.chat.changes(
      { since, epoch: syncMeta.epoch ?? undefined, limit: INITIAL_WINDOW },
      signal,
    );
    if (!since || r.reset) {
      // Fresh latest page: replace the cache (an admin may have deleted history; a long gap is cheaper to reload).
      await (await db()).clear('chatMessages');
      byId.clear();
      windowSize = INITIAL_WINDOW;
      for (const m of r.messages) byId.set(m.id, m);
      await putMany(r.messages);
      meta = metaFrom(r, r.hasMoreBefore);
    } else {
      // Delta: new messages and changes to cached ones. Changes to messages older than the cache are ignored
      // (they'll be fetched fresh if someone scrolls there).
      const oldest = sorted[0]?.seq ?? 0;
      const keep = r.messages.filter((m) => m.seq >= oldest || byId.has(m.id));
      for (const m of keep) byId.set(m.id, m);
      await putMany(keep);
      meta = metaFrom(r, meta.serverHasMoreBefore);
    }
    resort();
    await evict();
    return { cursor: r.syncedAt, epoch: r.epoch, count: byId.size, extra: { chat: meta } };
  },
  async onQuotaExceeded() {
    await evict(500);
  },
});

async function persistMeta() {
  await chatHistory.saveExtra({ chat: meta });
}

/* ── reads ── */

/** The visible window, shaped like the API page so the Chat screen doesn't care where it came from. */
export function chatFeed(): ChatPageResponse {
  const v = chatHistory.getStatus().version;
  if (feedCache && feedCache.version === v) return feedCache.feed;
  const start = Math.max(0, sorted.length - windowSize);
  const feed: ChatPageResponse = {
    messages: sorted.slice(start),
    pinned: meta.pinned,
    lastReadSeq: meta.lastReadSeq,
    latestSeq: Math.max(meta.latestSeq, sorted.at(-1)?.seq ?? 0),
    hasMoreBefore: start > 0 || meta.serverHasMoreBefore,
    muted: meta.muted,
  };
  feedCache = { version: v, feed };
  return feed;
}

export function cachedMessage(id: string) {
  return byId.get(id);
}

/* ── writes (optimistic edits and sends write through to IndexedDB) ── */

export async function upsertMessage(m: ChatMessageDto) {
  byId.set(m.id, m);
  if (m.seq > meta.latestSeq) meta = { ...meta, latestSeq: m.seq };
  if (m.mine && m.seq > meta.lastReadSeq) meta = { ...meta, lastReadSeq: m.seq };
  resort();
  chatHistory.touched();
  await putMany([m]);
  await persistMeta();
}

export async function patchMessage(id: string, fn: (m: ChatMessageDto) => ChatMessageDto) {
  const cur = byId.get(id);
  const pinnedIdx = meta.pinned.findIndex((p) => p.id === id);
  if (pinnedIdx >= 0) meta = { ...meta, pinned: meta.pinned.map((p) => (p.id === id ? fn(p) : p)) };
  if (!cur) return;
  const next = fn(cur);
  byId.set(id, next);
  resort();
  chatHistory.touched();
  await putMany([next]);
}

export async function setLastRead(seq: number) {
  if (seq <= meta.lastReadSeq) return;
  meta = { ...meta, lastReadSeq: seq };
  feedCache = null;
  chatHistory.touched();
  await persistMeta();
}

/** Scroll-up: reveal cached history first (instant), then page older messages from the server into the cache. */
export async function loadOlder(): Promise<number> {
  const hidden = sorted.length - windowSize;
  if (hidden > 0) {
    const n = Math.min(PAGE, hidden);
    windowSize += n;
    feedCache = null;
    chatHistory.touched(false);
    return n;
  }
  if (!meta.serverHasMoreBefore || !sorted.length) return 0;
  const page = await api.chat.list({ before: sorted[0]!.seq, limit: PAGE });
  for (const m of page.messages) byId.set(m.id, m);
  meta = { ...meta, serverHasMoreBefore: page.hasMoreBefore };
  windowSize += page.messages.length;
  resort();
  chatHistory.touched();
  await putMany(page.messages);
  await persistMeta();
  return page.messages.length;
}
