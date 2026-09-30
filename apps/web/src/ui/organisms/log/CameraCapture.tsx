import { ImagePlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';

/** Design placeholder stripes for the photo frame, from tokens. */
export const STRIPES: CSSProperties = { background: 'repeating-linear-gradient(135deg, var(--color-neutral-300) 0 10px, var(--color-surface) 10px 20px)' };

/** "Choose a photo" fallback: the OS picker, opening the rear camera on phones. */
export function PhotoPickButton({ onFile, label = 'Choose a photo', variant = 'secondary' }: { onFile: (f: Blob) => void; label?: string; variant?: 'secondary' | 'surface' | 'dark' }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} block icon={<ImagePlus className="h-5 w-5" strokeWidth={2.75} aria-hidden />} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** Live viewfinder (rear camera) in the design's 300 px rounded frame with a 78 px shutter; falls back to the picker. */
export function CameraCapture({ onPhoto }: { onPhoto: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'live' | 'blocked'>('starting');
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('blocked');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => undefined);
        }
        setState('live');
      })
      .catch(() => !cancelled && setState('blocked'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    setFlash((f) => f + 1);
    canvas.toBlob((b) => b && onPhoto(b), 'image/jpeg', 0.92);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative flex h-[300px] items-end justify-center overflow-hidden rounded-[32px] p-[18px]" style={state === 'live' ? undefined : STRIPES}>
        <video ref={video} playsInline muted autoPlay aria-hidden className="absolute inset-0 h-full w-full object-cover" style={{ opacity: state === 'live' ? 1 : 0 }} />
        <span className="absolute left-4 top-4 rounded-full bg-neutral-100 px-2.5 py-[3px] text-[11px] font-semibold text-text">
          {state === 'live' ? 'Live camera · point at your plate' : state === 'starting' ? 'Opening the camera…' : 'Camera unavailable — choose a photo'}
        </span>
        <AIBadge className="absolute right-4 top-4" />
        <AnimatePresence>
          {flash > 0 && <motion.span key={flash} aria-hidden className="absolute inset-0 bg-neutral-100" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.35 }} />}
        </AnimatePresence>
        <motion.button
          type="button"
          onClick={snap}
          disabled={state !== 'live'}
          aria-label="Take photo"
          whileTap={{ scale: 0.9 }}
          className="relative h-[78px] w-[78px] rounded-full border-[6px] border-neutral-100 bg-accent shadow-md disabled:opacity-50"
        />
      </div>
      <PhotoPickButton onFile={onPhoto} />
    </div>
  );
}

/** Camera-first when AI photo reading is off (team switch or member opt-out): search still works; a photo can be attached. */
export function PhotoOffCard({ reason, onAttach }: { reason: 'team' | 'optout'; onAttach: (b: Blob) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-[32px] bg-surface p-5">
      <span className="font-heading text-[20px]">Photo logging is off</span>
      <span className="text-[14px] leading-normal text-neutral-700">
        {reason === 'team' ? 'Your admin paused AI for the team.' : 'You switched off AI photo reading.'} Search works exactly the same — one tap per food. You can still attach a photo to the log.
      </span>
      <PhotoPickButton onFile={onAttach} label="Attach a photo" variant="dark" />
    </div>
  );
}

/** "Reading your plate… up to 20 s": the photo with a pulsing line and a slow progress bar. */
export function AnalyzingCard({ url, onCancel }: { url: string; onCancel: () => void }) {
  return (
    <div className="relative flex h-[300px] flex-col justify-end gap-2.5 overflow-hidden rounded-[32px] p-[18px]" style={STRIPES} aria-busy="true">
      <img src={url} alt="Your plate" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative flex flex-col gap-2 rounded-[24px] bg-neutral-100 p-3.5" role="status">
        <div className="flex justify-between text-[14px] font-bold">
          <motion.span animate={{ opacity: [1, 0.45, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
            Reading your plate…
          </motion.span>
          <span className="font-normal text-neutral-700">up to 20 s</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-300">
          <motion.div className="h-full rounded-full bg-accent-2" initial={{ width: '4%' }} animate={{ width: '92%' }} transition={{ duration: 18, ease: [0.1, 0.7, 0.3, 1] }} />
        </div>
        <button type="button" onClick={onCancel} className="min-h-10 self-start text-[13px] font-bold text-accent-700 underline underline-offset-2">
          Search instead
        </button>
      </div>
    </div>
  );
}
