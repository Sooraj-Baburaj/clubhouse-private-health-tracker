import { ChevronLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { PaneContext } from '@/app/pane';
import { cn } from '@/lib/cn';
import { IconButton } from '@/ui/atoms/IconButton';
import { EdgeSwipe } from '@/ui/molecules/EdgeSwipe';

/**
 * A full-screen view inside the meal flow (Food, Dish, Create a food, the AI read). It slides over the meal, owns its
 * scroll area and its bottom action bar, and has its own history entry, so back and the edge swipe close it.
 */
export function ViewShell({ label, onBack, title, eyebrow, right, footer, children, className }: { label: string; onBack: () => void; title?: ReactNode; eyebrow?: ReactNode; right?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.section
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="absolute inset-0 z-20 flex flex-col bg-bg"
      initial={reduce ? { opacity: 0 } : { x: '100%' }}
      animate={reduce ? { opacity: 1 } : { x: 0, transition: { type: 'spring', stiffness: 420, damping: 40 } }}
      exit={reduce ? { opacity: 0 } : { x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
    >
      <PaneContext.Provider value={ref}>
        <div ref={ref} className="pane min-h-0 flex-1 overflow-y-auto overflow-x-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className={cn('flex flex-col gap-4 px-5 pb-8 pt-2', className)}>
            <div className="flex items-center gap-2.5">
              <IconButton label="Back" onClick={onBack}>
                <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
              </IconButton>
              <div className="flex min-w-0 flex-1 flex-col">
                {eyebrow && <span className="eyebrow truncate">{eyebrow}</span>}
                {title && <h1 className="truncate font-heading text-[24px] leading-tight">{title}</h1>}
              </div>
              {right}
            </div>
            {children}
          </div>
        </div>
      </PaneContext.Provider>
      {footer && (
        <div className="flex gap-2 bg-bg px-5 pt-3 shadow-[0_-1px_0_var(--color-divider)]" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
          {footer}
        </div>
      )}
      <EdgeSwipe onBack={onBack} />
    </motion.section>
  );
}
