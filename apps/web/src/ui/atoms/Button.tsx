import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'surface' | 'accent2' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent-fill hover:brightness-[0.97] active:brightness-95 font-heading',
  secondary: 'border border-divider bg-transparent text-text hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] font-heading',
  ghost: 'bg-transparent text-accent-700 hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] font-bold',
  dark: 'bg-text text-bg hover:opacity-90 font-heading',
  surface: 'bg-surface text-text hover:brightness-[0.98] font-bold',
  accent2: 'bg-accent-2 text-on-accent2-fill hover:brightness-[0.97] font-bold',
  danger: 'border border-band-red text-band-red-fg bg-transparent hover:bg-band-red-bg font-bold',
};
const SIZES: Record<Size, string> = { sm: 'min-h-10 px-4 text-[13px]', md: 'min-h-12 px-5 text-[15px]', lg: 'min-h-14 px-6 text-[18px]' };

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

/** Pill button (Organic: 999 px radius; primary CTAs use Caprasimo, as in the design). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', block, loading, icon, className, children, disabled, type = 'button', ...rest }, ref) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15 }}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex select-none items-center justify-center gap-2 rounded-full border-0 transition-[background,filter,opacity] duration-150 disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-5 w-5" /> : icon}
      {children && <span className={cn(loading && 'opacity-80')}>{children}</span>}
    </motion.button>
  );
});
