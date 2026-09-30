import { motion, useReducedMotion } from 'motion/react';

/** Onboarding progress: one pill per step; the current one fills with a spring. */
export function ProgressPills({ step, total }: { step: number; total: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-300">
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            initial={false}
            animate={{ width: i < step ? '100%' : '0%' }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 28, delay: i === step - 1 ? 0.1 : 0 }}
          />
        </span>
      ))}
    </div>
  );
}
