import type { UseQueryResult } from '@tanstack/react-query';
import { AlertCircle, Inbox, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { errorMessage, isForbidden } from '@/lib/errors';
import { Button } from './Button';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn('skeleton h-4', className)} style={style} />;
}

/** Table-shaped skeleton. */
export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-hairline px-5 py-3.5 last:border-b-0">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="skeleton h-3.5" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
          <div className="skeleton ml-auto h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('flex flex-col gap-3 rounded-[16px] border border-border bg-card p-5', className)}>
      <div className="skeleton h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3.5" style={{ width: `${55 + ((i * 23) % 40)}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, icon, className, compact }: { title: ReactNode; body?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <div className="grid h-11 w-11 place-items-center rounded-full bg-bg text-muted">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <div className="text-[15px] font-semibold">{title}</div>
      {body && <div className="max-w-[420px] text-[13px] leading-relaxed text-muted">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, compact }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const forbidden = isForbidden(error);
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <div className="grid h-11 w-11 place-items-center rounded-full bg-accent-tint text-accent-dark">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="text-[15px] font-semibold">{forbidden ? 'This needs a Super Admin' : 'Couldn’t load this'}</div>
      <div className="max-w-[420px] text-[13px] leading-relaxed text-muted">{forbidden ? 'Ask a Super Admin if you need access.' : errorMessage(error)}</div>
      {onRetry && !forbidden && (
        <Button variant="secondary" size="sm" icon={<RotateCw className="h-3.5 w-3.5" />} onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Renders loading / error (with retry) / empty / data for a TanStack query.
 * `skeleton` defaults to table rows; `isEmpty` + `empty` show an empty state.
 */
export function QueryView<T>({ query, children, skeleton, isEmpty, empty, errorCompact }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; skeleton?: ReactNode; isEmpty?: (d: T) => boolean; empty?: ReactNode; errorCompact?: boolean }) {
  if (query.isPending) return <>{skeleton ?? <SkeletonRows />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact={errorCompact} />;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return <>{children(query.data)}</>;
}
