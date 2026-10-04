import { useRef } from 'react';

/** A strip along the left edge: a swipe right from it goes back (stack screens, the chat layer, meal views). */
export function EdgeSwipe({ onBack }: { onBack: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      aria-hidden
      className="absolute inset-y-0 left-0 z-10 w-4"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        if (start.current && e.clientX - start.current.x > 70 && Math.abs(e.clientY - start.current.y) < 60) onBack();
        start.current = null;
      }}
    />
  );
}
