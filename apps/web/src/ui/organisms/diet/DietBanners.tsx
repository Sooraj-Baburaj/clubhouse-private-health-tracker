import { History, Sparkles } from 'lucide-react';
import { dateLabel } from '@/features/format';
import { AIBadge } from '@/ui/atoms/Badges';

export function SwapIdeaCard({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[28px] bg-accent-2-200 px-4 py-3.5 text-accent-2-900">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="h-4 w-4" strokeWidth={2.75} />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em]">Swap idea</span>
        <AIBadge tone="solid" />
      </div>
      <span className="text-[14px] leading-normal">{text}</span>
    </div>
  );
}

export function UpdatedBanner({ by, on, note, onViewPrevious }: { by: string; on: string; note: string | null; onViewPrevious?: () => void }) {
  return (
    <div role="status" className="flex flex-col gap-1 rounded-[22px] bg-accent-200 px-4 py-3 text-[13px] text-accent-800">
      <span>
        <b>
          Updated by {by} on {dateLabel(on.slice(0, 10), { day: 'numeric', month: 'short' })}
        </b>
        {note ? ` — ${note}` : ''}
      </span>
      {onViewPrevious && (
        <button type="button" onClick={onViewPrevious} className="inline-flex min-h-9 items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[13px] font-bold text-accent-800 underline underline-offset-2">
          <History aria-hidden className="h-4 w-4" strokeWidth={2.75} />
          View previous version
        </button>
      )}
    </div>
  );
}
