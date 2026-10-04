/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);
cleanupOutdatedCaches();
clientsClaim();

// App shell for every in-app navigation (SYS-PWA-02); the admin panel and the API are never served from here.
// In dev the precache list is empty (Vite serves fresh HTML), so the shell route only exists in real builds.
const shellPrecached = manifest.some((e) => (typeof e === 'string' ? e : e.url).replace(/^\//, '') === 'index.html');
if (shellPrecached) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/admin/, /^\/share-target/] }));
}

// Offline reads for Today, Diet, Progress and /me: network first, cache as fallback. The food catalogue and chat
// history are NOT cached here: they live in IndexedDB with delta sync (src/infrastructure/cache).
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/') && /^\/api\/(me|today|diet|progress|momentum|activity-types|activity-plan|foods\/usuals|team\/summary|inbox)/.test(url.pathname),
  new NetworkFirst({ cacheName: 'api-reads', networkTimeoutSeconds: 4, plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 })] }),
);

// Photos and memes. Storage keys are unique per upload, so an object never changes; only its signature does (it is
// re-signed every UTC day). Keying the cache on the URL without the signature keeps one entry per object across
// days, so yesterday's photos still paint instantly and offline. Revalidation (rather than cache-first) stays because
// cross-origin images are opaque: a bad response can't be detected, so it must be able to heal on the next view.
const SIGNATURE_PARAMS = /^(x-amz-|exp$|sig$)/i;
const unsigned = (u: URL) => {
  const out = new URL(u.href);
  for (const k of [...out.searchParams.keys()]) if (SIGNATURE_PARAMS.test(k)) out.searchParams.delete(k);
  return out.href;
};
/** Never store the response to an already-expired signed URL (stale data rendered offline): it's an opaque 403. */
const signatureExpired = (u: URL) => {
  const exp = u.searchParams.get('exp');
  if (exp) return Number(exp) * 1000 < Date.now();
  const date = u.searchParams.get('X-Amz-Date');
  const ttl = Number(u.searchParams.get('X-Amz-Expires'));
  if (!date || !ttl) return false;
  const signedAt = Date.parse(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
  return Number.isFinite(signedAt) && signedAt + ttl * 1000 < Date.now();
};
registerRoute(
  ({ request, url }) => request.destination === 'image' && !url.pathname.startsWith('/icons/'),
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [
      { cacheKeyWillBeUsed: async ({ request }) => unsigned(new URL(request.url)) },
      // Replaces Workbox's default guard for this strategy, so it keeps that rule too: only 200s and opaque responses.
      { cacheWillUpdate: async ({ request, response }) => ((response.status === 200 || response.status === 0) && !signatureExpired(new URL(request.url)) ? response : null) },
      // Opaque responses are padded heavily against the origin's quota in Chrome, so drop the cache rather than fail.
      new ExpirationPlugin({ maxEntries: 250, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true }),
    ],
  }),
);
registerRoute(({ request }) => request.destination === 'font', new CacheFirst({ cacheName: 'fonts', plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 })] }));

// SYS-PWA-05 share target: stash the shared photo, then open Log food with it attached.
registerRoute(
  ({ url, request }) => request.method === 'POST' && url.pathname === '/share-target',
  async ({ request }) => {
    try {
      const form = await request.formData();
      const file = form.get('photo');
      if (file instanceof File) {
        const cache = await caches.open('shared');
        await cache.put('/shared/photo', new Response(file, { headers: { 'content-type': file.type, 'x-name': encodeURIComponent(file.name) } }));
      }
    } catch {
      /* ignore */
    }
    return Response.redirect('/log/food?shared=1', 303);
  },
  'POST',
);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface PushData {
  title: string;
  body: string;
  url: string;
  tag?: string;
  actions?: { action: string; title: string }[];
  badge?: number;
  data?: { notificationId?: string; type?: string };
}

self.addEventListener('push', (event) => {
  let p: PushData;
  try {
    p = event.data?.json() as PushData;
  } catch {
    p = { title: 'Clubhouse', body: event.data?.text() ?? '', url: '/' };
  }
  const options: NotificationOptions & { actions?: { action: string; title: string }[]; renotify?: boolean } = {
    body: p.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: p.tag,
    renotify: !!p.tag,
    data: { url: p.url, ...p.data },
    actions: p.actions?.slice(0, 2),
  };
  event.waitUntil(
    (async () => {
      // iOS revokes push after silent pushes, so every push shows a notification.
      await self.registration.showNotification(p.title, options);
      const nav = self.navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> };
      if (p.badge != null && nav.setAppBadge) await nav.setAppBadge(p.badge).catch(() => undefined);
    })(),
  );
});

async function call(path: string) {
  try {
    await fetch(path, { method: 'POST', credentials: 'include', headers: { 'x-clubhouse-client': 'web', 'content-type': 'application/json' }, body: '{}' });
  } catch {
    /* offline: the reminder stays in the inbox */
  }
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const data = (n.data ?? {}) as { url?: string; notificationId?: string };
  n.close();
  event.waitUntil(
    (async () => {
      // SYS-NOTIF-08 actions: "Done" logs the planned activity, "Snooze 1 h" re-schedules, "Log it" opens the slot.
      if (event.action === 'done' && data.notificationId) return call(`/api/notifications/${data.notificationId}/done`);
      if (event.action === 'snooze' && data.notificationId) return call(`/api/notifications/${data.notificationId}/snooze`);
      const target = new URL(data.url ?? '/', self.location.origin);
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => new URL(c.url).origin === self.location.origin);
      // Admin links: navigating the window here would swap the installed app for the admin panel, with no way back on
      // iOS. Hand them to the member app instead, which knows whether it's installed (see app/openLink.ts).
      const admin = target.origin === self.location.origin && /^\/admin(?:\/|$)/.test(target.pathname);
      if (client) {
        await client.focus();
        if (admin) return client.postMessage({ type: 'NAVIGATE', url: target.pathname + target.search });
        await (client as WindowClient).navigate(target.href).catch(() => client.postMessage({ type: 'NAVIGATE', url: data.url }));
        return;
      }
      await self.clients.openWindow(admin ? `/inbox?open=${encodeURIComponent(target.pathname + target.search)}` : target.href);
    })(),
  );
});
