import { Outlet } from '@tanstack/react-router';
import { Toaster } from '@clubhouse/ui';
import { ConfirmHost } from '@/ui/ConfirmDialog';

export function RootLayout() {
  return (
    <>
      <Outlet />
      <ConfirmHost />
      <Toaster
        position="bottom"
        className="flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg data-[tone=error]:bg-accent-dark [&_[data-toast-action]]:rounded-full [&_[data-toast-action]]:bg-white [&_[data-toast-action]]:px-3 [&_[data-toast-action]]:py-1 [&_[data-toast-action]]:text-ink"
      />
    </>
  );
}
