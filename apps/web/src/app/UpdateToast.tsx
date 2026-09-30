import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { swUpdate } from '@/infrastructure/sw';

/** SYS-PWA-06: "reload for the new version" — never a forced reload mid-entry. */
export function UpdateToast() {
  const [ready, setReady] = useState(false);
  useEffect(() => swUpdate.subscribe(setReady), []);
  return (
    <AnimatePresence>
      {ready && (
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed inset-x-0 bottom-[104px] z-[800] flex justify-center px-4">
          <div role="status" className="flex items-center gap-3 rounded-full bg-text py-2 pl-4 pr-2 text-[14px] font-bold text-bg shadow-lg">
            New version ready
            <button type="button" onClick={() => swUpdate.apply()} className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] text-on-accent-fill">
              Reload
            </button>
            <button type="button" aria-label="Later" onClick={() => setReady(false)} className="px-2 text-[13px] opacity-70">
              Later
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
