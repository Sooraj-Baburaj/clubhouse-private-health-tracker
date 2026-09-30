import { ChevronDown, Search, X } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

const CONTROL = 'w-full min-w-0 rounded-[10px] border border-border bg-white px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-[#9b9ba4] hover:border-[#c4c4ca] focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-[invalid=true]:border-accent-dark disabled:cursor-not-allowed disabled:bg-bg disabled:text-muted';

/**
 * Labelled form field. Wraps a single control in a <label> so the label is always associated.
 * Use `as="div"` for groups of controls (the label becomes a caption referenced by `aria-labelledby`).
 */
export function Field({ label, hint, error, children, className, as = 'label', required, labelAside }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; as?: 'label' | 'div'; required?: boolean; labelAside?: ReactNode }) {
  const id = useId();
  const caption = (
    <span id={id} className="flex items-center justify-between gap-2">
      <span>
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {labelAside}
    </span>
  );
  const extras = (
    <>
      {hint && !error && <span className="text-[12px] font-normal leading-snug text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="text-[12px] font-semibold leading-snug text-accent-dark">
          {error}
        </span>
      )}
    </>
  );
  if (as === 'div') {
    return (
      <div role="group" aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-1.5 text-[13px] font-medium', className)}>
        {caption}
        {children}
        {extras}
      </div>
    );
  }
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5 text-[13px] font-medium', className)}>
      {caption}
      {children}
      {extras}
    </label>
  );
}

export function Input({ className, invalid, ...rest }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(CONTROL, 'h-[42px]', className)} {...rest} />;
}

/** Numeric input that reports `number | null` (empty → null). */
export function NumberInput({ value, onValue, className, invalid, ...rest }: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: number | null | undefined; onValue: (v: number | null) => void; invalid?: boolean }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-invalid={invalid || undefined}
      value={value ?? ''}
      onChange={(e) => onValue(e.target.value === '' ? null : Number(e.target.value))}
      className={cn(CONTROL, 'h-[42px] font-mono text-[13px]', className)}
      {...rest}
    />
  );
}

export function Select({ className, children, invalid, ...rest }: ComponentProps<'select'> & { invalid?: boolean }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <select aria-invalid={invalid || undefined} className={cn(CONTROL, 'h-[42px] appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Textarea({ className, invalid, ...rest }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn(CONTROL, 'resize-y px-3.5 py-3 leading-relaxed', className)} {...rest} />;
}

export function Checkbox({ label, hint, className, ...rest }: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2 text-[13px]', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <input type="checkbox" className="mt-[2px] h-4 w-4 shrink-0 accent-[#B6316C]" {...rest} />
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** Pill search box (design: members header). */
export function SearchInput({ value, onChange, placeholder = 'Search', label, className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn('relative w-full sm:w-[240px]', className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-9 text-[14px] outline-none transition-colors placeholder:text-[#9b9ba4] focus:border-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-bg hover:text-ink">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Compact pill select used in toolbars (filters). */
export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-full border border-border bg-white pl-4 pr-9 text-[14px] outline-none transition-colors hover:border-[#c4c4ca] focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

/** Two-column (auto-fit) form grid. */
export function FormGrid({ children, min = 220, className }: { children: ReactNode; min?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4', className)} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}
