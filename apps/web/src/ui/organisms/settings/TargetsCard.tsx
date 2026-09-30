import { Info, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@clubhouse/ui';
import { fmt, fmtG } from '@/features/format';
import { Spinner } from '@/ui/atoms/Spinner';

export interface TargetsLike {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  explanation?: string;
  floorHit?: boolean;
  floor?: number | null;
  paceCapped?: boolean;
}

/** Resulting targets with the plain-language explanation and floor / pace notices (SYS-CALC-*). */
export function TargetsCard({ t, title = 'Your daily targets', was, loading }: { t: TargetsLike; title?: string; was?: number | null; loading?: boolean }) {
  return (
    <motion.div layout className="flex flex-col gap-2.5 rounded-[28px] bg-accent p-4 text-on-accent" aria-live="polite">
      <span className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-on-accent-sub">
        {title}
        {loading && <Spinner className="h-3.5 w-3.5" />}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-[40px] leading-none tabular">
          <AnimatedNumber value={t.kcal} />
        </span>
        <span className="text-[14px] font-bold text-on-accent-sub">kcal a day</span>
        {was != null && was !== t.kcal && <span className="text-[13px] font-bold text-on-accent-sub">(now {fmt(was)})</span>}
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-[12px]">
        {(
          [
            ['Protein', t.protein],
            ['Carbs', t.carbs],
            ['Fat', t.fat],
            ['Fibre', t.fibre],
          ] as const
        ).map(([l, v]) => (
          <span key={l} className="flex flex-col rounded-[16px] bg-[color-mix(in_srgb,var(--color-bg)_30%,transparent)] px-2 py-1.5">
            <span className="font-bold text-on-accent-sub">{l}</span>
            <span className="font-heading text-[16px] tabular">{fmtG(v)}</span>
          </span>
        ))}
      </div>
      {t.explanation && <span className="text-[13px] font-semibold">{t.explanation.charAt(0).toUpperCase() + t.explanation.slice(1)}.</span>}
      {t.floorHit && (
        <span className="flex items-start gap-1.5 text-[12px] font-semibold text-on-accent-sub">
          <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
          Held at the safe floor{t.floor ? ` of ${fmt(t.floor)} kcal` : ''} — we never go lower, even if it means a slower pace.
        </span>
      )}
      {t.paceCapped && (
        <span className="flex items-start gap-1.5 text-[12px] font-semibold text-on-accent-sub">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
          We eased the pace to a safe 1 kg a week at most.
        </span>
      )}
    </motion.div>
  );
}
