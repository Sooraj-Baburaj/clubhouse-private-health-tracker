import { cn } from '@/lib/cn';

export function Avatar({ name, initials, url, size = 46, ring, active, className }: { name: string; initials: string; url?: string | null; size?: number; ring?: boolean; active?: boolean; className?: string }) {
  return (
    <span
      title={name}
      className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-full font-extrabold', active ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-700', ring && (active ? 'ring-2 ring-accent' : 'ring-2 ring-neutral-300'), className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.33) }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" /> : <span aria-hidden>{initials}</span>}
      <span className="sr-only">{name}</span>
    </span>
  );
}
