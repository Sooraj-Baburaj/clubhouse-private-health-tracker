import { Minus, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';

/** − value + stepper (design: duration and portion steppers). */
export function Stepper({ value, onChange, step = 1, min = 0, max = 999, label, format = (v: number) => String(v), size = 'md', className }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; label: string; format?: (v: number) => string; size?: 'md' | 'lg'; className?: string }) {
  const btn = size === 'lg' ? 'h-[52px] w-[52px] text-[22px]' : 'h-10 w-10 text-[18px]';
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v * 1000) / 1000));
  return (
    <div className={cn('flex items-center gap-3', className)} role="group" aria-label={label}>
      <motion.button whileTap={{ scale: 0.9 }} type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))} className={cn('grid place-items-center rounded-full border border-divider bg-transparent font-bold disabled:opacity-40', btn)}>
        <Minus className="h-5 w-5" strokeWidth={3} />
      </motion.button>
      <span aria-live="polite" className="min-w-[2ch] text-center font-extrabold tabular">
        {format(value)}
      </span>
      <motion.button whileTap={{ scale: 0.9 }} type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))} className={cn('grid place-items-center rounded-full bg-accent font-bold text-on-accent-fill disabled:opacity-40', btn)}>
        <Plus className="h-5 w-5" strokeWidth={3} />
      </motion.button>
    </div>
  );
}
