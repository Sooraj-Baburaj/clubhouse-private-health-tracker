import { CameraOff, Images, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { AIBadge } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';

/**
 * Snap (design 6a): a full-screen viewfinder with a plate guide, the shutter and a gallery picker. With AI on the photo
 * is read; with AI off it goes on the meal and the member adds the foods. Without camera access (or a camera), it
 * offers the photo picker instead.
 */
export function SnapCamera({ photoAi, onPhoto, onClose, onSearch }: { photoAi: boolean; onPhoto: (b: Blob) => void; onClose: () => void; onSearch: () => void }) {
  const reduce = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // No camera API at all (e.g. an insecure context): straight to the picker.
  const [state, setState] = useState<'starting' | 'live' | 'blocked'>(() => (typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'starting' : 'blocked'));
  const [flash, setFlash] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) return;
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
  const pick = () => input.current?.click();

  return (
    <motion.section
      role="dialog"
      aria-modal="true"
      aria-label="Snap a photo of your meal"
      className="absolute inset-0 z-20 flex flex-col bg-cam text-cam-fg"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.22 } }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="relative mx-2.5 mt-1 flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-[36px] p-5" style={{ background: state === 'live' ? 'var(--color-cam)' : 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--color-cam-fg) 9%, transparent) 0 12px, transparent 12px 24px)' }}>
        <video ref={video} playsInline muted autoPlay aria-hidden className="absolute inset-0 h-full w-full object-cover" style={{ opacity: state === 'live' ? 1 : 0 }} />
        <div className="absolute inset-x-3.5 top-3.5 z-10 flex items-start gap-2.5">
          <button type="button" onClick={onClose} aria-label="Close camera" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-0 bg-[color-mix(in_srgb,var(--color-cam-fg)_16%,transparent)] text-cam-fg backdrop-blur-sm">
            <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </button>
          <span className="mt-0.5 flex items-center gap-2 rounded-[22px] bg-[color-mix(in_srgb,var(--color-cam)_55%,transparent)] px-3.5 py-2 text-[13px] font-bold leading-snug text-cam-fg backdrop-blur-sm">
            {photoAi ? 'AI on · we’ll read the plate' : 'The photo goes on your meal — you add the foods'}
            {photoAi && <AIBadge className="shrink-0" />}
          </span>
        </div>
        {state !== 'blocked' ? (
          <>
            <div aria-hidden className="relative h-[270px] w-[270px] max-w-[80vw] rounded-full border-[3px] border-dashed border-[color-mix(in_srgb,var(--color-cam-fg)_55%,transparent)]" style={{ maxHeight: '80vw' }} />
            <span className="relative text-[13px] font-semibold text-[color-mix(in_srgb,var(--color-cam-fg)_80%,transparent)]">{state === 'live' ? 'Fit the plate inside the circle' : 'Opening the camera…'}</span>
          </>
        ) : (
          <div role="alert" className="relative flex max-w-[290px] flex-col items-start gap-2.5 rounded-[32px] bg-bg p-[22px] text-text">
            <CameraOff aria-hidden className="h-7 w-7 text-accent-700" strokeWidth={2.75} />
            <span className="font-heading text-[22px] leading-[1.15]">Camera unavailable — choose a photo</span>
            <span className="text-[14px] leading-normal text-neutral-700">Allow camera access in your phone’s settings, or pick a photo you’ve already taken.</span>
            <Button className="mt-1" onClick={pick}>
              Choose a photo
            </Button>
          </div>
        )}
        <AnimatePresence>{flash > 0 && <motion.span key={flash} aria-hidden className="absolute inset-0 bg-neutral-100" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.35 }} />}</AnimatePresence>
      </div>
      <div className="grid min-h-[110px] grid-cols-[52px_1fr_52px] items-center px-7 pb-1.5 pt-[18px]">
        <button type="button" onClick={pick} aria-label="Choose from your photos" className="grid h-[52px] w-[52px] place-items-center rounded-2xl border-2 border-[color-mix(in_srgb,var(--color-cam-fg)_40%,transparent)] bg-transparent text-cam-fg">
          <Images className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </button>
        <div className="flex justify-center">
          {state !== 'blocked' && (
            <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={snap} disabled={state !== 'live'} aria-label="Take photo" className="h-[78px] w-[78px] rounded-full border-[6px] border-cam-fg bg-accent disabled:opacity-50" />
          )}
        </div>
        <span />
      </div>
      <button type="button" onClick={onSearch} className="mb-3 min-h-11 self-center border-0 bg-transparent px-4 text-[15px] font-bold text-cam-fg" style={{ marginBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}>
        Search instead
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPhoto(f);
          e.target.value = '';
        }}
      />
    </motion.section>
  );
}
