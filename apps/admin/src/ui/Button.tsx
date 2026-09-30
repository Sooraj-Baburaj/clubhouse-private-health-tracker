import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'danger-solid' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-[#2a2a31] border border-transparent',
  secondary: 'bg-white text-ink border border-border hover:border-[#c4c4ca]',
  outline: 'bg-white text-ink border border-[rgba(182,49,108,0.25)] hover:border-accent',
  danger: 'bg-white text-accent-dark border border-accent-border hover:bg-accent-tint/40',
  'danger-solid': 'bg-accent-dark text-white border border-transparent hover:bg-[#741843]',
  ghost: 'bg-transparent text-accent border border-transparent hover:text-accent-dark hover:bg-accent-tint/40',
  link: 'bg-transparent text-accent border-0 !h-auto !px-0 hover:text-accent-dark',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-[18px] text-[14px] gap-2',
  lg: 'h-[46px] px-5 text-[14px] gap-2',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
}

/** Pill button (design: dark primary, outlined, danger outline). Pressed state scales to 0.97. */
export function Button({ variant = 'primary', size = 'md', loading, icon, iconRight, block, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

/** Round icon-only button. `label` is required for screen readers. */
export function IconButton({ label, className, children, size = 36, type = 'button', ...rest }: ComponentProps<'button'> & { label: string; size?: number }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn('inline-grid shrink-0 place-items-center rounded-full border border-border bg-white text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50', className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
}
