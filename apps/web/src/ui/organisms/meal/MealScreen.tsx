import { ChevronLeft, Clock, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { MEAL_SLOTS, type FoodSearchResult, type MealSlot } from '@clubhouse/contracts';
import { addDays } from '@clubhouse/domain';
import { cartTotals, isDish, quickAddItem } from '@/features/food';
import { clockLabel, fmt, timeOf } from '@/features/format';
import { useMealDraft } from '@/features/mealDraft';
import { memberNow } from '@/features/summary';
import { useMealFlow } from '@/pages/log/mealFlow';
import { IconButton } from '@/ui/atoms/IconButton';
import { Button } from '@/ui/atoms/Button';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { SlotChips } from '@/ui/organisms/log/SlotChips';
import { shortDay } from '@/ui/organisms/today/dates';
import { MealSearch } from './MealSearch';
import { QuickAddSheet, WhenSheet } from './MealSheets';
import { PhotoCard } from './PhotoCard';
import { PickFoodSheet } from './PickFoodSheet';
import { PlateList } from './PlateList';
import { SnapPill } from './SnapPill';

/**
 * The meal (design 2c): which meal and when, its photo, what's on the plate with live totals, and the ways to add more
 * — search, usuals, a dish, a new food, quick add, my foods. Snap and "Add to …" float at the bottom.
 */
export function MealScreen({ initialQuery, autoFocus }: { initialQuery?: string; autoFocus: boolean }) {
  const flow = useMealFlow();
  const { draft, me, editing } = flow;
  const patch = useMealDraft((s) => s.patch);
  const [sheet, setSheet] = useState<'quick' | 'when' | 'mine' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { focusTick, view } = flow;
  useEffect(() => {
    if (focusTick && !view) searchRef.current?.focus({ preventScroll: false });
  }, [focusTick, view]);

  const tz = me.profile.timezone || me.team.timezone;
  const now = memberNow(me);
  const labels = Object.fromEntries(MEAL_SLOTS.map((s) => [s, flow.slotLabel(s)])) as Record<MealSlot, string>;
  const slot = flow.slotLabel(draft.slot);
  const { photo, plate } = draft;
  const emptyPhoto = !!photo && plate.length === 0;
  const time = draft.time ?? (editing ? timeOf(editing.loggedAt, tz) : now.time);
  const day = draft.date === now.date ? 'Today' : draft.date === addDays(now.date, -1) ? 'Yesterday' : shortDay(draft.date);
  const kcal = cartTotals(plate).kcal;
  const attaching = photo?.status === 'local' || photo?.status === 'uploading';
  const openResult = (r: FoodSearchResult) => (r.recipeId ? flow.openDish({ recipeId: r.recipeId }) : flow.openView('item', { food: r.id, into: 'plate' }));

  return (
    <div className="flex min-h-full flex-col gap-3.5 px-5 pb-[120px] pt-2">
      <div className="flex items-center gap-2.5">
        <IconButton label="Back" onClick={flow.exitFlow}>
          <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h1 className="font-heading text-[26px] leading-[1.1]">{slot}</h1>
          <button type="button" onClick={() => setSheet('when')} aria-label={`Change time, ${day} ${clockLabel(time)}`} className="flex min-h-9 items-center gap-1.5 rounded-full border-0 bg-surface px-3 text-[13px] font-bold text-text">
            <Clock aria-hidden className="h-3.5 w-3.5" strokeWidth={2.75} />
            {day} · {clockLabel(time)}
          </button>
        </div>
        {editing && (
          <IconButton label="Delete this meal" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </IconButton>
        )}
      </div>
      <SlotChips value={draft.slot} onChange={(s) => patch({ slot: s })} labels={labels} />

      {photo && <PhotoCard photo={photo} photoAi={flow.photoAi} onRetake={() => flow.openView('snap')} onRemove={flow.removePhoto} />}
      {emptyPhoto && (
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-[22px]">What’s on the plate?</h2>
          <span className="text-[13px] leading-snug text-neutral-700">{flow.photoAi ? 'Add what you ate — the photo stays on the meal.' : 'AI is off, so you add the foods. It only takes a few taps.'}</span>
        </div>
      )}
      {plate.length > 0 && <PlateList plate={plate} onOpen={(i) => (isDish(i) ? flow.openDish({ line: i }) : flow.openView('item', { row: i.key, into: 'plate', ...(i.foodId ? { food: i.foodId } : {}) }))} onRemove={flow.removeItem} />}

      <MealSearch
        key={flow.searchKey}
        slot={draft.slot}
        title={emptyPhoto ? null : plate.length ? 'Add more' : 'Add food'}
        autoFocus={autoFocus}
        showRecents={emptyPhoto}
        initialQuery={flow.searchKey ? '' : initialQuery}
        inputRef={searchRef}
        onOpen={openResult}
        onAdd={flow.addResult}
        onAddUsual={flow.addUsual}
        onMakeDish={() => flow.openDish()}
        onCreate={(name) => flow.openView('create', { into: 'plate', ...(name ? { name: name.slice(0, 80) } : {}) })}
        onQuick={() => setSheet('quick')}
        onMine={() => setSheet('mine')}
        onParse={flow.textAi ? flow.parseText : undefined}
        parsing={flow.parsing}
      />

      {emptyPhoto && (!editing || editing.pendingDetails) && (
        <div className="mt-1 flex flex-col gap-1.5">
          <Button variant="secondary" size="lg" block className="text-[16px]" loading={flow.saving} disabled={attaching} onClick={flow.finishLater}>
            {attaching ? 'Attaching photo…' : 'Finish later'}
          </Button>
          <span className="text-center text-[12px] leading-snug text-neutral-700">Saves the photo as {slot.toLowerCase()}. It counts for your streak; calories show once you add the foods.</span>
        </div>
      )}

      {/* Snap on the right, "Add to …" beside it once something is on the plate. */}
      <div className="pointer-events-none absolute inset-x-4 z-10 flex flex-row-reverse items-center justify-between gap-2.5" style={{ bottom: 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + 16px)' }}>
        <SnapPill compact={plate.length > 0} onClick={() => flow.openView('snap')} />
        <AnimatePresence>
          {plate.length > 0 && (
            <motion.button
              key="add"
              type="button"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              whileTap={{ scale: 0.97 }}
              onClick={flow.save}
              disabled={attaching || flow.saving}
              aria-busy={flow.saving || undefined}
              className="pointer-events-auto flex h-[52px] min-w-0 max-w-[340px] flex-1 items-center justify-center rounded-full border-0 bg-accent px-3.5 font-heading text-[15px] text-on-accent-fill shadow-md disabled:opacity-60 min-[400px]:text-[16px]"
            >
              {attaching ? (
                'Attaching photo…'
              ) : (
                <>
                  {/* A long meal name gives way first; the calories always show. */}
                  <span className="truncate">
                    {editing ? 'Update' : 'Add to'} {slot.toLowerCase()}
                  </span>
                  <span className="shrink-0 whitespace-pre"> · {fmt(kcal)} kcal</span>
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <QuickAddSheet open={sheet === 'quick'} onClose={() => setSheet(null)} onAdd={(name, n) => flow.addItems([quickAddItem(name, n)])} />
      <WhenSheet open={sheet === 'when'} onClose={() => setSheet(null)} today={now.date} date={draft.date} time={time} onPick={(date, t) => patch({ date, time: t })} />
      <PickFoodSheet
        open={sheet === 'mine'}
        mode="mine"
        title="My foods & recipes"
        slot={draft.slot}
        onClose={() => setSheet(null)}
        onPick={(r) => {
          setSheet(null);
          openResult(r);
        }}
        onPickRecipe={(recipe) => {
          setSheet(null);
          flow.openDish({ recipe });
        }}
        onCreate={(name) => {
          setSheet(null);
          flow.openView('create', { into: 'plate', ...(name ? { name } : {}) });
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          flow.deleteLog();
        }}
        title={`Delete this ${slot.toLowerCase()}?`}
        body="It comes off your day and your totals update straight away."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
