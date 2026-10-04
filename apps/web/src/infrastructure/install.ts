import { useSyncExternalStore } from 'react';

/**
 * Install support. Chromium browsers (Chrome, Edge, Android) fire `beforeinstallprompt` once, early, when the app is
 * installable; we keep the event so an "Install app" button anywhere in the app can show the browser's dialog.
 * Safari (iPhone, Mac) has no such event: people use Share → Add to Home Screen, or File → Add to Dock.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop-chromium' | 'mac-safari' | 'other';

export interface InstallState {
  installed: boolean;
  /** The browser's own install dialog is available right now. */
  canPrompt: boolean;
  platform: InstallPlatform;
}

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/chrome|chromium|edg\//i.test(ua)) return 'desktop-chromium';
  if (/safari/i.test(ua) && /macintosh/i.test(ua)) return 'mac-safari';
  return 'other';
}

export const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

let deferred: InstallPromptEvent | null = null;
let state: InstallState = { installed: false, canPrompt: false, platform: 'other' };
const listeners = new Set<() => void>();
const emit = (patch: Partial<InstallState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/** Call once at startup (before React renders) so the early event isn't missed. */
export function initInstall() {
  state = { installed: standalone(), canPrompt: false, platform: detectPlatform() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the mini-infobar
    deferred = e as InstallPromptEvent;
    emit({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit({ installed: true, canPrompt: false });
  });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', () => emit({ installed: standalone() }));
}

/** Show the browser's install dialog. Resolves true when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // a prompt event can only be used once
  emit({ canPrompt: false });
  await e.prompt();
  const choice = await e.userChoice;
  return choice.outcome === 'accepted';
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const get = () => state;

export function useInstall(): InstallState {
  return useSyncExternalStore(subscribe, get, get);
}
