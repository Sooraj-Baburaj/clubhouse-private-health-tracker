import { Check, Copy, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from '@clubhouse/ui';
import { cn } from '@/lib/cn';
import { copyText } from '@/lib/download';
import { Button } from './Button';

/** Chip editor: Enter or comma adds, Backspace on empty removes the last, × removes one. */
export function ChipInput({ value, onChange, placeholder = 'Add and press Enter', label, max, maxLength = 40, suggestions, className, disabled }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string; max?: number; maxLength?: number; suggestions?: string[]; className?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.slice(0, maxLength));
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && (max == null || next.length < max)) next.push(p);
    onChange(next);
    setDraft('');
  };
  const listId = `chip-sugg-${label.replace(/\W/g, '')}`;
  return (
    <div className={cn('flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-white px-2 py-1.5 focus-within:border-accent', disabled && 'opacity-60', className)}>
      {value.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded-full bg-bg py-[3px] pl-2.5 pr-1 text-[12px] font-semibold">
          {v}
          <button type="button" disabled={disabled} aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="grid h-4 w-4 place-items-center rounded-full text-muted hover:bg-white hover:text-ink">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        list={suggestions ? listId : undefined}
        value={draft}
        disabled={disabled || (max != null && value.length >= max)}
        placeholder={max != null && value.length >= max ? `Max ${max}` : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        className="h-7 min-w-[120px] flex-1 border-0 bg-transparent px-1 text-[13px] outline-none"
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** Multi-select as toggle chips (aria-pressed). */
export function ChipToggleGroup<V extends string>({ options, value, onChange, label, className, disabled }: { options: { value: V; label: ReactNode }[]; value: V[]; onChange: (v: V[]) => void; label: string; className?: string; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-[5px] text-[12px] font-semibold transition-colors disabled:opacity-50', on ? 'border-accent bg-accent-tint text-accent-dark' : 'border-border bg-white text-muted hover:border-accent hover:text-ink')}
          >
            {on && <Check aria-hidden className="h-3 w-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Small copy-to-clipboard button. */
export function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size={size}
      icon={done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } else toast.error('Couldn’t copy. Select the text and copy it manually.');
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

/** One-time secret (temporary password) with copy + note. */
export function SecretBox({ secret, title = 'Temporary password', note = 'Shown once. Share it privately. The member must change it on first sign-in; it expires in 7 days if unused.' }: { secret: string; title?: string; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-bg p-3.5" aria-live="polite">
      <span className="text-[13px] font-semibold">{title}</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="select-all break-all font-mono text-[15px] tracking-[0.06em]">{secret}</code>
        <CopyButton text={secret} />
      </div>
      <span className="text-[12px] leading-snug text-muted">{note}</span>
    </div>
  );
}
