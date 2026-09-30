import { scaleLinear } from '@clubhouse/ui';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/cn';

export interface BarDatum {
  label: string;
  value: number;
  /** Tooltip text (title) — defaults to "label: value". */
  title?: string;
  highlight?: boolean;
}

/**
 * Vertical bar chart. Bars grow on mount (staggered), optional horizontal cap/reference line.
 * Accessible as an image with a summary label; each bar has a title tooltip.
 */
export function BarChart({ data, height = 110, cap, format = (n) => String(Math.round(n)), label, xLabels = 'ends', className, barClassName = 'bg-accent' }: { data: BarDatum[]; height?: number; cap?: { value: number; label: string } | null; format?: (n: number) => string; label: string; xLabels?: 'ends' | 'all' | 'none'; className?: string; barClassName?: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1e-9, cap?.value ?? 0, ...data.map((d) => d.value));
  const capPct = cap ? Math.min(100, (cap.value / max) * 100) : null;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div role="img" aria-label={label} className="relative flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100);
          return (
            <motion.div
              key={`${d.label}-${i}`}
              title={d.title ?? `${d.label}: ${format(d.value)}`}
              className={cn('min-w-[2px] flex-1 rounded-t-[3px]', barClassName, d.highlight ? 'opacity-100' : 'opacity-85')}
              style={{ height: `${h}%`, transformOrigin: 'bottom' }}
              initial={reduce ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : Math.min(i * 0.015, 0.45), ease: [0.2, 0.8, 0.2, 1] }}
            />
          );
        })}
        {capPct != null && cap && (
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-accent-dark" style={{ bottom: `${capPct}%` }}>
            <span className="absolute -top-[18px] right-0 rounded bg-white/90 px-1 font-mono text-[10px] text-accent-dark">{cap.label}</span>
          </div>
        )}
      </div>
      {xLabels !== 'none' && data.length > 0 && (
        <div className="flex justify-between gap-1 font-mono text-[11px] text-muted">
          {xLabels === 'ends' ? (
            <>
              <span>{data[0]?.label}</span>
              <span>{data[data.length - 1]?.label}</span>
            </>
          ) : (
            data.map((d, i) => (
              <span key={i} className="flex-1 text-center">
                {d.label}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Horizontal meter list ("spend by feature"). Bars grow on mount. */
export function MeterList({ items, format = (n) => String(Math.round(n)), label, className }: { items: { label: React.ReactNode; value: number; sub?: React.ReactNode; key?: string }[]; format?: (n: number) => string; label: string; className?: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <ul aria-label={label} className={cn('m-0 flex list-none flex-col gap-2.5 p-0', className)}>
      {items.map((it, i) => (
        <li key={it.key ?? i} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium">{it.label}</span>
            <span className="shrink-0 font-mono text-[12px] text-muted">
              {format(it.value)}
              {it.sub && <> · {it.sub}</>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-hairline">
            <motion.div className="h-full rounded-full bg-accent" initial={reduce ? false : { width: 0 }} animate={{ width: `${(it.value / max) * 100}%` }} transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.04, ease: [0.2, 0.8, 0.2, 1] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Progress bar (8 px, hairline track, accent fill; `tone="warn"` uses accent-dark). */
export function ProgressBar({ value, label, tone = 'accent', className, marker }: { value: number; label: string; tone?: 'accent' | 'warn' | 'ink'; className?: string; marker?: number | null }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn('relative h-2 rounded-full bg-hairline', className)}>
      <motion.div className={cn('h-full rounded-full', tone === 'warn' ? 'bg-accent-dark' : tone === 'ink' ? 'bg-ink' : 'bg-accent')} initial={reduce ? false : { width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }} />
      {marker != null && <span aria-hidden className="absolute -top-1 h-4 w-[2px] rounded bg-ink" style={{ left: `${Math.max(0, Math.min(100, marker * 100))}%` }} />}
    </div>
  );
}

/** Simple line chart with area fill and optional reference line; path draws on mount. */
export function LineChart({ points, height = 140, label, format = (n) => String(Math.round(n)), reference, className }: { points: { x: string; y: number }[]; height?: number; label: string; format?: (n: number) => string; reference?: { y: number; label: string } | null; className?: string }) {
  const reduce = useReducedMotion();
  const W = 600;
  const H = height;
  if (points.length === 0) return <div role="img" aria-label={label} className={className} style={{ height }} />;
  const ys = points.map((p) => p.y).concat(reference ? [reference.y] : []);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const pad = (max - min) * 0.1 || 1;
  const sx = scaleLinear([0, Math.max(1, points.length - 1)], [8, W - 8]);
  const sy = scaleLinear([min - pad, max + pad], [H - 8, 8]);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${sx(points.length - 1).toFixed(1)},${H} L${sx(0).toFixed(1)},${H} Z`;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        <path d={area} fill="var(--color-accent-tint)" opacity={0.5} />
        {reference && <line x1={0} x2={W} y1={sy(reference.y)} y2={sy(reference.y)} stroke="var(--color-accent-dark)" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        <motion.path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }} />
        {points.map((p, i) => (
          <circle key={i} cx={sx(i)} cy={sy(p.y)} r={3} fill="var(--color-accent)" vectorEffect="non-scaling-stroke">
            <title>{`${p.x}: ${format(p.y)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between font-mono text-[11px] text-muted">
        <span>{points[0]?.x}</span>
        {reference && <span className="text-accent-dark">{reference.label}</span>}
        <span>{points[points.length - 1]?.x}</span>
      </div>
    </div>
  );
}
