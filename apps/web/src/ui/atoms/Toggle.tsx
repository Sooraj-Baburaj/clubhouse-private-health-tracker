import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/** 50×30 switch with a 24 px knob (design: notification rows). */
export function Toggle({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200 disabled:opacity-45', checked ? 'bg-accent' : 'bg-neutral-400', className)}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 520, damping: 34 }} className="h-6 w-6 rounded-full bg-neutral-100 shadow-sm" style={{ marginLeft: checked ? 20 : 0 }} />
    </button>
  );
}
