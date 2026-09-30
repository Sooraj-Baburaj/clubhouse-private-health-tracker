import type { ReactNode } from 'react';
import { Sheet } from '@clubhouse/ui';

/** Member-styled bottom sheet: 36 px top radius, 44×5 handle, dimmed backdrop (design: log sheet). */
export function MemberSheet({ open, onClose, title, label, children }: { open: boolean; onClose: () => void; title?: string; label?: string; children: ReactNode }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={label ?? title}
      title={title ? <div className="px-5 pb-1 pt-1 font-heading text-[24px] leading-tight">{title}</div> : undefined}
      className="rounded-t-[36px] bg-bg text-text shadow-lg"
      backdropClassName="bg-[rgba(10,8,6,0.55)]"
      handleClassName="block h-[5px] w-11 rounded-full bg-neutral-400"
    >
      <div className="flex flex-col gap-2.5 px-5 pb-4 pt-2">{children}</div>
    </Sheet>
  );
}
