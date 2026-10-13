import { motion, useReducedMotion } from 'motion/react';
import { useState, type KeyboardEvent } from 'react';
import type { ConsistencyPoint } from '@clubhouse/contracts';
import { scaleLinear } from '@clubhouse/ui';
import { dateLabel } from '@/features/format';

const W = 320;
const H = 150;
const PAD = { l: 24, r: 40, t: 12, b: 22 };
/** The profile's owner leads; the viewer is the recessive reference line (dashed, hollow markers). */
const OWNER = 'var(--color-accent-700)';
const VIEWER = 'var(--color-neutral-600)';

export const periodLabel = (start: string, period: 'week' | 'month', long = false) =>
  period === 'week' ? `${long ? 'Week of ' : ''}${dateLabel(start, { day: 'numeric', month: 'short' })}` : dateLabel(start, long ? { month: 'long', year: 'numeric' } : { month: 'short' });

/** Runs of consecutive scored points (a gap before joining or with nothing due breaks the line). */
function runs(values: (number | null | undefined)[]): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([i, v]);
  });
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Consistency over the last weeks or months, 0–100. On someone else's profile a second, dashed line is the viewer's
 * own score for the same periods. Tap or hover a period for its values; arrow keys step through them.
 */
export function ConsistencyChart({ points, period, name, compare }: { points: ConsistencyPoint[]; period: 'week' | 'month'; name: string; compare: boolean }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const x = scaleLinear([0, Math.max(1, n - 1)], [PAD.l, W - PAD.r]);
  const y = scaleLinear([0, 100], [H - PAD.b, PAD.t]);
  const step = (W - PAD.l - PAD.r) / Math.max(1, n - 1);
  const owner = points.map((p) => p.score);
  const viewer = points.map((p) => p.viewer);
  const draw = reduce ? { duration: 0 } : { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] };

  // Direct labels at each line's last point, nudged apart when they'd collide.
  const lastOf = (vals: (number | null | undefined)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return { i, v: vals[i]! };
    return null;
  };
  const lo = lastOf(owner);
  const lv = compare ? lastOf(viewer) : null;
  const top = PAD.t + 4;
  const bottom = H - PAD.b - 6;
  const clampY = (v: number) => Math.min(bottom, Math.max(top, v));
  let oy = lo ? clampY(y(lo.v)) : 0;
  let vy = lv ? clampY(y(lv.v)) : 0;
  if (lo && lv && Math.abs(oy - vy) < 13) {
    const ownerAbove = lo.v >= lv.v;
    // Keep the pair 13 apart and inside the plot (clear of the date labels below).
    const upper = Math.min(bottom - 13, Math.max(top, (oy + vy) / 2 - 6.5));
    oy = ownerAbove ? upper : upper + 13;
    vy = ownerAbove ? upper + 13 : upper;
  }

  const showTick = (i: number) => (period === 'month' ? true : (n - 1 - i) % 3 === 0);
  const fmt = (v: number | null | undefined) => (v == null ? 'not scored' : String(v));
  const summary = points.map((p) => `${periodLabel(p.start, period, true)}: ${name} ${fmt(p.score)}${compare ? `, you ${fmt(p.viewer)}` : ''}`).join('; ');
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
  };
  const a = active != null ? points[active] : null;

  const line = (vals: (number | null | undefined)[], stroke: string, dashed: boolean) =>
    runs(vals).map((r) =>
      r.length === 1 ? null : (
        <motion.path
          key={`${stroke}${r[0]![0]}`}
          d={`M${r.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray={dashed ? '4 4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={draw}
        />
      ),
    );
  const dots = (vals: (number | null | undefined)[], stroke: string, hollow: boolean) =>
    vals.map((v, i) => (v == null ? null : <circle key={`${stroke}${i}`} cx={x(i)} cy={y(v)} r={active === i ? 5 : 4} fill={hollow ? 'var(--color-surface)' : stroke} stroke={hollow ? stroke : 'var(--color-surface)'} strokeWidth={2} />));

  return (
    <div className="flex flex-col gap-2">
      {compare && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-bold text-neutral-700" aria-hidden>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="10">
              <line x1="1" x2="21" y1="5" y2="5" stroke={OWNER} strokeWidth={2} strokeLinecap="round" />
              <circle cx="11" cy="5" r="3.5" fill={OWNER} />
            </svg>
            {name}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="10">
              <line x1="1" x2="21" y1="5" y2="5" stroke={VIEWER} strokeWidth={2} strokeDasharray="4 4" strokeLinecap="round" />
              <circle cx="11" cy="5" r="3.5" fill="var(--color-surface)" stroke={VIEWER} strokeWidth={2} />
            </svg>
            You
          </span>
        </div>
      )}
      <div className="relative">
        {a && (
          <div className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[14px] bg-text px-2.5 py-1.5 text-[12px] text-bg shadow-md" style={{ left: `${(x(active!) / W) * 100}%` }}>
            <b>{periodLabel(a.start, period, true)}</b>
            <span className="block tabular">
              {name} {fmt(a.score)}
              {compare && ` · You ${fmt(a.viewer)}`}
            </span>
          </div>
        )}
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Consistency, last ${n} ${period === 'week' ? 'weeks' : 'months'}. ${summary}`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onPointerLeave={() => setActive(null)}
          className="block overflow-visible rounded-[12px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent-700"
        >
          {[0, 50, 100].map((g) => (
            <g key={g}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="var(--color-divider)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(g) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-neutral-700)" className="tabular">
                {g}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            showTick(i) ? (
              <text key={p.start} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--color-neutral-700)">
                {periodLabel(p.start, period)}
              </text>
            ) : null,
          )}
          {a && <line x1={x(active!)} x2={x(active!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-neutral-500)" strokeWidth={1} />}
          {compare && line(viewer, VIEWER, true)}
          {line(owner, OWNER, false)}
          {compare && dots(viewer, VIEWER, true)}
          {dots(owner, OWNER, false)}
          {lo && (
            <text x={x(lo.i) + 8} y={oy + 3.5} fontSize={11} fontWeight={800} fill="var(--color-text)" className="tabular">
              {compare ? `${name} ${lo.v}` : lo.v}
            </text>
          )}
          {lv && (
            <text x={x(lv.i) + 8} y={vy + 3.5} fontSize={11} fontWeight={700} fill="var(--color-neutral-700)" className="tabular">
              You {lv.v}
            </text>
          )}
          {/* Hit targets: a full-height column per period, wider than the marks. */}
          {points.map((p, i) => (
            <rect key={`hit${p.start}`} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
          ))}
        </svg>
      </div>
      <table className="sr-only">
        <caption>Consistency by {period}</caption>
        <thead>
          <tr>
            <th scope="col">{period === 'week' ? 'Week' : 'Month'}</th>
            <th scope="col">{name}</th>
            {compare && <th scope="col">You</th>}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <th scope="row">{periodLabel(p.start, period, true)}</th>
              <td>{fmt(p.score)}</td>
              {compare && <td>{fmt(p.viewer)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
