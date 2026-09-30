/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

// App shell for every in-app navigation (SYS-PWA-02); the admin panel and the API are never served from here.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/admin/, /^\/share-target/] }));

// Offline reads for Today, Diet, Progress, chat and /me: network first, cache as fallback.
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/') && /^\/api\/(me|today|diet|progress|momentum|chat\/messages|activity-types|activity-plan|foods\/usuals|team\/summary|inbox)/.test(url.pathname),
  new NetworkFirst({ cacheName: 'api-reads', networkTimeoutSeconds: 4, plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 })] }),
);

// Photos and memes: presigned URLs are day-stable, so cache them.
registerRoute(
  ({ request, url }) => request.destination === 'image' && !url.pathname.startsWith('/icons/'),
  new StaleWhileRevalidate({ cacheName: 'images', plugins: [new ExpirationPlugin({ maxEntries: 250, maxAgeSeconds: 30 * 24 * 3600 })] }),
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
      const target = new URL(data.url ?? '/', self.location.origin).href;
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        await (client as WindowClient).navigate(target).catch(() => client.postMessage({ type: 'NAVIGATE', url: data.url }));
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
