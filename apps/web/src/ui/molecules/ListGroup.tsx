import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Grouped rows in the design's settings style: uppercase group title over a 28 px-radius surface. */
export function ListGroup({ title, children, className, footer }: { title?: string; children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-1.5', className)}>
      {title && <h2 className="px-1.5 font-body text-[12px] font-bold uppercase tracking-[0.1em] text-neutral-700">{title}</h2>}
      <div className="flex flex-col rounded-[28px] bg-surface py-1">{children}</div>
      {footer && <div className="px-2 text-[12px] text-neutral-700">{footer}</div>}
    </section>
  );
}

export function ListRow({ title, sub, right, onClick, chevron, className, as = 'div' }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; chevron?: boolean; className?: string; as?: 'div' | 'button' | 'label' }) {
  const Comp = onClick ? 'button' : as;
  return (
    <Comp type={Comp === 'button' ? 'button' : undefined} onClick={onClick} className={cn('flex min-h-14 w-full items-center gap-3 border-0 bg-transparent px-4 py-3 text-left', onClick && 'active:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]', className)}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold">{title}</span>
        {sub && <span className="text-[12px] text-neutral-700">{sub}</span>}
      </span>
      {right}
      {chevron && <ChevronRight aria-hidden className="h-4 w-4 text-neutral-600" strokeWidth={2.75} />}
    </Comp>
  );
}
