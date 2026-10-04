import { GripVertical } from 'lucide-react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import type { HabitDayResponse } from '@clubhouse/contracts';
import { Button } from '@/ui/atoms/Button';
import { HabitChip } from './HabitPieces';

type Item = HabitDayResponse['arrangement'][number];

/**
 * Arrange mode for the tile grid: one list of every habit on the member's list (also ones not due today), dragged by
 * the grip; the grip also moves its row with ↑/↓. Saving makes it the member's own order until they reset it.
 */
export function ArrangeHabits({ arrangement, customOrder, saving, onSave, onReset, onCancel }: { arrangement: Item[]; customOrder: boolean; saving: boolean; onSave: (ids: string[]) => void; onReset: () => void; onCancel: () => void }) {
  const [items, setItems] = useState(arrangement);
  const changed = items.map((i) => i.id).join() !== arrangement.map((i) => i.id).join();
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    setItems(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 px-1.5">
        <span className="font-heading text-[20px] leading-tight">Arrange your habits</span>
        <span className="text-[13px] text-neutral-700">
          Drag by the handle. This includes habits that aren’t due today.{' '}
          {customOrder ? 'You’re on your own order, so your admin’s changes won’t move it.' : 'Once you save, your admin’s changes to the order won’t move yours.'}
        </span>
      </div>
      <Reorder.Group as="ol" axis="y" values={items} onReorder={setItems} aria-label="Your habit order" className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item, i) => (
          <Row key={item.id} item={item} index={i} count={items.length} move={move} />
        ))}
      </Reorder.Group>
      <div className="flex gap-2.5 pt-1">
        <Button variant="secondary" block onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button block loading={saving} disabled={!changed} onClick={() => onSave(items.map((i) => i.id))}>
          Save order
        </Button>
      </div>
      {customOrder && (
        <Button variant="ghost" onClick={onReset} disabled={saving} className="self-center">
          Use the team order again
        </Button>
      )}
    </div>
  );
}

function Row({ item, index, count, move }: { item: Item; index: number; count: number; move: (from: number, to: number) => void }) {
  const controls = useDragControls();
  const reduce = useReducedMotion();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      whileDrag={reduce ? undefined : { scale: 1.03, boxShadow: '0 14px 36px rgba(10,8,6,0.22)' }}
      className="relative flex min-h-16 select-none items-center gap-3 rounded-[24px] bg-surface py-2.5 pl-3 pr-1.5 [-webkit-touch-callout:none]"
    >
      <HabitChip icon={item.icon} group={item.group} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{item.name}</span>
        <span className="text-[12px] text-neutral-700">{item.group}</span>
      </span>
      <button
        type="button"
        aria-label={`Move ${item.name}, position ${index + 1} of ${count}. Drag, or use the arrow keys.`}
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(index, index + (e.key === 'ArrowUp' ? -1 : 1));
          }
        }}
        className="grid h-12 w-12 shrink-0 cursor-grab touch-none place-items-center rounded-full text-neutral-700 active:cursor-grabbing"
      >
        <GripVertical className="h-5 w-5" strokeWidth={2.5} aria-hidden />
      </button>
    </Reorder.Item>
  );
}
