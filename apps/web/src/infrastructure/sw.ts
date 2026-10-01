import { Workbox } from 'workbox-window';

type Listener = (ready: boolean) => void;
let wb: Workbox | null = null;
let updateReady = false;
const listeners = new Set<Listener>();

/** SYS-PWA-06: a new version downloads in the background; the member reloads when ready (never mid-entry). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  wb = new Workbox('/sw.js', { scope: '/' });
  wb.addEventListener('waiting', () => {
    updateReady = true;
    listeners.forEach((l) => l(true));
  });
  // Only reload when a new version replaced an old one (after "apply"). On the very first visit the new worker
  // claims the page too (clientsClaim) and a reload there would wipe whatever the person is typing.
  wb.addEventListener('controlling', (e) => {
    if (e.isUpdate) window.location.reload();
  });
  void wb.register();
  setInterval(() => void wb?.update(), 60 * 60_000);
}

export const swUpdate = {
  subscribe(l: Listener) {
    listeners.add(l);
    l(updateReady);
    return () => {
      listeners.delete(l);
    };
  },
  apply() {
    wb?.messageSkipWaiting();
  },
};
