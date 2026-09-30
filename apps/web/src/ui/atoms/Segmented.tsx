import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: 'sm' | 'md'; className?: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex overflow-hidden rounded-full border border-divider p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn('relative rounded-full font-bold transition-colors', size === 'sm' ? 'min-h-9 px-3.5 text-[13px]' : 'min-h-11 px-[18px] text-[14px]', on ? 'text-bg' : 'text-text')}
          >
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-text" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
