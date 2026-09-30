import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscape, useFocusTrap, useLockBodyScroll } from './hooks';
import { duration, ease, spring } from './motion';

function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Accessible label when there is no visible title. */
  label?: string;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  handleClassName?: string;
  maxHeight?: string;
  style?: CSSProperties;
}

/** Bottom sheet (SYS-PWA-04): springs up, drag down or tap the backdrop to dismiss, focus trapped. */
export function Sheet({ open, onClose, title, label, children, className = '', backdropClassName = '', handleClassName = '', maxHeight = '88dvh', style }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const titleId = useId();
  useLockBodyScroll(open);
  useFocusTrap(ref, open);
  useEscape(onClose, open);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 900, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div
              className={backdropClassName}
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: duration.base } }}
              exit={{ opacity: 0, transition: { duration: duration.fast } }}
              style={{ position: 'absolute', inset: 0 }}
              aria-hidden
            />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : label}
              tabIndex={-1}
              className={className}
              initial={reduce ? { opacity: 0 } : { y: '100%' }}
              animate={reduce ? { opacity: 1 } : { y: 0, transition: spring.sheet }}
              exit={reduce ? { opacity: 0 } : { y: '100%', transition: { duration: duration.base, ease: ease.exit } }}
              drag={reduce ? false : 'y'}
              dragControls={controls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={onDragEnd}
              style={{ position: 'relative', width: '100%', maxWidth: 560, maxHeight, overflowY: 'auto', overscrollBehavior: 'contain', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)', ...style }}
            >
              <div onPointerDown={(e) => controls.start(e)} style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', touchAction: 'none', cursor: 'grab' }}>
                <span className={handleClassName} aria-hidden />
              </div>
              {title && (
                <div id={titleId} data-sheet-title>
                  {title}
                </div>
              )}
              {children}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  label: string;
  dismissible?: boolean;
}

/** Centred modal (admin confirmations, glass modals). */
export function Dialog({ open, onClose, children, className = '', backdropClassName = '', label, dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useLockBodyScroll(open);
  useFocusTrap(ref, open);
  useEscape(() => dismissible && onClose(), open);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 950, display: 'grid', placeItems: 'center', padding: 16 }}>
            <motion.div className={backdropClassName} onClick={() => dismissible && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0 }} aria-hidden />
            <motion.div
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className={className}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.12 } : spring.card }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: duration.fast } }}
              style={{ position: 'relative', maxHeight: '90dvh', overflowY: 'auto' }}
            >
              {children}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  label: string;
  side?: 'right' | 'left';
  width?: string;
}

/** Side drawer (admin edit drawer, mobile nav). */
export function Drawer({ open, onClose, children, className = '', backdropClassName = '', label, side = 'right', width = 'min(440px, 94vw)' }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useLockBodyScroll(open);
  useFocusTrap(ref, open);
  useEscape(onClose, open);
  const off = side === 'right' ? '104%' : '-104%';
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 940 }}>
            <motion.div className={backdropClassName} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0 }} aria-hidden />
            <motion.aside
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className={className}
              initial={reduce ? { opacity: 0 } : { x: off }}
              animate={reduce ? { opacity: 1 } : { x: 0, transition: spring.sheet }}
              exit={reduce ? { opacity: 0 } : { x: off, transition: { duration: duration.base, ease: ease.exit } }}
              style={{ position: 'absolute', top: 0, bottom: 0, [side]: 0, width, overflowY: 'auto', overscrollBehavior: 'contain' }}
            >
              {children}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
