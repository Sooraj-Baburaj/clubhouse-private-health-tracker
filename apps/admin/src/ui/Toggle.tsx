import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** 40×24 switch with an accent track (design); `size="lg"` is the 48×28 AI master switch. */
export function Toggle({ checked, onChange, label, disabled, size = 'md', className, title }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; size?: 'md' | 'lg'; className?: string; title?: string }) {
  const reduce = useReducedMotion();
  const dims = size === 'lg' ? { w: 48, h: 28, k: 22 } : { w: 40, h: 24, k: 18 };
  const travel = dims.w - dims.k - 6;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative shrink-0 rounded-full border-0 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-45', checked ? 'bg-accent' : 'bg-border', className)}
      style={{ width: dims.w, height: dims.h }}
    >
      <motion.span
        aria-hidden
        className="absolute left-[3px] top-[3px] rounded-full bg-white shadow-[0_1px_2px_rgba(23,23,28,0.2)]"
        style={{ width: dims.k, height: dims.k }}
        initial={false}
        animate={{ x: checked ? travel : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34 }}
      />
    </button>
  );
}

/** Toggle with a visible label and optional hint, laid out as a settings row. */
export function ToggleRow({ label, hint, checked, onChange, disabled, aside, className }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 border-t border-hairline py-3 first:border-t-0', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14px] font-semibold">{label}</span>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </div>
      <div className="flex items-center gap-3">
        {aside}
        <Toggle checked={checked} onChange={onChange} disabled={disabled} label={typeof label === 'string' ? label : 'Toggle'} />
      </div>
    </div>
  );
}
