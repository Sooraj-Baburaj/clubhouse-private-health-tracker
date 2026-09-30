import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Glass card on a blurred accent-tint blob (design: Sign in). */
export function AuthLayout({ children, label }: { children: ReactNode; label: string }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-32 h-[520px] w-[520px] rounded-full bg-accent-tint opacity-70 blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full bg-[#efe9fb] opacity-60 blur-[90px]" />
      <motion.section
        aria-label={label}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="relative flex w-full max-w-[400px] flex-col gap-4 rounded-[32px] border border-white/70 bg-white/60 p-9 shadow-[0_24px_80px_rgba(182,49,108,0.12)] backdrop-blur-[20px] max-sm:p-7"
      >
        {children}
      </motion.section>
    </main>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[12px] bg-accent-tint px-3.5 py-2.5 text-[13px] font-semibold text-accent-dark">
      {message}
    </div>
  );
}
