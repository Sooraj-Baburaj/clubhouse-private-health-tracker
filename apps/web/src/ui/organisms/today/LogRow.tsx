import { MoreHorizontal } from 'lucide-react';
import { motion, useReducedMotion, type PanInfo } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { haptic } from '@clubhouse/ui';
import { cn } from '@/lib/cn';
import { LONG_PRESS_CLASS, pressGuard } from '@/ui/organisms/chat/useLongPress';

const LONG_PRESS_MS = 450;

/**
 * A "Logged" row. Swipe left, long-press, or tap (keyboard: Enter/Space) opens the row's actions. The swipe reveals an
 * actions hint behind the row and springs back. With `onTap`, a tap does that instead (a meal opens to edit) and the
 * actions stay on swipe and long-press, plus a keyboard-reachable Actions button.
 */
export function LogRow({ lead, title, meta, right, label, onOpen, onTap }: { lead: ReactNode; title: ReactNode; meta?: ReactNode; right: ReactNode; label: string; onOpen: () => void; onTap?: () => void }) {
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const end = () => {
    clear();
    pressGuard.release();
  };
  // The window listeners in pressGuard release the page even if this element unmounts mid-press.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    if (e.pointerType !== 'mouse') pressGuard.hold();
    timer.current = setTimeout(() => {
      suppressClick.current = true;
      haptic(12);
      onOpen();
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) end();
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
        aria-haspopup={onTap ? undefined : 'dialog'}
        drag={reduce ? false : 'x'}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.4, right: 0 }}
        dragSnapToOrigin
        onDragStart={() => {
          end();
          suppressClick.current = true;
        }}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          (onTap ?? onOpen)();
        }}
        whileTap={{ scale: 0.99 }}
        className={cn('relative flex min-h-14 w-full items-center gap-2.5 border-b border-divider bg-bg py-2.5 text-left text-[14px]', LONG_PRESS_CLASS)}
        style={{ touchAction: 'pan-y' }}
      >
        <span className="w-[92px] shrink-0 text-[12px] text-neutral-700">{lead}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 font-semibold">{title}</span>
          {meta && <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-700">{meta}</span>}
        </span>
        <span className="shrink-0 font-bold tabular">{right}</span>
      </motion.button>
      {onTap && (
        <button type="button" onClick={onOpen} aria-haspopup="dialog" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:right-0 focus-visible:top-1/2 focus-visible:z-10 focus-visible:-translate-y-1/2 focus-visible:rounded-full focus-visible:bg-accent-200 focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-[13px] focus-visible:font-bold focus-visible:text-accent-800">
          Actions
        </button>
      )}
    </div>
  );
}
