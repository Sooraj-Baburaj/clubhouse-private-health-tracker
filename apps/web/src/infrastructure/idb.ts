import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface OutboxOp {
  key: string; // `${kind}:${id}` — a later edit of the same entity replaces the pending op (last write wins)
  kind: 'food_log' | 'activity_log' | 'weight' | 'chat';
  id: string;
  data: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  failed: boolean;
}

interface ClubhouseDB extends DBSchema {
  kv: { key: string; value: unknown };
  outbox: { key: string; value: OutboxOp; indexes: { byCreated: number } };
  shared: { key: string; value: { blob: Blob; name: string; type: string; at: number } };
}

let dbp: Promise<IDBPDatabase<ClubhouseDB>> | null = null;

export function db() {
  dbp ??= openDB<ClubhouseDB>('clubhouse', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      const ob = d.createObjectStore('outbox', { keyPath: 'key' });
      ob.createIndex('byCreated', 'createdAt');
      d.createObjectStore('shared');
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
