import { motion, useReducedMotion } from 'motion/react';
import { useCountUp } from './hooks';
import { spring } from './motion';

export function AnimatedNumber({ value, format = (n: number) => Math.round(n).toLocaleString('en-IN'), decimals }: { value: number; format?: (n: number) => string; decimals?: number }) {
  const v = useCountUp(value, { decimals });
  return <>{format(v)}</>;
}

/** Circular progress ring; `value` 0..1. Colours from CSS variables via props. */
export function Ring({ value, size = 150, stroke = 14, track = 'var(--ring-track)', color = 'var(--ring-fill)', label, children }: { value: number; size?: number; stroke?: number; track?: string; color?: string; label: string; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div role="img" aria-label={label} style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={reduce ? { duration: 0 } : spring.soft}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

/** Horizontal bar that springs to its width; `pulseKey` changes replay the 400 ms save pulse. */
export function Bar({ value, className = '', fillClassName = '', fillStyle, height = 10, label, pulseKey }: { value: number; className?: string; fillClassName?: string; fillStyle?: React.CSSProperties; height?: number; label?: string; pulseKey?: string | number }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={className} role={label ? 'img' : undefined} aria-label={label} style={{ height, borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
      <motion.div
        key={pulseKey}
        className={fillClassName}
        initial={reduce ? false : { width: 0, opacity: 0.85 }}
        animate={{ width: `${pct}%`, opacity: 1, scaleY: reduce ? 1 : [1, 1.35, 1] }}
        transition={reduce ? { duration: 0 } : { width: spring.soft, scaleY: { duration: 0.4 } }}
        style={{ height: '100%', borderRadius: 999, transformOrigin: 'center', ...fillStyle }}
      />
    </div>
  );
}

export function Sparkline({ values, width = 120, height = 32, color = 'currentColor', label }: { values: number[]; width?: number; height?: number; color?: string; label: string }) {
  if (values.length < 2) return <svg width={width} height={height} role="img" aria-label={label} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <motion.polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
    </svg>
  );
}

export interface LinePoint {
  x: number;
  y: number;
}

/** Map data to a viewBox; used by the weight chart and the admin spend chart. */
export function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}
