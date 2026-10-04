import { AlertTriangle, Check, Circle, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type PillTone = 'neutral' | 'ink' | 'accent' | 'outline' | 'in' | 'under' | 'over' | 'none' | 'ai' | 'recipe' | 'muted';

const TONES: Record<PillTone, string> = {
  neutral: 'bg-hairline text-ink',
  ink: 'bg-ink text-white',
  accent: 'bg-accent-tint text-accent-dark',
  outline: 'border border-border bg-white text-ink',
  in: 'bg-in-bg text-in-fg',
  under: 'bg-under-bg text-under-fg',
  over: 'bg-over-bg text-over-fg',
  none: 'bg-none-bg text-none-fg',
  ai: 'bg-ai-bg text-ai-fg',
  recipe: 'bg-recipe-bg text-recipe-fg',
  muted: 'bg-bg text-muted border border-hairline',
};

/** 12 px / 600 pill (design: role and band pills). */
export function Pill({ tone = 'neutral', children, icon, className, title }: { tone?: PillTone; children: ReactNode; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full shrink-0 items-center gap-1 justify-self-start whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold leading-[1.35]', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export type BandKey = 'in' | 'under' | 'over' | 'none' | 'green' | 'yellow' | 'red' | 'neutral';

const BAND_MAP: Record<BandKey, { tone: PillTone; label: string; Icon: typeof Check }> = {
  in: { tone: 'in', label: 'In range', Icon: Check },
  green: { tone: 'in', label: 'On track', Icon: Check },
  under: { tone: 'under', label: 'Under', Icon: Minus },
  yellow: { tone: 'under', label: 'A bit off', Icon: Minus },
  over: { tone: 'over', label: 'Over', Icon: AlertTriangle },
  red: { tone: 'over', label: 'Over', Icon: AlertTriangle },
  none: { tone: 'none', label: 'Not logged', Icon: Circle },
  neutral: { tone: 'none', label: 'No target', Icon: Circle },
};

/** Band pill: colour + icon + words, never colour alone. */
export function BandPill({ band, label, className }: { band: BandKey; label?: string | null; className?: string }) {
  const b = BAND_MAP[band];
  return (
    <Pill tone={b.tone} className={className} icon={<b.Icon aria-hidden className="h-3 w-3" strokeWidth={2.5} />}>
      {label || b.label}
    </Pill>
  );
}

const ROLE: Record<string, { tone: PillTone; label: string }> = {
  super_admin: { tone: 'ink', label: 'Super Admin' },
  admin: { tone: 'accent', label: 'Admin' },
  member: { tone: 'neutral', label: 'Member' },
};

export function RolePill({ role }: { role: string }) {
  const r = ROLE[role] ?? { tone: 'neutral' as PillTone, label: role };
  return <Pill tone={r.tone}>{r.label}</Pill>;
}

const STATUS: Record<string, PillTone> = {
  active: 'in',
  invited: 'under',
  deactivated: 'none',
  draft: 'under',
  published: 'in',
  archived: 'none',
  pending: 'under',
  approved: 'in',
  accepted: 'in',
  declined: 'none',
  dismissed: 'none',
  open: 'over',
  ok: 'in',
  failed: 'over',
  running: 'under',
};

/** Generic status pill; unknown statuses render neutral. */
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS[status] ?? 'neutral';
  return <Pill tone={tone}>{label ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}</Pill>;
}

/** Small "AI" chip for AI-produced content and AI settings (ADM-ACC-04). `feature` shows on hover. */
export function AiChip({ feature, className, label = 'AI' }: { feature?: string | null; className?: string; label?: string }) {
  return (
    <span
      title={feature ? `AI feature: ${feature}` : 'Produced by AI'}
      aria-label={feature ? `AI (${feature})` : 'AI'}
      className={cn('inline-flex shrink-0 items-center rounded-[6px] bg-ai-bg px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ai-fg', className)}
    >
      {label}
    </span>
  );
}
