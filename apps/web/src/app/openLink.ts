import type { RouterHistory } from '@tanstack/react-router';
import { toast } from '@clubhouse/ui';
import { standalone } from '@/infrastructure/install';

export const isAdminPath = (path: string) => /^\/admin(?:\/|$)/.test(path);

/** A new window, so the installed app isn't replaced by the admin panel (which has no way back on iOS). */
function openOutside(href: string) {
  const w = window.open(href, '_blank');
  if (w) w.opener = null;
  return !!w;
}

/**
 * Opens a notification deep link. Member-app paths route in place. The admin panel (/admin, a separate SPA) and other
 * origins need a real page load; inside the installed app they open in a new window instead.
 *
 * `gesture: false` when not called from a tap (e.g. a push tap relayed by the service worker): browsers block
 * window.open there, so the installed app asks for one more tap.
 */
export function openLink(history: RouterHistory, url: string, { gesture = true }: { gesture?: boolean } = {}) {
  const u = new URL(url, window.location.origin);
  if (u.origin === window.location.origin && !isAdminPath(u.pathname)) return history.push(u.pathname + u.search + u.hash);
  if (!standalone()) return window.location.assign(u.href);
  if (gesture && openOutside(u.href)) return;
  toast.show(isAdminPath(u.pathname) ? 'This opens in the admin panel' : 'This opens in your browser', { action: { label: 'Open', onClick: () => void openOutside(u.href) }, duration: 10_000 });
}
