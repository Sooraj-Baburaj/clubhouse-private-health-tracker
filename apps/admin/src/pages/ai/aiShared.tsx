import { ChevronRight } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { AI_FEATURE_KEYS, AI_OUTCOMES } from '@clubhouse/contracts';
import { useAiOverview } from '@/features/ai';
import { cn } from '@/lib/cn';
import { fmtPct, humanize, todayLocal } from '@/lib/format';
import { AiChip, Pill, type PillTone } from '@/ui';

/** Outcomes that mean the call went wrong (shown in the "over" tone). */
export const ERROR_OUTCOMES = new Set<string>(['refused', 'timeout', 'error', 'invalid_output', 'lost']);
/** Outcomes where the member got the logic-only path (shown in the "under" tone). */
export const SOFT_OUTCOMES = new Set<string>(['fallback', 'budget_blocked', 'cap_blocked']);

const OUTCOME_LABELS: Record<string, string> = {
  ok: 'OK',
  pending: 'Pending',
  fallback: 'Fallback',
  refused: 'Refused',
  timeout: 'Timed out',
  error: 'Error',
  invalid_output: 'Invalid output',
  budget_blocked: 'Budget cap',
  cap_blocked: 'Daily cap',
  lost: 'Lost',
};

export function outcomeLabel(o: string): string {
  return OUTCOME_LABELS[o] ?? humanize(o);
}

export function outcomeTone(o: string): PillTone {
  if (o === 'ok') return 'in';
  if (ERROR_OUTCOMES.has(o)) return 'over';
  if (SOFT_OUTCOMES.has(o)) return 'under';
  return 'none';
}

export function OutcomePill({ outcome, title }: { outcome: string; title?: string }) {
  return (
    <Pill tone={outcomeTone(outcome)} title={title}>
      {outcomeLabel(outcome)}
    </Pill>
  );
}

export const OUTCOME_OPTIONS = [{ value: '', label: 'Any outcome' }, ...AI_OUTCOMES.map((o) => ({ value: o, label: outcomeLabel(o) }))];

/** Rates from the API are fractions (0..1). Small non-zero rates keep one decimal so they don't read as 0%. */
export function fmtRate(n: number | null | undefined): string {
  if (n == null) return '—';
  return fmtPct(n, true, n > 0 && n < 0.1 ? 1 : 0);
}

/** Feature key → display name, from the overview (falls back to a humanised key). */
export function useFeatureNames() {
  const q = useAiOverview();
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const k of AI_FEATURE_KEYS) map[k] = humanize(k);
    for (const f of q.data?.features ?? []) map[f.key] = f.name;
    return map;
  }, [q.data]);
}

export function featureOptions(names: Record<string, string>, allLabel = 'All features') {
  return [{ value: '', label: allLabel }, ...AI_FEATURE_KEYS.map((k) => ({ value: k, label: names[k] ?? k }))];
}

/** Feature name with the AI chip (key on hover) — ADM-ACC-04. */
export function FeatureName({ feature, name, className, mono }: { feature: string; name?: string; className?: string; mono?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className={cn('truncate', mono ? 'font-mono text-[12px]' : 'font-semibold')}>{name ?? humanize(feature)}</span>
      <AiChip feature={feature} />
    </span>
  );
}

/** Scrollable preformatted block for prompts / JSON. */
export function CodeBlock({ children, className, maxHeight = 320, label }: { children: ReactNode; className?: string; maxHeight?: number; label?: string }) {
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={cn('m-0 overflow-auto whitespace-pre-wrap break-words rounded-[12px] border border-hairline bg-bg p-3.5 font-mono text-[12px] leading-relaxed text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent', className)}
      style={{ maxHeight }}
    >
      {children}
    </pre>
  );
}

/** Native disclosure (keyboard + screen reader friendly) styled like the design. */
export function Disclosure({ summary, children, defaultOpen, aside }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-[14px] border border-hairline bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] px-3.5 py-2.5 text-[13px] font-semibold outline-none hover:bg-bg/60 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
          {summary}
        </span>
        {aside}
      </summary>
      <div className="px-3.5 pb-3.5">{children}</div>
    </details>
  );
}

export function prettyJson(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** First day of the current month (YYYY-MM-DD, local). */
export function monthStartLocal(): string {
  return `${todayLocal().slice(0, 8)}01`;
}

/** "2026-09" (or a date in that month) → { label: "September", days: 30 }. */
export function monthInfo(month: string | undefined, fallbackDate?: string): { label: string; days: number } {
  const src = (month && /^\d{4}-\d{2}/.test(month) ? month : fallbackDate) ?? todayLocal();
  const y = Number(src.slice(0, 4));
  const m = Number(src.slice(5, 7));
  const d = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  return { label: d.toLocaleDateString('en-IN', { month: 'long', ...(y !== new Date().getFullYear() && { year: 'numeric' }) }), days };
}

/** Small read-only note shown in place of a super-admin control. */
export function ReadOnlyNote({ children = 'Only a Super Admin can change this.' }: { children?: ReactNode }) {
  return <span className="text-[12px] text-muted">{children}</span>;
}
