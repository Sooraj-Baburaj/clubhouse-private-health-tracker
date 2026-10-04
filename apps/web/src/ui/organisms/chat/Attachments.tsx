import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, ImageOff, Utensils } from 'lucide-react';
import { useState } from 'react';
import type { AttachmentDto, MealSlot } from '@clubhouse/contracts';
import { Bar, Dialog } from '@clubhouse/ui';
import { dateLabel, fmt, SLOT_LABEL } from '@/features/format';
import { ActivityIcon } from '@/ui/molecules/ActivityIcon';
import { cn } from '@/lib/cn';

/** Warm the browser cache for an image the member is about to open. */
const preload = (url: string | null) => {
  if (url) new Image().src = url;
};

const slotName = (s: string | null) => (s && s in SLOT_LABEL ? SLOT_LABEL[s as MealSlot] : 'Meal');

/** Renders one chat attachment. `own` = inside the member's own (accent) bubble. */
export function AttachmentView({ a, own, authorId }: { a: AttachmentDto; own: boolean; authorId: string | null }) {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(false);
  const openDay = (date: string | null, mine: boolean) => {
    if (!date) return;
    if (mine) void navigate({ to: '/', search: { date } });
    else if (authorId) void navigate({ to: '/team/$memberId', params: { memberId: authorId }, search: { date } });
  };
  const pill = (tone: 'food' | 'act') =>
    cn('inline-flex min-h-8 max-w-full items-center gap-1.5 self-start rounded-full py-1 pl-1 pr-3 text-left text-[12px] font-bold', own ? 'bg-bg text-text' : tone === 'act' ? 'bg-accent-2-200 text-accent-2-800' : 'bg-accent-200 text-accent-800');

  switch (a.type) {
    case 'food_log':
      if (a.removed) return <span className={cn(pill('food'), 'pl-3 italic opacity-70')}>Log removed</span>;
      return (
        <button type="button" className={pill('food')} onClick={() => openDay(a.date, a.mine)} aria-label={`${slotName(a.mealSlot)}: ${a.items.join(', ')}, ${fmt(a.kcal)} kcal. Open that day`}>
          {a.thumbUrl ? <img src={a.thumbUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <Utensils aria-hidden className="ml-1.5 h-3.5 w-3.5" strokeWidth={2.75} />}
          <span className="truncate">
            {a.items.slice(0, 2).join(', ') || slotName(a.mealSlot)}
            {a.items.length > 2 ? ` +${a.items.length - 2}` : ''} · {fmt(a.kcal)} kcal
          </span>
        </button>
      );
    case 'activity_log':
      if (a.removed) return <span className={cn(pill('act'), 'pl-3 italic opacity-70')}>Log removed</span>;
      return (
        <button type="button" className={pill('act')} onClick={() => openDay(a.date, a.mine)} aria-label={`${a.typeName ?? 'Activity'}, ${a.durationMin ?? 0} minutes, ${fmt(a.kcal)} kcal. Open that day`}>
          <span className="ml-1.5">
            <ActivityIcon icon={a.icon ?? 'activity'} className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">
            {a.typeName ?? 'Activity'}
            {a.durationMin ? ` · ${a.durationMin} min` : ''}
            {a.distanceKm ? ` · ${a.distanceKm} km` : ''} · {fmt(a.kcal)} kcal
          </span>
        </button>
      );
    case 'day_card': {
      const pct = a.targetKcal ? a.eaten.kcal / a.targetKcal : 0;
      return (
        <button
          type="button"
          onClick={() => openDay(a.date, own)}
          className={cn('flex w-[220px] max-w-full flex-col gap-1.5 rounded-[20px] p-3 text-left', own ? 'bg-bg text-text' : 'bg-bg text-text')}
          aria-label={`Day card for ${a.name}, ${dateLabel(a.date)}: ${fmt(a.eaten.kcal)} of ${a.targetKcal ? fmt(a.targetKcal) : 'no'} target, ${fmt(a.burned)} burned`}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-700">
            <CalendarDays aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
            {a.name} · {dateLabel(a.date, { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <span className="font-heading text-[22px] leading-none tabular">
            {fmt(a.eaten.kcal)}
            <span className="font-body text-[12px] text-neutral-700">{a.targetKcal ? ` / ${fmt(a.targetKcal)} kcal` : ' kcal'}</span>
          </span>
          {a.targetKcal ? <Bar value={pct} height={6} className="bg-neutral-300" fillStyle={{ background: 'var(--color-accent)' }} /> : null}
          <span className="text-[12px] text-neutral-700">
            {fmt(a.burned)} burned · {a.logged} logged{a.bandLabel ? ` · ${a.bandLabel}` : ''}
          </span>
        </button>
      );
    }
    case 'image':
      if (a.expired || !(a.thumbUrl ?? a.url))
        return (
          <span className="flex h-[120px] w-[200px] max-w-full flex-col items-center justify-center gap-1 rounded-[18px] bg-neutral-200 text-[12px] font-bold text-neutral-700">
            <ImageOff aria-hidden className="h-5 w-5" strokeWidth={2.75} />
            Photo expired
          </span>
        );
      return (
        <>
          {/* Most chat photos are scrolled past, so the tile shows the 400 px thumbnail and the full image only loads on
              open. Touching the tile starts that download, a head start of the tap's duration. */}
          <button type="button" onPointerDown={() => preload(a.url)} onClick={() => setZoom(true)} className="block overflow-hidden rounded-[18px] border-0 bg-transparent p-0" aria-label="Open photo">
            {/* A fixed square box keeps the list from jumping as photos load. */}
            <img src={a.thumbUrl ?? a.url ?? ''} alt="Shared photo" draggable={false} loading="lazy" decoding="async" className="aspect-square w-[220px] max-w-full object-cover" />
          </button>
          <Dialog open={zoom} onClose={() => setZoom(false)} label="Photo" className="max-w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-[28px] bg-surface" backdropClassName="bg-[rgba(10,8,6,0.8)]">
            <button type="button" onClick={() => setZoom(false)} className="block border-0 bg-transparent p-0" aria-label="Close photo">
              <img src={a.url ?? a.thumbUrl ?? ''} alt="Shared photo, full size" className="max-h-[80dvh] w-full object-contain" />
            </button>
          </Dialog>
        </>
      );
    case 'meme':
      return (
        <span className="flex flex-col gap-1">
          {a.url ? <img src={a.url} alt={a.caption || 'Meme'} draggable={false} width={a.width ?? undefined} height={a.height ?? undefined} loading="lazy" decoding="async" className="max-h-[220px] w-[220px] max-w-full rounded-[18px] object-cover" /> : <span className="grid h-[150px] w-[220px] max-w-full place-items-center rounded-[18px] bg-neutral-200 text-[12px] font-bold text-neutral-700">Meme</span>}
          {a.caption && <span className="text-[13px] font-bold">{a.caption}</span>}
        </span>
      );
  }
}
