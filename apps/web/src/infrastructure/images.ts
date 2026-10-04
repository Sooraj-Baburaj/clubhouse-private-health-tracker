export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

const OPTS = { maxEdge: 800, quality: 0.55, targetBytes: 120_000 };

async function onMainThread(file: Blob): Promise<Compressed> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that photo'));
      i.src = url;
    });
    const scale = Math.min(1, OPTS.maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    let q = OPTS.quality;
    const encode = (type: string) => new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), type, q));
    let blob = await encode('image/webp');
    const type = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    if (type === 'image/jpeg') blob = await encode(type);
    while (blob.size > OPTS.targetBytes && q > 0.3) {
      q -= 0.08;
      blob = await encode(type);
    }
    return { blob, width: w, height: h, previewUrl: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Compress a camera/gallery photo on the device before upload; no original ever leaves the phone (SYS-MEDIA-02). */
export async function compressImage(file: Blob): Promise<Compressed> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    try {
      const worker = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' });
      const r = await new Promise<{ ok: boolean; blob?: Blob; width?: number; height?: number; error?: string }>((resolve) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = () => resolve({ ok: false });
        worker.postMessage({ file, ...OPTS });
      });
      worker.terminate();
      if (r.ok && r.blob) return { blob: r.blob, width: r.width!, height: r.height!, previewUrl: URL.createObjectURL(r.blob) };
    } catch {
      /* fall through */
    }
  }
  return onMainThread(file);
}
