import { Check, Lock, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Toggle } from '@/ui/atoms/Toggle';
import { cn } from '@/lib/cn';

/** Design toggle row: the whole row flips the switch (settings list style). */
export function ToggleRow({ title, sub, checked, onChange, disabled, locked, children }: { title: ReactNode; sub?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; locked?: boolean; children?: ReactNode }) {
  const off = disabled || locked;
  return (
    <div className={cn('flex flex-col', off && 'opacity-70')}>
      <div onClick={() => !off && onChange(!checked)} className={cn('flex min-h-14 items-center gap-3 px-4 py-3', !off && 'cursor-pointer')}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[15px] font-bold">
            {title}
            {locked && <Lock aria-label="Always on" className="h-3.5 w-3.5 text-neutral-600" strokeWidth={2.75} />}
          </span>
          {sub && <span className="text-[12px] text-neutral-700">{sub}</span>}
        </span>
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle label={typeof title === 'string' ? title : 'Toggle'} checked={checked} onChange={onChange} disabled={off} />
        </span>
      </div>
      <AnimatePresence initial={false}>
        {children && checked && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="flex flex-col gap-2.5 px-4 pb-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Divider() {
  return <div aria-hidden className="mx-4 h-px bg-divider" />;
}

/** Radio list inside a ListGroup. */
export function RadioList<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; sub?: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)} className="flex min-h-14 items-center gap-3 border-0 bg-transparent px-4 py-3 text-left">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-bold">{o.label}</span>
              {o.sub && <span className="text-[12px] text-neutral-700">{o.sub}</span>}
            </span>
            <span aria-hidden className={cn('grid h-6 w-6 place-items-center rounded-full border-2 transition-colors', on ? 'border-accent bg-accent text-on-accent-fill' : 'border-neutral-500')}>
              {on && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Weekday chips, 0 = Monday … 6 = Sunday. `hint` days get a dotted outline (suggested). */
export function WeekdayChips({ value, onChange, label, hint = [], disabled }: { value: number[]; onChange: (v: number[]) => void; label: string; hint?: number[]; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex justify-between gap-1">
      {DAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <motion.button
            key={i}
            type="button"
            whileTap={{ scale: 0.9 }}
            disabled={disabled}
            aria-pressed={on}
            aria-label={DAY_NAMES[i]}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            className={cn('grid h-10 w-10 place-items-center rounded-full border-2 text-[13px] font-extrabold transition-colors disabled:opacity-50', on ? 'border-text bg-text text-bg' : hint.includes(i) ? 'border-dashed border-accent bg-transparent' : 'border-transparent bg-bg')}
          >
            {d}
          </motion.button>
        );
      })}
    </div>
  );
}

export function TimeInput({ value, onChange, label, disabled }: { value: string; onChange: (v: string) => void; label: string; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  // Follow outside changes (adjust state during render when the value changes).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setLocal(value);
  }
  // Commit after a short pause so typing "0", "7", "3", "0" saves once.
  useEffect(() => {
    if (!local || local === value) return;
    const t = setTimeout(() => onChange(local), 700);
    return () => clearTimeout(t);
  }, [local, value, onChange]);
  return (
    <input
      type="time"
      aria-label={label}
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local && local !== value && onChange(local)}
      className="min-h-11 rounded-full border border-divider bg-bg px-4 text-[15px] font-bold tabular outline-none focus:border-accent disabled:opacity-50"
    />
  );
}

/** Chip input: type and press Enter (or comma) to add; × removes. Suggestions are one-tap adds. */
export function ChipInput({ label, values, onChange, suggestions = [], placeholder, max = 30 }: { label: string; values: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number }) {
  const [text, setText] = useState('');
  const id = useId();
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '').slice(0, 40);
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase()) || values.length >= max) return;
    onChange([...values, v]);
    setText('');
  };
  const left = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <label htmlFor={id} className="text-[15px] font-bold">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {values.map((v) => (
            <motion.span layout key={v} initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} className="inline-flex items-center gap-0.5 rounded-full bg-text py-0.5 pl-3 pr-0.5 text-[13px] font-bold text-bg">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid h-8 w-8 place-items-center rounded-full border-0 bg-transparent text-bg">
                <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
        className="min-h-11 rounded-full border border-divider bg-bg px-4 text-[15px] outline-none focus:border-accent"
      />
      {left.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={`Suggestions for ${label}`}>
          {left.slice(0, 8).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="min-h-9 rounded-full border border-dashed border-neutral-500 bg-transparent px-3 text-[12px] font-bold">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small labelled field row for forms inside settings groups. */
export function FieldRow({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <span className="text-[13px] font-bold text-neutral-700">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-neutral-700">{hint}</span>}
    </div>
  );
}

export const inputCls = 'min-h-12 w-full rounded-full border border-divider bg-bg px-[18px] text-[16px] text-text outline-none transition-colors focus:border-accent';

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
