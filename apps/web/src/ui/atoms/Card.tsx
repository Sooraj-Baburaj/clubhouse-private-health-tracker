import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'surface' | 'accent' | 'accent2' | 'accent2-tint' | 'accent-tint' | 'dark' | 'plain' | 'outline';

const TONES: Record<Tone, string> = {
  surface: 'bg-surface text-text',
  accent: 'bg-accent text-on-accent',
  accent2: 'bg-accent-2 text-on-accent',
  'accent2-tint': 'bg-accent-2-200 text-accent-2-900',
  'accent-tint': 'bg-accent-200 text-accent-900',
  dark: 'bg-text text-bg',
  plain: 'bg-transparent text-text',
  outline: 'border border-divider bg-transparent text-text',
};

export interface CardProps extends HTMLMotionProps<'div'> {
  tone?: Tone;
  radius?: 22 | 24 | 26 | 28 | 30 | 32 | 36;
  pad?: 'sm' | 'md' | 'lg' | 'none';
}

const PAD = { none: '', sm: 'p-3', md: 'px-4 py-4', lg: 'p-5' };

/** Over-rounded Organic card (28–36 px radius). */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ tone = 'surface', radius = 28, pad = 'md', className, style, ...rest }, ref) {
  return <motion.div ref={ref} className={cn('flex flex-col', TONES[tone], PAD[pad], className)} style={{ borderRadius: radius, ...style }} {...rest} />;
});
