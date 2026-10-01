import { useSyncExternalStore } from 'react';
import { queryClient } from '../queryClient';
import { live } from '../realtime';
import { chatFeed, chatHistory } from './chatHistory';
import type { SyncedCollection } from './engine';
import { foodCatalog } from './foodCatalog';

/**
 * Cache manager: binds the synced collections to the signed-in person and owns every revalidation trigger, so the
 * policy lives in one place:
 *
 * | Trigger                          | Foods                  | Chat                      |
 * |----------------------------------|------------------------|---------------------------|
 * | Session start (after sign-in)    | if older than 6 h      | always                    |
 * | Tab becomes visible              | if older than 6 h      | if older than 15 s        |
 * | Back online                      | forced                 | forced                    |
 * | Realtime hint                    | `foods.changed`        | `chat.*`                  |
 * | Local write (create food / send) | forced                 | forced                    |
 * | Interval while visible           | —                      | 60 s (realtime fallback)  |
 *
 * Data is never deleted on errors; it's dropped only on sign-out, a different person signing in, a payload format
 * change, an explicit "clear local cache", or a server-requested reset.
 */

export const collections = { foods: foodCatalog, chat: chatHistory } as const;
const all: SyncedCollection[] = Object.values(collections);

let boundScope: string | null = null;
let stopTriggers: (() => void) | null = null;

/** The Chat screen's query; cache changes are pushed into it so every view of chat stays in step. */
export const CHAT_FEED_KEY = ['chat', 'feed'] as const;

export async function bindCacheSession(userId: string, teamId: string) {
  const scope = `${userId}:${teamId}`;
  if (boundScope === scope) return;
  boundScope = scope;
  await Promise.all(all.map((c) => c.bind(scope)));
  startTriggers();
  if (chatHistory.getStatus().count > 0) queryClient.setQueryData(CHAT_FEED_KEY, chatFeed());
  void foodCatalog.revalidate('start');
  void chatHistory.revalidate('start', { force: true });
  // Ask the browser not to evict our data under storage pressure (granted for installed apps / engaged sites).
  void navigator.storage?.persist?.().catch(() => false);
}

/** Sign-out, a different person, or "clear local cache". */
export async function clearCaches() {
  boundScope = null;
  stopTriggers?.();
  stopTriggers = null;
  await Promise.all(all.map((c) => c.reset()));
}

function startTriggers() {
  if (stopTriggers) return;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    void foodCatalog.revalidate('focus');
    void chatHistory.revalidate('focus');
  };
  const onOnline = () => {
    void foodCatalog.revalidate('online');
    void chatHistory.revalidate('online');
  };
  const offChat = chatHistory.subscribe(() => {
    const s = chatHistory.getStatus();
    if (s.hydrated && (s.ready || s.count > 0)) queryClient.setQueryData(CHAT_FEED_KEY, chatFeed());
  });
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  const offLive = live.on((event) => {
    if (event.startsWith('chat.')) void chatHistory.revalidate('signal');
    if (event === 'foods.changed') void foodCatalog.revalidate('signal');
  });
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void chatHistory.revalidate('interval');
  }, 60_000);
  stopTriggers = () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    offLive();
    offChat();
    window.clearInterval(timer);
  };
}

/** React binding: re-renders when the collection's data or sync state changes. */
export function useCollectionStatus(c: SyncedCollection) {
  return useSyncExternalStore(c.subscribe, c.getStatus, c.getStatus);
}

/** Rough on-device usage for Settings › App. */
export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
  persisted: boolean;
} | null> {
  if (!navigator.storage?.estimate) return null;
  const [e, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(false),
  ]);
  return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted };
}
