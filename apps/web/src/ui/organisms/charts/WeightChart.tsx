import { motion, useReducedMotion } from 'motion/react';
import { scaleLinear } from '@clubhouse/ui';
import { daysBetween } from '@clubhouse/domain';
import type { WeightProgressResponse } from '@clubhouse/contracts';
import { dateLabel } from '@/features/format';

const W = 320;
const H = 180;
const PAD = { l: 10, r: 10, t: 16, b: 14 };

export interface WeightChartProps {
  points: WeightProgressResponse['points'];
  forecast: WeightProgressResponse['forecast']['series'];
  goalKg: number | null;
  goalEtaDate: string | null;
  /** kg → display value (kg or lb). */
  show: (kg: number) => number;
  unit: string;
  animKey: string;
}

/** Weight trend (APP-PROG-01): raw dots, EMA trend, dashed goal, dashed forecast with a shaded ± band. */
export function WeightChart({ points, forecast, goalKg, goalEtaDate, show, unit, animKey }: WeightChartProps) {
  const reduce = useReducedMotion();
  const first = points[0]?.date ?? forecast[0]?.date;
  if (!first) return null;
  const lastDate = forecast.length ? forecast[forecast.length - 1]!.date : points[points.length - 1]!.date;
  const span = Math.max(1, daysBetween(first, lastDate));
  const xd = scaleLinear([0, span], [PAD.l, W - PAD.r]);
  const x = (d: string) => xd(daysBetween(first, d));
  const vals = [...points.flatMap((p) => [p.kg, p.trend]), ...forecast.flatMap((f) => [f.lowKg, f.highKg]), ...(goalKg != null ? [goalKg] : [])];
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const padY = Math.max(0.4, (hi - lo) * 0.12);
  lo -= padY;
  hi += padY;
  const y = scaleLinear([lo, hi], [H - PAD.b, PAD.t]);
  const pt = (d: string, kg: number) => `${x(d).toFixed(1)},${y(kg).toFixed(1)}`;

  const trendPath = points.length ? `M${points.map((p) => pt(p.date, p.trend)).join(' L')}` : '';
  const last = points[points.length - 1];
  const fc = last ? [{ date: last.date, kg: last.trend, lowKg: last.trend, highKg: last.trend }, ...forecast] : forecast;
  const fcPath = fc.length > 1 ? `M${fc.map((f) => pt(f.date, f.kg)).join(' L')}` : '';
  const band = fc.length > 1 ? `${fc.map((f) => pt(f.date, f.highKg)).join(' ')} ${[...fc].reverse().map((f) => pt(f.date, f.lowKg)).join(' ')}` : '';
  const goalY = goalKg != null ? y(goalKg) : null;
  const etaX = goalEtaDate && goalEtaDate <= lastDate && goalEtaDate >= first ? x(goalEtaDate) : null;

  const fmtW = (kg: number) => (Math.round(show(kg) * 10) / 10).toFixed(1);
  const aria = [
    points.length ? `Weight trend from ${fmtW(points[0]!.trend)} to ${fmtW(last!.trend)} ${unit}` : 'No weigh-ins yet',
    goalKg != null ? `goal ${fmtW(goalKg)} ${unit}` : null,
    goalEtaDate ? `forecast to reach it by ${dateLabel(goalEtaDate, { day: 'numeric', month: 'short' })}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const draw = reduce ? { duration: 0 } : { duration: 0.9, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] };

  return (
    <svg key={animKey} width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="block overflow-visible">
      {goalY != null && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={goalY} y2={goalY} stroke="var(--color-accent-2)" strokeWidth={2} strokeDasharray="3 5" strokeLinecap="round" />
          <text x={W - PAD.r} y={goalY - 6} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--color-accent-2-700)">
            Goal {fmtW(goalKg!)}
          </text>
        </g>
      )}
      {band && <motion.polygon points={band} fill="var(--color-accent-2)" initial={{ opacity: 0 }} animate={{ opacity: 0.16 }} transition={reduce ? { duration: 0 } : { delay: 0.7, duration: 0.4 }} />}
      {fcPath && (
        <motion.path d={fcPath} fill="none" stroke="var(--color-neutral-500)" strokeWidth={3} strokeDasharray="6 6" strokeLinecap="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={reduce ? { duration: 0 } : { delay: 0.75, duration: 0.35 }} />
      )}
      {points.map((p, i) => (
        <motion.circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r={2.6} fill="var(--color-neutral-500)" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} transition={reduce ? { duration: 0 } : { delay: 0.1 + (i / Math.max(1, points.length)) * 0.6 }} />
      ))}
      {trendPath && <motion.path d={trendPath} fill="none" stroke="var(--color-accent)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={draw} />}
      {last && <motion.circle cx={x(last.date)} cy={y(last.trend)} r={6} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={3} initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={reduce ? { duration: 0 } : { delay: 0.85, type: 'spring', stiffness: 420, damping: 20 }} />}
      {etaX != null && goalY != null && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={reduce ? { duration: 0 } : { delay: 1 }}>
          <circle cx={etaX} cy={goalY} r={5} fill="var(--color-accent-2)" />
          <text x={Math.min(etaX, W - PAD.r - 30)} y={goalY + 18} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--color-accent-2-800)">
            {dateLabel(goalEtaDate!, { day: 'numeric', month: 'short' })}
          </text>
        </motion.g>
      )}
    </svg>
  );
}
