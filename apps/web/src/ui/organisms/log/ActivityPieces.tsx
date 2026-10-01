import { Minus, Pencil, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ActivityTypeDto, PlanItemDto } from '@clubhouse/contracts';
import { AnimatedNumber } from '@clubhouse/ui';
import { fmt } from '@/features/format';
import { cn } from '@/lib/cn';
import { Tag } from '@/ui/atoms/Badges';
import { ChipRow } from '@/ui/atoms/Chip';
import { ActivityIcon } from '@/ui/molecules/ActivityIcon';
import { useListMotion } from '@/ui/organisms/today/motion';

/** Planned activities first: "Gym · 3 of 5 this week". */
export function PlanChips({ items, selected, onPick }: { items: PlanItemDto[]; selected: string | null; onPick: (item: PlanItemDto) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">From your plan</span>
      <ChipRow label="Planned activities">
        {items.map((i) => {
          const on = selected === i.itemId;
          return (
            <motion.button
              key={i.itemId}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={on}
              onClick={() => onPick(i)}
              className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-colors', on ? 'bg-accent-2 text-on-accent2-fill' : 'bg-accent-2-200 text-accent-2-900')}
            >
              <ActivityIcon icon={i.icon} className="h-4 w-4" />
              {i.typeName} · {i.done} of {i.target} {i.perMonth && !i.perWeek ? 'this month' : 'this week'}
            </motion.button>
          );
        })}
      </ChipRow>
    </div>
  );
}

/** 4-column activity type grid; the selected type turns accent-2. */
export function ActivityTypeGrid({ types, value, onPick }: { types: ActivityTypeDto[]; value: string | null; onPick: (t: ActivityTypeDto) => void }) {
  const m = useListMotion(0.02);
  return (
    <motion.div variants={m.container} initial="hidden" animate="show" role="radiogroup" aria-label="Activity" className="grid grid-cols-4 gap-2">
      {types.map((t) => {
        const on = value === t.id;
        return (
          <motion.button
            key={t.id}
            variants={m.item}
            type="button"
            role="radio"
            aria-checked={on}
            whileTap={{ scale: 0.94 }}
            onClick={() => onPick(t)}
            className={cn('flex min-h-16 flex-col items-center justify-center gap-1 rounded-[24px] px-1 py-2.5 text-[13px] font-bold transition-colors', on ? 'bg-accent-2 text-on-accent2-fill' : 'bg-surface text-text')}
          >
            <ActivityIcon icon={t.icon} className="h-5 w-5" />
            <span className="max-w-full truncate">{t.name}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}

/** Duration stepper: ±5 minutes around a 64 px number you can also type into. */
export function DurationPicker({ value, onChange, children }: { value: number; onChange: (v: number) => void; children?: React.ReactNode }) {
  const clamp = (v: number) => Math.max(1, Math.min(720, Math.round(v)));
  const [text, setText] = useState(String(value));
  // Mirror outside changes into the text (adjust state during render when the value changes).
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-[32px] bg-surface p-[18px]">
      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700" id="duration-label">
        Duration
      </span>
      <div className="flex items-center gap-[18px]" role="group" aria-labelledby="duration-label">
        <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => onChange(clamp(value - 5))} disabled={value <= 1} aria-label="5 minutes less" className="grid h-[52px] w-[52px] place-items-center rounded-full border border-divider disabled:opacity-40">
          <Minus className="h-5 w-5" strokeWidth={3} />
        </motion.button>
        <label className="flex min-w-[110px] items-baseline justify-center">
          <span className="sr-only">Minutes</span>
          <input
            value={text}
            inputMode="numeric"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
              setText(digits);
              if (digits) onChange(clamp(Number(digits)));
            }}
            onBlur={() => setText(String(value))}
            className="w-[3ch] border-0 bg-transparent text-center font-heading text-[64px] leading-none text-text outline-none tabular"
          />
          <span className="text-[16px] text-neutral-700"> min</span>
        </label>
        <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => onChange(clamp(value + 5))} aria-label="5 minutes more" className="grid h-[52px] w-[52px] place-items-center rounded-full bg-accent text-on-accent-fill">
          <Plus className="h-5 w-5" strokeWidth={3} />
        </motion.button>
      </div>
      {children}
    </div>
  );
}

/** Accent-2 "Estimated burn" card from the logic engine; tap the number to set your own (flagged). */
export function BurnCard({ kcal, met, weightKg, minutes, override, onOverride }: { kcal: number; met: number; weightKg: number; minutes: number; override: number | null; onOverride: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  const shown = override ?? kcal;
  const commit = () => {
    const n = Number(text);
    setEditing(false);
    if (text.trim() && Number.isFinite(n) && n >= 0 && n <= 10000 && Math.round(n) !== kcal) onOverride(Math.round(n));
  };
  return (
    <motion.div layout className="flex flex-col gap-0.5 rounded-[32px] bg-accent-2 px-5 py-[18px] text-on-accent">
      <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">
        {override != null ? 'Your number' : 'Estimated burn'}
        {override != null && <Tag tone="dark" className="px-2 py-0 text-[10px] normal-case tracking-normal">edited</Tag>}
      </span>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
          className="flex items-baseline gap-2"
        >
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 5))}
            onBlur={commit}
            inputMode="numeric"
            aria-label="Calories burned"
            className="w-[5ch] rounded-[16px] border-0 bg-[color-mix(in_srgb,var(--color-bg)_35%,transparent)] px-2 font-heading text-[48px] leading-[1.05] text-on-accent outline-none tabular"
          />
          <span className="font-heading text-[24px]">kcal</span>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setText(String(shown));
            setEditing(true);
          }}
          aria-label={`${fmt(shown)} kcal burned. Tap to set your own number`}
          className="flex items-center gap-2 self-start text-left font-heading text-[48px] leading-[1.05] tabular"
        >
          <AnimatedNumber value={shown} /> kcal
          <Pencil className="h-5 w-5 opacity-60" strokeWidth={2.75} aria-hidden />
        </button>
      )}
      <span className="text-[12px] text-on-accent-sub">
        {override != null ? (
          <>
            The logic engine said {fmt(kcal)} kcal.{' '}
            <button type="button" onClick={() => onOverride(null)} className="min-h-8 font-bold underline underline-offset-2">
              Use the estimate
            </button>
          </>
        ) : (
          `MET ${met} × ${Math.round(weightKg)} kg × ${minutes} min · logic engine`
        )}
      </span>
    </motion.div>
  );
}
