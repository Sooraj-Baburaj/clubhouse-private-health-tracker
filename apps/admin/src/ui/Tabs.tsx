import { motion } from 'motion/react';
import { useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabDef<V extends string = string> {
  value: V;
  label: ReactNode;
  count?: number | null;
  hidden?: boolean;
}

/**
 * Accessible tab list (roving focus with arrow keys, Home/End). The active tint springs between tabs.
 * Render the panel yourself; give it `id={tabPanelId(idBase, value)}` via the returned helper if needed.
 */
export function Tabs<V extends string>({ tabs, value, onChange, label, className }: { tabs: TabDef<V>[]; value: V; onChange: (v: V) => void; label: string; className?: string }) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = tabs.filter((t) => !t.hidden);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % visible.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = visible.length - 1;
    if (next >= 0) {
      e.preventDefault();
      const t = visible[next];
      if (t) {
        onChange(t.value);
        refs.current[next]?.focus();
      }
    }
  };
  return (
    <div role="tablist" aria-label={label} className={cn('flex w-fit max-w-full self-start gap-1 overflow-x-auto rounded-full border border-border bg-white p-1 [scrollbar-width:none]', className)}>
      {visible.map((t, i) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn('relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors', on ? 'text-accent-dark' : 'text-muted hover:text-ink')}
          >
            {on && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-full bg-accent-tint" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative">{t.label}</span>
            {t.count != null && t.count > 0 && <span className="relative rounded-full bg-white/80 px-1.5 font-mono text-[10px] text-accent-dark">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Fade/slide wrapper for tab panels. */
export function TabPanel({ children, k, className }: { children: ReactNode; k: string; className?: string }) {
  return (
    <motion.div key={k} role="tabpanel" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }} className={cn('flex min-w-0 flex-col gap-4', className)}>
      {children}
    </motion.div>
  );
}

/** Single-select pill group (radiogroup semantics). */
export function Segmented<V extends string>({ options, value, onChange, label, className, size = 'md' }: { options: { value: V; label: ReactNode }[]; value: V; onChange: (v: V) => void; label: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex w-fit max-w-full flex-wrap self-start gap-1 rounded-full border border-border bg-white p-1', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn('rounded-full font-semibold transition-colors', size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]', on ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
