import type { ImageProcessor, ProcessedImage } from '../../application/ports';

type Kind = 'food' | 'activity' | 'chat' | 'meme' | 'avatar' | 'logo';

async function sharp() {
  return (await import('sharp')).default;
}

/**
 * Server-side re-encode (SYS-MEDIA-03, NFR-SEC-04): orientation applied, all metadata (EXIF/GPS, ICC) dropped,
 * WebP output and a 200 px thumbnail. Memes are capped at 600 px (SYS-MEDIA-05); animated GIF/WebP memes stay animated.
 */
export class SharpImageProcessor implements ImageProcessor {
  async process(input: Buffer, kind: Kind): Promise<ProcessedImage> {
    const s = await sharp();
    const meta = await s(input, { failOn: 'error', animated: true }).metadata();
    const allowed = ['jpeg', 'png', 'webp', 'heif', 'gif', 'avif'];
    if (!meta.format || !allowed.includes(meta.format)) throw Object.assign(new Error('Unsupported image type'), { code: 'unsupported_image' });
    const animated = kind === 'meme' && (meta.pages ?? 1) > 1;
    const maxEdge = kind === 'meme' ? 600 : kind === 'avatar' ? 512 : kind === 'logo' ? 512 : 1024;
    let pipeline = s(input, { failOn: 'error', animated }).rotate();
    if (kind === 'avatar') pipeline = pipeline.resize(512, 512, { fit: 'cover' });
    else pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
    let quality = kind === 'meme' ? 72 : 78;
    let main = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (kind === 'meme') {
      while (main.data.length > 150_000 && quality > 35) {
        quality -= 10;
        main = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
      }
    }
    const thumb = kind === 'avatar' || kind === 'logo' ? null : await s(input, { failOn: 'error' }).rotate().resize(200, 200, { fit: 'cover' }).webp({ quality: 70 }).toBuffer();
    return { main: main.data, thumb, width: main.info.width, height: main.info.pageHeight ?? main.info.height, contentType: 'image/webp', extension: 'webp' };
  }

  /** SYS-AI-13: at most 1024 px on the long edge before sending to the model. */
  async downscaleForAi(input: Buffer, maxEdge: number) {
    const s = await sharp();
    const data = await s(input).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { data, mediaType: 'image/webp' as const };
  }
}
