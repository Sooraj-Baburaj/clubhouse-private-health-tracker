import { CloudOff, RotateCw } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { NetworkError } from '@clubhouse/client';
import { fadeUp } from '@clubhouse/ui';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { cn } from '@/lib/cn';

/** Error with retry; says "offline" when the network is the problem. */
export function ErrorCard({ error, onRetry, what = 'this', className }: { error: unknown; onRetry: () => void; what?: string; className?: string }) {
  const offline = error instanceof NetworkError || (typeof navigator !== 'undefined' && !navigator.onLine);
  return (
    <div role="alert" className={cn('flex items-center gap-3 rounded-[28px] bg-surface px-4 py-4', className)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-700">
        <CloudOff aria-hidden className="h-5 w-5" strokeWidth={2.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold">{offline ? 'You’re offline' : `Couldn’t load ${what}`}</span>
        <span className="text-[12px] text-neutral-700">{offline ? 'We’ll show it as soon as you’re back.' : 'A quick retry usually sorts it.'}</span>
      </div>
      <Button size="sm" variant="secondary" icon={<RotateCw className="h-4 w-4" strokeWidth={2.75} />} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** Section heading: eyebrow + optional Caprasimo title + right-side control. */
export function SectionHead({ eyebrow, title, right, id }: { eyebrow: ReactNode; title?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <div className="flex items-end gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="eyebrow">{eyebrow}</span>
        {title && (
          <h2 id={id} className="font-heading text-[26px] leading-[1.1]">
            {title}
          </h2>
        )}
      </div>
      {right}
    </div>
  );
}

/** A section that fades up as it enters the viewport. */
export function Section({ id, label, children, className }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <motion.section id={`section-${id}`} aria-label={label} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} className={cn('flex scroll-mt-4 flex-col gap-3', className)}>
      {children}
    </motion.section>
  );
}

export function CardSkeleton({ h = 180, className }: { h?: number; className?: string }) {
  return <Skeleton h={h} r={30} className={className} />;
}
