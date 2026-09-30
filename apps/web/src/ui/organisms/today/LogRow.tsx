import { MoreHorizontal } from 'lucide-react';
import { motion, useReducedMotion, type PanInfo } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { haptic } from '@clubhouse/ui';

const LONG_PRESS_MS = 450;

/**
 * A "Logged" row. Swipe left, long-press, or tap (keyboard: Enter/Space) opens the row's actions. The swipe reveals an
 * actions hint behind the row and springs back.
 */
export function LogRow({ lead, title, meta, right, label, onOpen }: { lead: ReactNode; title: ReactNode; meta?: ReactNode; right: ReactNode; label: string; onOpen: () => void }) {
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => {
      suppressClick.current = true;
      haptic(12);
      onOpen();
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -56 || info.velocity.x < -500) {
      haptic(8);
      onOpen();
    }
  };

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-y-1 right-0 flex items-center gap-1.5 rounded-[18px] bg-accent-200 px-4 text-[12px] font-bold text-accent-800">
        <MoreHorizontal className="h-4 w-4" strokeWidth={2.75} />
        Actions
      </div>
      <motion.button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        drag={reduce ? false : 'x'}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.4, right: 0 }}
        dragSnapToOrigin
        onDragStart={() => {
          clear();
          suppressClick.current = true;
        }}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={clear}
        onPointerCancel={clear}
        onPointerLeave={clear}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onOpen();
        }}
        whileTap={{ scale: 0.99 }}
        className="relative flex min-h-14 w-full items-center gap-2.5 border-b border-divider bg-bg py-2.5 text-left text-[14px]"
        style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', userSelect: 'none' }}
      >
        <span className="w-[92px] shrink-0 text-[12px] text-neutral-700">{lead}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold">{title}</span>
          {meta && <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-700">{meta}</span>}
        </span>
        <span className="shrink-0 font-bold tabular">{right}</span>
      </motion.button>
    </div>
  );
}
