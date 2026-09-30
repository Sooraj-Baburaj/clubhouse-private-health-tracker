import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { spring } from './motion';

export interface Toast {
  id: number;
  message: ReactNode;
  tone?: 'default' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
  duration?: number;
}

let toasts: Toast[] = [];
let seq = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toast = {
  show(message: ReactNode, opts: Omit<Toast, 'id' | 'message'> = {}) {
    const id = seq++;
    toasts = [...toasts.slice(-2), { id, message, ...opts }];
    emit();
    const ms = opts.duration ?? (opts.action ? 5000 : 2600);
    setTimeout(() => toast.dismiss(id), ms);
    return id;
  },
  success(message: ReactNode, opts: Omit<Toast, 'id' | 'message' | 'tone'> = {}) {
    return toast.show(message, { ...opts, tone: 'success' });
  },
  error(message: ReactNode, opts: Omit<Toast, 'id' | 'message' | 'tone'> = {}) {
    return toast.show(message, { ...opts, tone: 'error', duration: opts.duration ?? 4200 });
  },
  dismiss(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
};

function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}

/** Toast region. `className` styles each pill; `position` places the stack (member app: top-centre). */
export function Toaster({ className = '', position = 'top' }: { className?: string; position?: 'top' | 'bottom' }) {
  const items = useToasts();
  const reduce = useReducedMotion();
  return (
    <div
      aria-live="polite"
      role="status"
      style={{ position: 'fixed', left: 0, right: 0, [position]: 'calc(env(safe-area-inset-top, 0px) + 12px)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', padding: '0 16px' }}
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: position === 'top' ? -24 : 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.12 } : spring.snappy }}
            exit={{ opacity: 0, y: position === 'top' ? -12 : 12, transition: { duration: 0.15 } }}
            className={className}
            data-tone={t.tone ?? 'default'}
            style={{ pointerEvents: 'auto' }}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  toast.dismiss(t.id);
                }}
                data-toast-action
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
