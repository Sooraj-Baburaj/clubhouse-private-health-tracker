import { Check, CircleAlert, Minus, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { BandDto } from '@clubhouse/contracts';
import { cn } from '@/lib/cn';

/** SYS-AI-22: small AI badge on anything AI produced. */
export function AIBadge({ className, tone = 'soft', title = 'Made with AI' }: { className?: string; tone?: 'soft' | 'solid' | 'dark'; title?: string }) {
  const t = { soft: 'bg-accent-2-200 text-accent-2-800', solid: 'bg-accent-2 text-on-accent2-fill', dark: 'bg-accent-2-700 text-accent-2-100' }[tone];
  return (
    <span title={title} aria-label={title} className={cn('inline-flex items-center gap-0.5 rounded-full px-[7px] py-[2px] align-middle text-[10px] font-extrabold tracking-[0.06em]', t, className)}>
      <Sparkles aria-hidden className="h-2.5 w-2.5" strokeWidth={3} />
      AI
    </span>
  );
}

export function Tag({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'accent2' | 'dark' | 'outline'; className?: string }) {
  const t = { neutral: 'bg-neutral-100 text-neutral-800', accent: 'bg-accent-200 text-accent-800', accent2: 'bg-accent-2-200 text-accent-2-800', dark: 'bg-text text-bg', outline: 'border border-accent text-accent-700' }[tone];
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[12px] font-bold', t, className)}>{children}</span>;
}

const BAND_STYLE: Record<BandDto['band'], string> = {
  green: 'bg-band-green-bg text-band-green-fg',
  yellow: 'bg-band-yellow-bg text-band-yellow-fg',
  red: 'bg-band-red-bg text-band-red-fg',
  neutral: 'bg-band-neutral-bg text-band-neutral-fg',
};

export function BandIcon({ icon, className }: { icon: BandDto['icon']; className?: string }) {
  const I = icon === 'check' ? Check : icon === 'alert' ? CircleAlert : icon === 'dash' ? Minus : null;
  if (!I) return <span aria-hidden className={cn('inline-block h-2 w-2 rounded-full bg-current opacity-60', className)} />;
  return <I aria-hidden className={cn('h-3.5 w-3.5', className)} strokeWidth={3} />;
}

/** SYS-CALC-22: colour is never the only cue — every band carries its label and an icon. */
export function BandPill({ band, className, label }: { band: Pick<BandDto, 'band' | 'label' | 'icon'>; className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold', BAND_STYLE[band.band], className)}>
      <BandIcon icon={band.icon} />
      {label ?? band.label}
    </span>
  );
}

export const bandFill = (band: BandDto['band']) => ({ green: 'var(--color-band-green)', yellow: 'var(--color-band-yellow)', red: 'var(--color-band-red)', neutral: 'var(--color-band-neutral)' })[band];
