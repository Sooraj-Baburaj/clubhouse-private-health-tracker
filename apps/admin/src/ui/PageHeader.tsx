import type { ReactNode } from 'react';

/** Page header: mono eyebrow in accent + 36 px Plus Jakarta Sans h1, optional description and actions. */
export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="display-1 flex flex-wrap items-center gap-3">{title}</h1>
        {description && <p className="m-0 max-w-[640px] text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      {children}
    </header>
  );
}
