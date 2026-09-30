import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string | null;
  hint?: ReactNode;
  suffix?: ReactNode;
  prefix?: ReactNode;
}

/** Pill input (52 px, surface fill, divider border) with label, hint and inline error. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, hint, suffix, prefix, className, id, ...rest }, ref) {
  const autoId = useId();
  const fid = id ?? autoId;
  return (
    <label htmlFor={fid} className={cn('flex flex-col gap-1.5 text-[13px] text-neutral-700', className)}>
      {label && <span>{label}</span>}
      <span className={cn('flex min-h-[52px] items-center gap-2 rounded-full border bg-surface px-[18px] transition-colors focus-within:border-accent', error ? 'border-band-red' : 'border-divider')}>
        {prefix}
        <input ref={ref} id={fid} aria-invalid={!!error} aria-describedby={error ? `${fid}-err` : undefined} className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-text outline-none" {...rest} />
        {suffix}
      </span>
      {error ? (
        <span id={`${fid}-err`} className="px-2 text-[13px] font-semibold text-band-red-fg">
          {error}
        </span>
      ) : hint ? (
        <span className="px-2 text-[12px]">{hint}</span>
      ) : null}
    </label>
  );
});
