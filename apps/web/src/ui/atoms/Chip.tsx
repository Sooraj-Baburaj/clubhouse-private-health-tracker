import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Selectable pill chip (slot chips, activity types, usual foods). */
export function Chip({ selected, onClick, children, tone = 'dark', className, ...aria }: { selected?: boolean; onClick?: () => void; children: ReactNode; tone?: 'dark' | 'accent' | 'accent2' | 'tint'; className?: string; 'aria-label'?: string }) {
  const on = { dark: 'bg-text text-bg', accent: 'bg-accent text-on-accent-fill', accent2: 'bg-accent-2 text-on-accent2-fill', tint: 'bg-accent-200 text-accent-800' }[tone];
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      aria-pressed={selected}
      className={cn('flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors duration-150', selected ? on : tone === 'tint' ? on : 'bg-surface text-text', className)}
      {...aria}
    >
      {children}
    </motion.button>
  );
}

export function ChipRow({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('scroll-hidden snap-x-chips -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1', className)}>
      {children}
    </div>
  );
}
