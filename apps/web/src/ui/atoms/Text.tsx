import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Eyebrow({ children, className, tone = 'accent' }: { children: ReactNode; className?: string; tone?: 'accent' | 'muted' | 'on-accent' | 'inherit' }) {
  const color = { accent: 'text-accent-700', muted: 'text-neutral-700', 'on-accent': 'text-on-accent-sub', inherit: '' }[tone];
  return <div className={cn('text-[12px] font-bold uppercase tracking-[0.1em]', color, className)}>{children}</div>;
}

export function Display({ children, size = 28, className, as: As = 'h1' }: { children: ReactNode; size?: 17 | 18 | 19 | 20 | 22 | 24 | 26 | 28 | 30 | 32 | 36 | 46 | 64 | 96; className?: string; as?: 'h1' | 'h2' | 'h3' | 'div' | 'span' }) {
  return (
    <As className={cn('font-heading font-normal', className)} style={{ fontSize: size, lineHeight: size >= 64 ? 0.9 : size >= 36 ? 1.02 : 1.1, letterSpacing: size >= 64 ? '-0.03em' : undefined }}>
      {children}
    </As>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-neutral-700', className)}>{children}</span>;
}
