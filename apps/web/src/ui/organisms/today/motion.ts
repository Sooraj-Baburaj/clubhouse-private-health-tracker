import { useReducedMotion, type Variants } from 'motion/react';
import { fadeUp, reducedFade, stagger } from '@clubhouse/ui';

const still: Variants = { hidden: {}, show: {} };

/** Staggered list entrance (30 ms per item, plan §6); collapses to a short fade with reduced motion. */
export function useListMotion(step = 0.03, delay = 0) {
  const reduce = !!useReducedMotion();
  return { container: reduce ? still : stagger(step, delay), item: reduce ? reducedFade : fadeUp, reduce };
}
