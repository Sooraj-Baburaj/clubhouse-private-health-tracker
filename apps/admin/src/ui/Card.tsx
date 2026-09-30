import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** White 16 px card with a #D9D9DD border (design). */
export function Card({ children, className, padded = true, as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; padded?: boolean; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn('flex min-w-0 flex-col rounded-[16px] border border-border bg-card', padded && 'gap-3 p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Card title row: h3 + optional eyebrow/aside/actions. */
export function CardHeader({ title, eyebrow, aside, actions, className, id }: { title: ReactNode; eyebrow?: ReactNode; aside?: ReactNode; actions?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h3 id={id} className="h3 flex items-center gap-2">
          {title}
        </h3>
      </div>
      {aside && <div className="text-[13px] text-muted">{aside}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Mono "SUPER ADMIN" style tag used next to headings. */
export function SectionTag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-accent', className)}>{children}</span>;
}

/** Tinted inset block (design: password box inside drawer). */
export function Inset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2 rounded-[14px] bg-bg p-3.5', className)}>{children}</div>;
}

/** Key/value rows. */
export function KeyValues({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 min-w-0 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Responsive grid helpers matching the design's auto-fit grids. */
export function Grid({ children, min = 340, className }: { children: ReactNode; min?: number; className?: string }) {
  return (
    <div className={cn('grid items-start gap-3', className)} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}
