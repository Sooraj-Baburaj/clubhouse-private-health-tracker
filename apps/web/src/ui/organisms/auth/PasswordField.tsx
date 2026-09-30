import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useState } from 'react';
import { PASSWORD_MIN } from '@clubhouse/contracts';
import { TextField, type TextFieldProps } from '@/ui/atoms/Field';
import { cn } from '@/lib/cn';

/** Pill password input with a show/hide toggle (44 px target). */
export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'suffix'>>(function PasswordField(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={show ? 'text' : 'password'}
      suffix={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          className="-mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-700 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)]"
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={2.75} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={2.75} />}
        </button>
      }
    />
  );
});

/** Live checklist that mirrors the NewPassword schema (≥10 chars, letters + numbers/symbols) plus the confirm match. */
export function PasswordStrength({ value, confirm }: { value: string; confirm: string }) {
  const rules = [
    { ok: value.length >= PASSWORD_MIN, label: `At least ${PASSWORD_MIN} characters` },
    { ok: /[A-Za-z]/.test(value) && /[^A-Za-z]/.test(value), label: 'Letters plus a number or symbol' },
    { ok: value.length > 0 && value === confirm, label: 'Both entries match' },
  ];
  const score = rules.filter((r) => r.ok).length;
  return (
    <div className="flex flex-col gap-2 px-2" aria-live="polite">
      <div className="flex gap-1.5" role="img" aria-label={`Password strength ${score} of 3`}>
        {rules.map((_, i) => (
          <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-300">
            <motion.span className="absolute inset-y-0 left-0 rounded-full bg-accent" initial={false} animate={{ width: i < score ? '100%' : '0%' }} transition={{ type: 'spring', stiffness: 300, damping: 26 }} />
          </span>
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
        {rules.map((r) => (
          <li key={r.label} className={cn('flex items-center gap-2 transition-colors', r.ok ? 'text-text' : 'text-neutral-700')}>
            <span className="grid h-4 w-4 place-items-center">
              <AnimatePresence mode="wait" initial={false}>
                {r.ok ? (
                  <motion.span key="ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} className="grid h-4 w-4 place-items-center rounded-full bg-accent text-on-accent-fill">
                    <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden />
                  </motion.span>
                ) : (
                  <motion.span key="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Circle className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {r.label}
            <span className="sr-only">{r.ok ? ' — done' : ' — not yet'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
