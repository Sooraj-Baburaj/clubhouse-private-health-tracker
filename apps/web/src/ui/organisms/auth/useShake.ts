import { useAnimationControls, useReducedMotion } from 'motion/react';

/** Error shake for forms (login). Reduced motion gets no movement; the inline message still announces it. */
export function useShake() {
  const controls = useAnimationControls();
  const reduce = useReducedMotion();
  const shake = () => {
    if (reduce) return;
    void controls.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.45, ease: 'easeInOut' } });
  };
  return { controls, shake };
}
