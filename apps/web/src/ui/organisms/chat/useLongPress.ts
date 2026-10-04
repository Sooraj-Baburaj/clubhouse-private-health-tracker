import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '@clubhouse/ui';

const noSelect = (e: Event) => e.preventDefault();

/**
 * While a finger is held down for a long-press, nothing on the page may be selected. Without this, iOS/Android still
 * select (and highlight) the nearest selectable text once their own long-press fires, which is slightly after ours.
 * Stays on until the finger lifts, not just until the menu opens. See `.long-pressing` in globals.css.
 */
export const pressGuard = {
  hold() {
    document.documentElement.classList.add('long-pressing');
    document.addEventListener('selectstart', noSelect);
    // The menu that opens can take the pointer away from the pressed element, so also release on any lift.
    window.addEventListener('pointerup', pressGuard.release, true);
    window.addEventListener('pointercancel', pressGuard.release, true);
  },
  release() {
    document.documentElement.classList.remove('long-pressing');
    document.removeEventListener('selectstart', noSelect);
    window.removeEventListener('pointerup', pressGuard.release, true);
    window.removeEventListener('pointercancel', pressGuard.release, true);
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  },
};

/** Classes for a long-press target: no selection, no callout, and decorative children don't steal the touch. */
export const LONG_PRESS_CLASS = 'select-none [-webkit-touch-callout:none] [&_img]:pointer-events-none [&_svg]:pointer-events-none';

/**
 * Long-press (and right-click) opens a menu. Returns handlers to spread on the element plus `consumed()`, which a click
 * handler can call to skip the click that follows a long-press.
 */
export function useLongPress(onLongPress: () => void, ms = 480) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  const end = () => {
    cancel();
    pressGuard.release();
  };
  // The window listeners in pressGuard release the page even if this element unmounts mid-press.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return {
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        if (e.pointerType !== 'mouse') pressGuard.hold();
        timer.current = setTimeout(() => {
          fired.current = true;
          haptic(12);
          onLongPress();
          cancel();
        }, ms);
      },
      onPointerMove: (e: ReactPointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) end();
      },
      onPointerUp: end,
      onPointerCancel: end,
      onPointerLeave: end,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        cancel();
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
