import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function StatTile({ label, value, sub, tone = 'surface', className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'surface' | 'accent' | 'accent2' | 'dark' | 'accent2-tint'; className?: string }) {
  const t = { surface: 'bg-surface text-text', accent: 'bg-accent text-on-accent', accent2: 'bg-accent-2 text-on-accent', dark: 'bg-text text-bg', 'accent2-tint': 'bg-accent-2-200 text-accent-2-900' }[tone];
  const subTone = tone === 'accent' || tone === 'accent2' ? 'text-on-accent-sub' : tone === 'dark' ? 'text-neutral-300' : 'text-neutral-700';
  return (
    <div className={cn('flex flex-col rounded-[24px] px-3 py-3.5', t, className)}>
      <span className={cn('text-[11px] font-bold', subTone)}>{label}</span>
      <span className="font-heading text-[20px] leading-tight tabular">{value}</span>
      {sub && <span className={cn('text-[12px]', subTone)}>{sub}</span>}
    </div>
  );
}
