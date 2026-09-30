import { AnimatedNumber } from '@clubhouse/ui';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** KPI tile (design: 13 px label, 30 px display value, 12 px sub). Numeric values count up. */
export function KpiCard({ label, value, format, suffix, sub, loading, tone, index = 0, onClick }: { label: ReactNode; value: number | string | null | undefined; format?: (n: number) => string; suffix?: ReactNode; sub?: ReactNode; loading?: boolean; tone?: 'default' | 'warn'; index?: number; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-[13px] text-muted">{label}</span>
      {loading ? (
        <span className="skeleton my-1 h-8 w-24" />
      ) : (
        <span className={cn('font-display text-[30px] font-extrabold leading-[1.1] tracking-[-0.04em]', tone === 'warn' && 'text-accent-dark')}>
          {typeof value === 'number' ? <AnimatedNumber value={value} format={format} /> : (value ?? '—')}
          {suffix && <span className="ml-1 text-[18px] tracking-[-0.02em] text-muted">{suffix}</span>}
        </span>
      )}
      {sub && <span className="text-[12px] text-muted">{loading ? <span className="skeleton inline-block h-3 w-32" /> : sub}</span>}
    </>
  );
  const cls = 'flex min-w-0 flex-col gap-1.5 rounded-[16px] border border-border bg-card p-[18px] text-left';
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04, duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} className="min-w-0">
      {onClick ? (
        <button type="button" onClick={onClick} className={cn(cls, 'w-full transition-colors hover:border-accent-border')}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </motion.div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>{children}</div>;
}
