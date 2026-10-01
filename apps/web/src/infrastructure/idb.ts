import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CatalogFood, ChatMessageDto } from '@clubhouse/contracts';

export interface OutboxOp {
  key: string; // `${kind}:${id}` — a later edit of the same entity replaces the pending op (last write wins)
  kind: 'food_log' | 'activity_log' | 'weight' | 'habit_checkin' | 'chat';
  id: string;
  data: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  failed: boolean;
}

/** Bookkeeping for one synced collection (see cache/engine.ts). */
export interface SyncMeta {
  name: string;
  /** `${userId}:${teamId}` the data belongs to; a different signed-in person never sees it. */
  scope: string;
  /** Server payload format; a mismatch means "drop and download afresh". */
  format: number;
  /** Server time of the last completed sync (the next `since`). */
  cursor: string | null;
  /** Server-side reset marker (e.g. chat epoch after an admin clear). */
  epoch: string | null;
  /** Local time of the last completed sync, for freshness checks. */
  syncedAt: number | null;
  count: number;
  extra?: Record<string, unknown>;
}

interface ClubhouseDB extends DBSchema {
  kv: { key: string; value: unknown };
  outbox: { key: string; value: OutboxOp; indexes: { byCreated: number } };
  shared: { key: string; value: { blob: Blob; name: string; type: string; at: number } };
  /** Food catalogue for instant, offline search (CatalogFood). */
  foods: { key: string; value: CatalogFood };
  /** Chat history (ChatMessageDto), newest window plus anything scrolled into. */
  chatMessages: { key: string; value: ChatMessageDto; indexes: { bySeq: number } };
  syncMeta: { key: string; value: SyncMeta };
}

export type StoreName = 'foods' | 'chatMessages';

let dbp: Promise<IDBPDatabase<ClubhouseDB>> | null = null;

export function db() {
  dbp ??= openDB<ClubhouseDB>('clubhouse', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('kv');
        const ob = d.createObjectStore('outbox', { keyPath: 'key' });
        ob.createIndex('byCreated', 'createdAt');
        d.createObjectStore('shared');
      }
      if (oldVersion < 2) {
        d.createObjectStore('foods', { keyPath: 'id' });
        const chat = d.createObjectStore('chatMessages', { keyPath: 'id' });
        chat.createIndex('bySeq', 'seq');
        d.createObjectStore('syncMeta', { keyPath: 'name' });
      }
    },
    // Another tab upgraded the schema: close so it isn't blocked, and reopen lazily on next use.
    blocking() {
      void dbp?.then((x) => x.close());
      dbp = null;
    },
  });
  return dbp;
}

export const kv = {
  get: async <T>(key: string) => (await (await db()).get('kv', key)) as T | undefined,
  set: async (key: string, value: unknown) => {
    await (await db()).put('kv', value, key);
  },
  del: async (key: string) => {
    await (await db()).delete('kv', key);
  },
};
