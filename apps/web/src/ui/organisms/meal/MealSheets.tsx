import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import type { Nutrients } from '@clubhouse/contracts';
import { addDays } from '@clubhouse/domain';
import { ZERO } from '@/features/food';
import { dateLabel } from '@/features/format';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { MemberSheet } from '@/ui/molecules/MemberSheet';

const numOrNull = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Quick add: the calories (required), with an optional name and macros under "Add details". */
export function QuickAddSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, n: Nutrients) => void }) {
  const [f, setF] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fresh form each time it opens (adjust state during render on the open transition).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setF({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
      setMore(false);
      setError(null);
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const kcal = numOrNull(f.kcal);
    if (kcal == null || kcal <= 0 || kcal > 10000) return setError('Add the calories — anything from 1 to 10,000.');
    onAdd(f.name, { ...ZERO, kcal, protein: numOrNull(f.protein) ?? 0, carbs: numOrNull(f.carbs) ?? 0, fat: numOrNull(f.fat) ?? 0 });
    onClose();
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError(null);
  };
  return (
    <MemberSheet open={open} onClose={onClose} title="Quick add">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <span className="text-[13px] leading-snug text-neutral-700">Just the calories — handy when you know the number from a menu or packet.</span>
        <label className={cn('flex min-h-[60px] items-center gap-2.5 rounded-full border bg-surface px-5', error ? 'border-band-red' : 'border-divider')}>
          <input value={f.kcal} onChange={set('kcal')} inputMode="numeric" autoFocus placeholder="0" aria-label="Calories" aria-invalid={!!error} className="min-w-0 flex-1 border-0 bg-transparent font-heading text-[28px] outline-none" />
          <span className="font-bold text-neutral-700">kcal</span>
        </label>
        {error && (
          <span role="alert" className="px-2 text-[13px] font-bold text-band-red-fg">
            {error}
          </span>
        )}
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex min-h-10 items-center gap-1 self-start border-0 bg-transparent px-1 text-[13px] font-bold text-accent-700">
          Add details (optional)
          <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform', more && 'rotate-180')} strokeWidth={2.75} />
        </button>
        <AnimatePresence initial={false}>
          {more && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 overflow-hidden">
              <TextField label="What was it?" value={f.name} onChange={set('name')} placeholder="Wedding buffet, office cake…" maxLength={120} />
              <div className="grid grid-cols-3 gap-2">
                <TextField label="Protein" inputMode="decimal" value={f.protein} onChange={set('protein')} suffix={<span className="text-neutral-700">g</span>} />
                <TextField label="Carbs" inputMode="decimal" value={f.carbs} onChange={set('carbs')} suffix={<span className="text-neutral-700">g</span>} />
                <TextField label="Fat" inputMode="decimal" value={f.fat} onChange={set('fat')} suffix={<span className="text-neutral-700">g</span>} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <Button type="submit" size="lg" block>
          Add to plate
        </Button>
      </form>
    </MemberSheet>
  );
}

/** When the meal was eaten: a day (today and the week before) and a time. */
export function WhenSheet({ open, onClose, today, date, time, onPick }: { open: boolean; onClose: () => void; today: string; date: string; time: string; onPick: (date: string, time: string) => void }) {
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setD(date);
      setT(time);
    }
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const label = (x: string) => (x === today ? 'Today' : x === addDays(today, -1) ? 'Yesterday' : dateLabel(x, { weekday: 'short', day: 'numeric' }));
  return (
    <MemberSheet open={open} onClose={onClose} title="When was it?">
      <div role="radiogroup" aria-label="Day" className="scroll-hidden -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {days.map((x) => (
          <button key={x} type="button" role="radio" aria-checked={d === x} onClick={() => setD(x)} className={cn('min-h-10 shrink-0 rounded-full border-0 px-3.5 text-[13px] font-bold', d === x ? 'bg-text text-bg' : 'bg-surface text-text')}>
            {label(x)}
          </button>
        ))}
      </div>
      <label className="flex min-h-14 items-center justify-between gap-3 rounded-full bg-surface px-5">
        <span className="text-[14px] font-bold">Time</span>
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} aria-label="Time" className="border-0 bg-transparent text-right text-[18px] font-bold outline-none" />
      </label>
      {d !== today && <span className="px-2 text-[12px] text-neutral-700">Logs more than two days late still count for your day, not for streaks or points.</span>}
      <Button
        size="lg"
        block
        onClick={() => {
          onPick(d, t || time);
          onClose();
        }}
      >
        Done
      </Button>
    </MemberSheet>
  );
}
