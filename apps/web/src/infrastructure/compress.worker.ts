/// <reference lib="webworker" />
/**
 * SYS-MEDIA-01: resize to ≤ 800 px on the long edge and encode WebP q0.55 (JPEG fallback), targeting < 120 KB.
 * Runs off the main thread with OffscreenCanvas.
 */
self.onmessage = async (e: MessageEvent<{ file: Blob; maxEdge: number; quality: number; targetBytes: number }>) => {
  const { file, maxEdge, quality, targetBytes } = e.data;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    // A 12 MP photo shrinks ~5× here; the default low-quality filter aliases badly at that ratio (and the noise costs bytes).
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    let q = quality;
    let type = 'image/webp';
    let blob = await canvas.convertToBlob({ type, quality: q });
    // Safari can't encode WebP and silently hands back a PNG: re-encode as JPEG at the starting quality.
    if (blob.type !== 'image/webp') {
      type = 'image/jpeg';
      blob = await canvas.convertToBlob({ type, quality: q });
    }
    while (blob.size > targetBytes && q > 0.3) {
      q -= 0.08;
      blob = await canvas.convertToBlob({ type, quality: q });
    }
    (self as unknown as Worker).postMessage({ ok: true, blob, width: w, height: h });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};
export {};
