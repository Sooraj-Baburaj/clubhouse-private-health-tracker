import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { Spinner } from '@/ui/atoms/Spinner';

/** The photo that goes with this log (uploaded or kept from AI recognition). */
export function AttachedPhoto({ url, status, onRemove }: { url: string; status: 'uploading' | 'ready' | 'failed' | 'local'; onRemove: () => void }) {
  const text = status === 'uploading' ? 'Attaching photo…' : status === 'failed' ? 'Photo couldn’t attach — the log saves without it' : 'Photo attached';
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-[26px] bg-surface p-2 pr-1">
      <img src={url} alt="Your meal" className="h-14 w-14 shrink-0 rounded-full object-cover" />
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[14px] font-bold" role="status">
        {status === 'uploading' && <Spinner className="h-4 w-4 shrink-0" />}
        <span className={status === 'failed' ? 'text-band-red-fg' : undefined}>{text}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label="Remove photo" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-700">
        <X className="h-4 w-4" strokeWidth={2.75} />
      </button>
    </motion.div>
  );
}
