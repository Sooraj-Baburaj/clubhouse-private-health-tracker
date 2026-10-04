/**
 * Shrink a photo in the browser before upload: a 12 MP phone shot is 3–8 MB, over the 2 MB upload cap, and the server
 * would only resize it anyway. Sized to the server's cap for the kind (1200 px for diet photos) at a high quality, so
 * the server's re-encode is the one meaningful lossy step. Anything the browser can't decode (HEIC outside Safari) is
 * returned untouched and the server decides.
 */
export async function compressImage(file: File, maxEdge = 1200, quality = 0.85): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  let blob = await encode('image/webp');
  // Safari can't encode WebP and returns a PNG instead.
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
  return blob && blob.size < file.size ? blob : file;
}
