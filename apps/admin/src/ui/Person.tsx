import type { PersonRef } from '@clubhouse/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { initialsOf } from '@/lib/format';

export function Avatar({ person, size = 32, className }: { person: Pick<PersonRef, 'name' | 'initials' | 'avatarUrl'> | null | undefined; size?: number; className?: string }) {
  const initials = person?.initials || initialsOf(person?.name ?? '?');
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-hairline font-semibold text-ink', className)} style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}>
      {person?.avatarUrl ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : initials}
    </span>
  );
}

/** Avatar + name + optional sub line (design: member table first column). */
export function PersonCell({ person, sub, size = 32, className, dim }: { person: PersonRef | null | undefined; sub?: ReactNode; size?: number; className?: string; dim?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', dim && 'opacity-55', className)}>
      <Avatar person={person} size={size} />
      <div className="flex min-w-0 flex-col leading-[1.3]">
        <span className="truncate font-semibold">{person?.name ?? 'Unknown'}</span>
        {sub && <span className="truncate text-[12px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}
