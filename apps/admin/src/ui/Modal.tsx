import { Dialog, Drawer } from '@clubhouse/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const BACKDROP = 'bg-[rgba(23,23,28,0.18)]';

/** Glass modal (28 px radius, blur). Springs in; Escape and backdrop close it unless `dismissible={false}`. */
export function Modal({ open, onClose, label, eyebrow, title, children, footer, width = 440, dismissible = true, className }: { open: boolean; onClose: () => void; label?: string; eyebrow?: ReactNode; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; dismissible?: boolean; className?: string }) {
  return (
    <Dialog open={open} onClose={onClose} dismissible={dismissible} label={label ?? (typeof title === 'string' ? title : 'Dialog')} className="glass rounded-[28px]" backdropClassName={BACKDROP}>
      <div className={cn('flex flex-col gap-3.5 p-7', className)} style={{ width: `min(${width}px, calc(100vw - 32px))` }}>
        {(eyebrow || title) && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              {title && <h2 className="display-2">{title}</h2>}
            </div>
            {dismissible && (
              <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-white hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div className="mt-1 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </Dialog>
  );
}

const WIDTHS = { md: 'min(420px, calc(100vw - 24px))', lg: 'min(560px, calc(100vw - 24px))', xl: 'min(760px, calc(100vw - 24px))' } as const;

/** Glass drawer from the right (design: 420 px, 12 px inset, 24 px radius). Header + scrolling body + sticky footer. */
export function DrawerPanel({ open, onClose, label, eyebrow, title, subtitle, children, footer, size = 'md', headerActions }: { open: boolean; onClose: () => void; label?: string; eyebrow?: ReactNode; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: keyof typeof WIDTHS; headerActions?: ReactNode }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      label={label ?? (typeof title === 'string' ? title : 'Details')}
      width={WIDTHS[size]}
      className="m-3 flex flex-col rounded-[24px] border border-white/70 bg-white/[0.86] shadow-[0_40px_130px_rgba(182,49,108,0.16)] backdrop-blur-[20px]"
      backdropClassName={BACKDROP}
    >
      <div className="flex min-h-full flex-col">
        <div className="flex flex-col gap-3 px-7 pt-7">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">{eyebrow}</span>
            <div className="flex items-center gap-2">
              {headerActions}
              <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-[13px] font-semibold text-ink hover:bg-bg">
                Close
              </button>
            </div>
          </div>
          {title && <h2 className="display-2 break-words">{title}</h2>}
          {subtitle && <div className="text-[13px] text-muted">{subtitle}</div>}
        </div>
        <div className="flex flex-1 flex-col gap-4 px-7 pb-6 pt-4">{children}</div>
        {footer && <div className="sticky bottom-0 mt-auto flex flex-wrap items-center justify-between gap-2 rounded-b-[24px] border-t border-hairline bg-white/90 px-7 py-4 backdrop-blur">{footer}</div>}
      </div>
    </Drawer>
  );
}
