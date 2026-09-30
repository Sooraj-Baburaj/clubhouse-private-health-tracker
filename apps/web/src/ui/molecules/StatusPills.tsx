import { CloudOff, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useSyncExternalStore } from 'react';
import { useOnline } from '@clubhouse/ui';
import { outbox } from '@/infrastructure/outbox';

/** SYS-PWA-02/03: offline pill and "syncing" state for queued writes. */
export function ConnectivityPill() {
  const online = useOnline();
  const box = useSyncExternalStore(outbox.subscribe, outbox.get, outbox.get);
  const pending = box.pending.filter((o) => !o.failed).length;
  const failed = box.pending.filter((o) => o.failed).length;
  const show = !online || pending > 0 || failed > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          role="status"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-text px-3 py-1.5 text-[12px] font-bold text-bg shadow-md"
        >
          {!online ? <CloudOff className="h-3.5 w-3.5" strokeWidth={3} /> : <RefreshCw className={`h-3.5 w-3.5 ${box.syncing ? 'animate-spin' : ''}`} strokeWidth={3} />}
          {!online ? `Offline${pending ? ` · ${pending} saved to sync` : ''}` : failed ? `${failed} couldn’t sync` : `Syncing ${pending}…`}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function usePendingIds(): Set<string> {
  const box = useSyncExternalStore(outbox.subscribe, outbox.get, outbox.get);
  return new Set(box.pending.map((o) => o.id));
}
