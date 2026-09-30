import type { Transition, Variants } from 'motion/react';

/** Motion spec (plan §6). Every animated component takes its timing from here. */
export const duration = { fast: 0.15, base: 0.25, slow: 0.4, confetti: 0.9 } as const;
export const ease = {
  standard: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  emphasized: [0.32, 0.72, 0, 1] as [number, number, number, number],
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
};
export const spring = {
  sheet: { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as Transition,
  card: { type: 'spring', stiffness: 300, damping: 26 } as Transition,
  snappy: { type: 'spring', stiffness: 520, damping: 36 } as Transition,
  soft: { type: 'spring', stiffness: 180, damping: 22 } as Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.standard } },
  exit: { opacity: 0, y: -8, transition: { duration: duration.fast, ease: ease.exit } },
};

export const stagger = (step = 0.03, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const tabPane: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0, transition: { duration: duration.base, ease: ease.standard } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24, transition: { duration: duration.fast, ease: ease.exit } }),
};

export const stackScreen: Variants = {
  enter: { x: '100%', opacity: 0.6 },
  center: { x: 0, opacity: 1, transition: spring.sheet },
  exit: { x: '30%', opacity: 0, transition: { duration: duration.fast, ease: ease.exit } },
};

export const pressable = { whileTap: { scale: 0.97 }, transition: { duration: duration.fast } } as const;

/** Reduced motion: collapse everything to a short opacity fade. */
export const reducedFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.12 } },
};
