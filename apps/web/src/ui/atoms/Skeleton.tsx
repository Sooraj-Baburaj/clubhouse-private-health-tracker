import { cn } from '@/lib/cn';

export function Skeleton({ className, h = 16, w = '100%', r = 16 }: { className?: string; h?: number | string; w?: number | string; r?: number }) {
  return <span aria-hidden className={cn('skeleton block', className)} style={{ height: h, width: w, borderRadius: r }} />;
}
