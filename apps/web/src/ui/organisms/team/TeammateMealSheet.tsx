import { ImageOff, X } from 'lucide-react';
import { useState } from 'react';
import type { FoodLogDto } from '@clubhouse/contracts';
import { portionText } from '@clubhouse/domain';
import { Dialog } from '@clubhouse/ui';
import { fmt, SLOT_LABEL, timeOf } from '@/features/format';
import { AIBadge } from '@/ui/atoms/Badges';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { STRIPES } from '@/ui/organisms/meal/PhotoCard';

/**
 * A teammate's meal (from their day, when they share full logs): the photo — tap for full size, like in chat — what was
 * on the plate with portions, and the totals.
 */
export function TeammateMealSheet({ log, onClose }: { log: FoodLogDto | null; onClose: () => void }) {
  const [zoom, setZoom] = useState(false);
  const photo = log && !log.imageExpired ? (log.imageUrl ?? log.thumbUrl) : null;
  const t = log?.totals;
  return (
    <MemberSheet open={!!log} onClose={onClose} title={log ? `${SLOT_LABEL[log.mealSlot]} · ${timeOf(log.loggedAt)}` : undefined}>
      {log && (
        <div className="flex flex-col gap-3.5 pb-2">
          {photo ? (
            <button type="button" onClick={() => setZoom(true)} aria-label="Open photo full size" className="block overflow-hidden rounded-[28px] border-0 p-0" style={STRIPES}>
              <img src={photo} alt={`${SLOT_LABEL[log.mealSlot]} photo`} className="max-h-[42dvh] w-full object-cover" />
            </button>
          ) : log.imageId && log.imageExpired ? (
            <span className="flex h-24 items-center justify-center gap-2 rounded-[28px] bg-surface text-[13px] font-bold text-neutral-700">
              <ImageOff aria-hidden className="h-4 w-4" strokeWidth={2.75} />
              Photo expired
            </span>
          ) : null}

          {log.pendingDetails ? (
            <p className="m-0 text-[14px] text-neutral-700">Just the photo for now — the foods are still to be added.</p>
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col rounded-[26px] bg-surface p-0 py-1">
                {log.items.map((i, n) => (
                  <li key={n} className="flex min-h-12 items-center gap-2.5 border-b border-divider px-4 py-2 last:border-0">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[15px] font-bold">
                        <span className="truncate">{i.name}</span>
                        {(i.source === 'ai' || i.aiEstimate) && <AIBadge className="shrink-0" />}
                      </span>
                      <span className="text-[12px] text-neutral-700">
                        {i.components?.length ? `${i.components.map((c) => c.name).join(', ')} · ${i.servingLabel ?? ''}` : i.servingLabel ? portionText(i.servings, { label: i.servingLabel }) : `${fmt(i.grams)} g`}
                      </span>
                    </span>
                    <span className="text-[14px] font-extrabold tabular">{fmt(i.nutrition.kcal)}</span>
                  </li>
                ))}
              </ul>
              {t && (
                <div className="flex flex-wrap items-baseline gap-2 px-1.5">
                  <span className="font-heading text-[30px] leading-none tabular">{fmt(t.kcal)}</span>
                  <span className="text-[14px] font-bold">kcal</span>
                  <span className="basis-full text-[13px] font-semibold text-neutral-700 tabular">
                    P {fmt(t.protein)} g · C {fmt(t.carbs)} g · F {fmt(t.fat)} g · Fibre {fmt(t.fibre)} g
                  </span>
                </div>
              )}
            </>
          )}

          <Dialog open={zoom && !!photo} onClose={() => setZoom(false)} label="Meal photo" className="relative max-w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-[28px] bg-surface" backdropClassName="bg-[rgba(10,8,6,0.8)]">
            {photo && <img src={photo} alt="Meal photo, full size" className="max-h-[80dvh] w-full object-contain" />}
            <button type="button" onClick={() => setZoom(false)} aria-label="Close photo" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full border-0 bg-bg text-text">
              <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
            </button>
          </Dialog>
        </div>
      )}
    </MemberSheet>
  );
}
