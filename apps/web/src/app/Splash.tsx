import { motion } from 'motion/react';

export function Splash({ offline }: { offline?: boolean }) {
  return (
    <div className="grid h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <svg width="120" height="44" viewBox="0 0 96 34" aria-hidden>
          <g fill="none" strokeWidth="6" strokeLinecap="round">
            <circle cx="17" cy="17" r="12" stroke="var(--color-accent)" />
            <circle cx="48" cy="17" r="12" stroke="var(--color-accent)" />
            <circle cx="79" cy="17" r="12" stroke="var(--color-neutral-300)" />
            <motion.circle cx="79" cy="17" r="12" stroke="var(--color-accent-2)" transform="rotate(-90 79 17)" initial={{ pathLength: 0.1 }} animate={{ pathLength: [0.1, 0.9, 0.1] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} />
          </g>
        </svg>
        <div className="font-heading text-[26px]">Clubhouse</div>
        {offline && <div className="text-[14px] text-neutral-700">Couldn’t reach the server. Retrying…</div>}
      </div>
    </div>
  );
}
