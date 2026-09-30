import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** APP-FUN-02: every empty state says what to do next and shows a small illustration. */
export function EmptyState({ title, body, action, illustration = 'plate', className }: { title: string; body?: ReactNode; action?: ReactNode; illustration?: 'plate' | 'rings' | 'chat' | 'chart' | 'bell'; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex flex-col items-center gap-2 rounded-[28px] bg-surface px-6 py-8 text-center', className)}>
      <Illustration kind={illustration} />
      <div className="font-heading text-[20px] leading-tight">{title}</div>
      {body && <div className="max-w-[28ch] text-[14px] text-neutral-700">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}

function Illustration({ kind }: { kind: string }) {
  const c = 'var(--color-accent)';
  const c2 = 'var(--color-accent-2)';
  const t = 'var(--color-neutral-300)';
  if (kind === 'rings')
    return (
      <svg width="96" height="40" viewBox="0 0 96 34" aria-hidden>
        <g fill="none" strokeWidth="6" strokeLinecap="round">
          <circle cx="17" cy="17" r="12" stroke={c} />
          <circle cx="48" cy="17" r="12" stroke={t} />
          <circle cx="79" cy="17" r="12" stroke={t} />
        </g>
      </svg>
    );
  if (kind === 'chat')
    return (
      <svg width="72" height="56" viewBox="0 0 72 56" aria-hidden>
        <rect x="4" y="6" width="44" height="28" rx="14" fill={c} />
        <rect x="24" y="24" width="44" height="26" rx="13" fill={c2} />
      </svg>
    );
  if (kind === 'chart')
    return (
      <svg width="80" height="52" viewBox="0 0 80 52" aria-hidden>
        {[18, 30, 22, 40, 34].map((h, i) => (
          <rect key={i} x={6 + i * 15} y={50 - h} width="10" height={h} rx="5" fill={i === 3 ? c : t} />
        ))}
      </svg>
    );
  if (kind === 'bell')
    return (
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    );
  return (
    <svg width="80" height="56" viewBox="0 0 80 56" aria-hidden>
      <ellipse cx="40" cy="30" rx="34" ry="22" fill={t} />
      <ellipse cx="40" cy="28" rx="24" ry="15" fill="var(--color-neutral-100)" />
      <circle cx="33" cy="26" r="6" fill={c} />
      <circle cx="47" cy="30" r="5" fill={c2} />
    </svg>
  );
}
