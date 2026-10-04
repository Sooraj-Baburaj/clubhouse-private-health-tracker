import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'motion/react';
import { useState, type ReactNode } from 'react';
import type { AdminHabitDto, HabitCustomOrderDto } from '@clubhouse/contracts';
import { useSetHabitOrder, useSyncHabitOrders } from '@/features/habits';
import { cn } from '@/lib/cn';
import { fmtRelative, plural } from '@/lib/format';
import { Button, DrawerPanel, IconButton, PersonCell } from '@/ui';
import { HabitIcon, scheduleLabel } from './shared';

/** Vertical drag list with a grip handle; the handle also moves its row with ↑/↓ and there are explicit arrow buttons. */
function SortableList<T extends { id: string }>({ items, onChange, label, render }: { items: T[]; onChange: (next: T[]) => void; label: string; render: (item: T) => ReactNode }) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    onChange(next);
  };
  return (
    <Reorder.Group as="ol" axis="y" values={items} onReorder={onChange} aria-label={label} className="m-0 flex list-none flex-col gap-1.5 p-0">
      {items.map((item, i) => (
        <SortableRow key={item.id} item={item} index={i} count={items.length} move={move}>
          {render(item)}
        </SortableRow>
      ))}
    </Reorder.Group>
  );
}

function SortableRow<T extends { id: string }>({ item, index, count, move, children }: { item: T; index: number; count: number; move: (from: number, to: number) => void; children: ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="flex select-none items-center gap-2 rounded-[12px] border border-border bg-white py-2 pl-1.5 pr-2"
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 32px rgba(23,23,28,0.12)', zIndex: 1 }}
    >
      <button
        type="button"
        aria-label={`Drag to reorder, position ${index + 1} of ${count}. Arrow keys move it.`}
        onPointerDown={(e) => controls.start(e)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(index, index + (e.key === 'ArrowUp' ? -1 : 1));
          }
        }}
        className="grid h-9 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-[8px] text-muted hover:bg-bg hover:text-ink active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <span className="w-5 shrink-0 text-right font-mono text-[12px] text-muted">{index + 1}</span>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 gap-0.5">
        <IconButton label="Move up" size={30} disabled={index === 0} onClick={() => move(index, index - 1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton label="Move down" size={30} disabled={index === count - 1} onClick={() => move(index, index + 1)}>
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </Reorder.Item>
  );
}

/** Arrange the team order: the order every member sees unless they arranged their own. */
export function ArrangeHabitsDrawer({ open, habits, customCount, onClose }: { open: boolean; habits: AdminHabitDto[]; customCount: number; onClose: () => void }) {
  const save = useSetHabitOrder();
  const [items, setItems] = useState(habits);
  // Start from the latest catalogue each time the drawer opens (adjust state during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setItems(habits);
  }
  const changed = items.map((h) => h.id).join() !== habits.map((h) => h.id).join();
  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      eyebrow="Team order"
      title="Arrange habits"
      subtitle="Members see their tiles in this order. Drag a row, or use the arrows."
      footer={
        <>
          <span className="text-[12px] leading-relaxed text-muted">{customCount ? `${plural(customCount, 'member')} arranged their own order and won’t see this change until synced.` : 'Everyone follows this order.'}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button disabled={!changed} loading={save.isPending} onClick={() => save.mutate(items.map((h) => h.id), { onSuccess: onClose })}>
              Save order
            </Button>
          </div>
        </>
      }
    >
      <SortableList
        label="Habit order"
        items={items}
        onChange={setItems}
        render={(h) => (
          <div className={cn('flex min-w-0 items-center gap-2.5', !h.enabled && 'opacity-45')}>
            <HabitIcon icon={h.icon} hue={h.hue} size={30} className="rounded-[9px]" />
            <div className="flex min-w-0 flex-col leading-snug">
              <span className="truncate text-[14px] font-semibold">{h.name}</span>
              <span className="truncate text-[12px] text-muted">
                {h.group} · {scheduleLabel(h)}
                {!h.enabled && ' · off'}
              </span>
            </div>
          </div>
        )}
      />
    </DrawerPanel>
  );
}

/** Members on their own order: see how they arranged it and put them back on the team order, one by one or all. */
export function CustomOrdersDrawer({ open, orders, onClose }: { open: boolean; orders: HabitCustomOrderDto[]; onClose: () => void }) {
  const sync = useSyncHabitOrders();
  const busyFor = (id: string) => sync.isPending && sync.variables?.length === 1 && sync.variables[0] === id;
  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      eyebrow="Own orders"
      title="Members who arranged their own"
      subtitle="Their list no longer follows the team order. Syncing puts it back on yours; they can rearrange again later."
      footer={
        orders.length > 1 ? (
          <>
            <span className="text-[12px] text-muted">Recorded in the audit log.</span>
            <Button loading={sync.isPending && !sync.variables} onClick={() => sync.mutate(undefined, { onSuccess: onClose })}>
              Sync everyone ({orders.length})
            </Button>
          </>
        ) : undefined
      }
    >
      {orders.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">Everyone follows the team order.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {orders.map((o) => (
            <li key={o.person.id} className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-white p-3.5">
              <div className="flex items-center justify-between gap-3">
                <PersonCell person={o.person} size={30} sub={o.orderedAt ? `Arranged ${fmtRelative(o.orderedAt).toLowerCase()}` : 'Own order'} />
                <Button size="sm" variant="secondary" loading={busyFor(o.person.id)} disabled={sync.isPending} onClick={() => sync.mutate([o.person.id], { onSuccess: () => orders.length === 1 && onClose() })}>
                  Sync to team order
                </Button>
              </div>
              <ol aria-label={`${o.person.name}’s order`} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {o.order.map((h, i) => (
                  <li key={h.id} title={h.name} className="inline-flex items-center gap-1 rounded-full bg-bg py-[3px] pl-1.5 pr-2.5 text-[12px]">
                    <span className="font-mono text-[10px] text-muted">{i + 1}</span>
                    <span aria-hidden>{h.icon}</span>
                    {h.name}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </DrawerPanel>
  );
}
