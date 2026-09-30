import { api } from '@clubhouse/client';

export type PushState = 'unsupported' | 'ios-needs-install' | 'default' | 'denied' | 'granted';

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function pushState(): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  return Notification.permission as PushState;
}

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function platformLabel(): string {
  const ua = navigator.userAgent;
  if (isIos()) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Web';
}

/** Must be called from a user gesture (iOS requirement). */
export async function enablePush(vapidPublicKey: string | null): Promise<PushState> {
  const st = pushState();
  if (st === 'unsupported' || st === 'ios-needs-install' || !vapidPublicKey) return st;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as PushState;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidPublicKey) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.push.subscribe({ endpoint: json.endpoint, keys: json.keys, platform: platformLabel() });
  return 'granted';
}

export async function currentEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}

/** Re-send the subscription after login so the server links it to this session. */
export async function resyncPush() {
  if (pushState() !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.push.subscribe({ endpoint: json.endpoint, keys: json.keys, platform: platformLabel() }).catch(() => undefined);
}
