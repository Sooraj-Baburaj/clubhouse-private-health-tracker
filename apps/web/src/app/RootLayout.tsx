import { Outlet, useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Toaster } from '@clubhouse/ui';
import { outbox, setSyncedHandler } from '@/infrastructure/outbox';
import { queryClient } from '@/infrastructure/queryClient';
import { registerServiceWorker } from '@/infrastructure/sw';
import { useThemeSync } from '@/features/me';
import { openLink } from './openLink';
import { UpdateToast } from './UpdateToast';

let booted = false;

export function RootLayout() {
  const router = useRouter();
  useThemeSync();
  // The service worker falls back to this when it can't navigate the window itself after a notification tap.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'NAVIGATE' && typeof e.data.url === 'string') openLink(router.history, e.data.url, { gesture: false });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);
  useEffect(() => {
    if (booted) return;
    booted = true;
    outbox.init();
    setSyncedHandler(() => {
      void queryClient.invalidateQueries({ queryKey: ['today'] });
      void queryClient.invalidateQueries({ queryKey: ['chat'] });
      void queryClient.invalidateQueries({ queryKey: ['momentum'] });
      void queryClient.invalidateQueries({ queryKey: ['habits'] });
    });
    registerServiceWorker();
  }, []);
  return (
    <>
      <Outlet />
      <Toaster className="flex max-w-[92vw] items-center gap-3 rounded-full bg-text px-[18px] py-3 text-[14px] font-bold text-bg shadow-lg data-[tone=error]:bg-band-red data-[tone=error]:text-white [&_[data-toast-action]]:rounded-full [&_[data-toast-action]]:bg-bg [&_[data-toast-action]]:px-3 [&_[data-toast-action]]:py-1 [&_[data-toast-action]]:text-[13px] [&_[data-toast-action]]:text-text" />
      <UpdateToast />
    </>
  );
}
