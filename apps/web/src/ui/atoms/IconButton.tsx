import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
  tone?: 'surface' | 'accent' | 'ghost' | 'outline' | 'dark';
  size?: 36 | 40 | 44 | 52;
  badge?: number | boolean;
}

const TONES = {
  surface: 'bg-surface text-text',
  accent: 'bg-accent text-on-accent-fill',
  ghost: 'bg-transparent text-text',
  outline: 'border border-divider bg-transparent text-text',
  dark: 'bg-text text-bg',
};

/** 44 px circular icon button (design: back, bell, settings, + actions). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, children, tone = 'surface', size = 44, badge, className, type = 'button', ...rest }, ref) {
  return (
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={{ duration: 0.15 }}
      className={cn('relative grid shrink-0 place-items-center rounded-full border-0 disabled:opacity-45', TONES[tone], className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-2 px-1 text-[10px] font-extrabold leading-none text-on-accent2-fill ring-2 ring-bg">
          {typeof badge === 'number' ? (badge > 99 ? '99+' : badge) : ''}
        </span>
      ) : null}
    </motion.button>
  );
});
