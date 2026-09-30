import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { fadeUp, reducedFade, stagger } from '@clubhouse/ui';

/** Logo 3b "Breakfast, lunch, dinner": two closed rings and a third still filling. */
export function BrandMark({ size = 72 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={(size * 34) / 96} viewBox="0 0 96 34" aria-hidden>
        <g fill="none" strokeWidth="7" strokeLinecap="round">
          <circle cx="17" cy="17" r="12" stroke="var(--color-accent)" />
          <circle cx="48" cy="17" r="12" stroke="var(--color-accent)" />
          <circle cx="79" cy="17" r="12" stroke="var(--color-neutral-300)" />
          <motion.circle cx="79" cy="17" r="12" stroke="var(--color-accent-2)" transform="rotate(-90 79 17)" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 0.6 }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.2 }} />
        </g>
      </svg>
      <span className="font-heading text-[22px]">Clubhouse</span>
    </div>
  );
}

/** Full-height auth screen (login, change password, two-step code) on the member ground. */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="min-h-dvh bg-bg text-text">
      <motion.main
        variants={reduce ? undefined : stagger(0.06)}
        initial="hidden"
        animate="show"
        className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-7 px-7"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 40px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}
      >
        <motion.div variants={reduce ? reducedFade : fadeUp}>
          <BrandMark />
        </motion.div>
        {children}
        {footer && (
          <motion.div variants={reduce ? reducedFade : fadeUp} className="mt-auto flex flex-col gap-2.5">
            {footer}
          </motion.div>
        )}
      </motion.main>
    </div>
  );
}

export function AuthSection({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div variants={reduce ? reducedFade : fadeUp} className={className}>
      {children}
    </motion.div>
  );
}
