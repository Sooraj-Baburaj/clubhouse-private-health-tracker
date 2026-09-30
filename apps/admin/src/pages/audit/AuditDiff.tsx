import { cn } from '@/lib/cn';

const MAX_LINES = 4;
const MAX_CHARS = 42;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function short(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s;
}

function Val({ v, side }: { v: unknown; side: 'from' | 'to' }) {
  const empty = v === null || v === undefined;
  return <span className={cn('break-all', empty || side === 'from' ? 'text-muted' : 'text-ink')}>{short(v)}</span>;
}

function pretty(v: unknown): string {
  if (v === undefined) return '—';
  try {
    return JSON.stringify(v, null, 2) ?? '—';
  } catch {
    return String(v);
  }
}

/**
 * Compact before → after. Objects show only the keys that changed (`key: old → new`, truncated) with the
 * full JSON in an expander; primitives render as `a → b`; null/undefined as —.
 */
export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  if ((before === null || before === undefined) && (after === null || after === undefined)) return <span className="text-[13px] text-muted">—</span>;

  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter((k) => !same(b[k], a[k]));
    const shown = keys.slice(0, MAX_LINES);
    return (
      <div className="flex min-w-0 flex-col gap-1 font-mono text-[12px] leading-snug">
        {keys.length === 0 ? (
          <span className="text-muted">No field changes</span>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {shown.map((k) => (
              <li key={k} className="min-w-0">
                <span className="text-muted">{k}:</span> <Val v={b[k]} side="from" /> <span aria-label="changed to" className="text-accent">→</span> <Val v={a[k]} side="to" />
              </li>
            ))}
            {keys.length > MAX_LINES && <li className="text-muted">+{keys.length - MAX_LINES} more</li>}
          </ul>
        )}
        <details className="group">
          <summary className="w-fit cursor-pointer list-none font-sans text-[12px] font-semibold text-accent hover:text-accent-dark [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Full JSON</span>
            <span className="hidden group-open:inline">Hide JSON</span>
          </summary>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(['Before', 'After'] as const).map((label) => (
              <div key={label} className="flex min-w-0 flex-col gap-1">
                <span className="th">{label}</span>
                <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-[10px] bg-bg p-2 text-[11px] leading-relaxed">{pretty(label === 'Before' ? before : after)}</pre>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }

  return (
    <span className="font-mono text-[12px]" title={`${pretty(before)} → ${pretty(after)}`}>
      <Val v={before} side="from" /> <span aria-label="changed to" className="text-accent">→</span> <Val v={after} side="to" />
    </span>
  );
}
