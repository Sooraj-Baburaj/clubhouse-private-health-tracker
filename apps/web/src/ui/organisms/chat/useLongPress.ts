import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '@clubhouse/ui';

/**
 * Long-press (and right-click) opens a menu. Returns handlers to spread on the element plus `consumed()`, which a click
 * handler can call to skip the click that follows a long-press.
 */
export function useLongPress(onLongPress: () => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  return {
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          fired.current = true;
          haptic(12);
          onLongPress();
          clear();
        }, ms);
      },
      onPointerMove: (e: ReactPointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        clear();
        fired.current = true;
        onLongPress();
      },
    },
    consumed: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}
