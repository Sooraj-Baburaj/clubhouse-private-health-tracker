import type { ImageKind } from '../../application/media';
import type { ImageProcessor, ProcessedImage } from '../../application/ports';

async function sharp() {
  return (await import('sharp')).default;
}

interface Spec {
  /** Long-edge cap ('inside'), or the exact square for 'cover'. */
  edge: number;
  fit: 'inside' | 'cover';
  quality: number;
  /** Square thumbnail edge, or null for none. */
  thumb: number | null;
  /** Thumbnail WebP quality (default 72). */
  thumbQuality?: number;
}

/**
 * Sizes follow where each kind is shown (CSS px × 3 for the densest phones):
 * - Member photos arrive already compressed on the device (WebP q0.55, ≤ 800 px, SYS-MEDIA-01). Re-encoding those at
 *   q≥75 only adds bytes (measured +13–16 %, no PSNR gain), so q70 keeps them at their uploaded size. Food and
 *   activity thumbnails (200 px) cover list rows (≤ 52 px). Chat thumbnails fill the 220 px chat tile, where most
 *   photos are scrolled past and the full image only loads on open: 400 px q60 measured 6–15 KB against 16–49 KB for
 *   the full image, about a third lighter than 480 px q72 for ~0.3 dB.
 * - Diet option photos are curated and shown full width at 16:9 to every member, so they get a larger, cleaner encode.
 * - Avatars render at 26–84 px: 256 px main for profile-size, 160 px thumbnail for list rows (≤ 53 px).
 * - Memes are capped at 600 px (SYS-MEDIA-05); the 256 px thumbnail fills the 3-column picker and reaction chips.
 */
const SPECS: Record<ImageKind, Spec> = {
  food: { edge: 1024, fit: 'inside', quality: 70, thumb: 200 },
  activity: { edge: 1024, fit: 'inside', quality: 70, thumb: 200 },
  chat: { edge: 1024, fit: 'inside', quality: 70, thumb: 400, thumbQuality: 60 },
  diet: { edge: 1200, fit: 'inside', quality: 78, thumb: 200 },
  meme: { edge: 600, fit: 'inside', quality: 72, thumb: 256 },
  avatar: { edge: 256, fit: 'cover', quality: 78, thumb: 160 },
  logo: { edge: 512, fit: 'inside', quality: 85, thumb: null },
};

/** Memes keep shrinking until they fit this budget (animated GIFs can otherwise run to megabytes). */
const MEME_BUDGET = 150_000;

/**
 * Server-side re-encode (SYS-MEDIA-03, NFR-SEC-04): orientation applied, all metadata (EXIF/GPS, ICC) dropped,
 * WebP output plus a square thumbnail. Animated GIF/WebP memes stay animated; their thumbnail is the first frame.
 */
export class SharpImageProcessor implements ImageProcessor {
  async process(input: Buffer, kind: ImageKind): Promise<ProcessedImage> {
    const s = await sharp();
    const spec = SPECS[kind];
    const meta = await s(input, { failOn: 'error', animated: true }).metadata();
    const allowed = ['jpeg', 'png', 'webp', 'heif', 'gif', 'avif'];
    if (!meta.format || !allowed.includes(meta.format)) throw Object.assign(new Error('Unsupported image type'), { code: 'unsupported_image' });
    const animated = kind === 'meme' && (meta.pages ?? 1) > 1;
    const pipeline = s(input, { failOn: 'error', animated })
      .rotate()
      .resize(spec.fit === 'cover' ? { width: spec.edge, height: spec.edge, fit: 'cover' } : { width: spec.edge, height: spec.edge, fit: 'inside', withoutEnlargement: true });
    let quality = spec.quality;
    let main = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (kind === 'meme') {
      while (main.data.length > MEME_BUDGET && quality > 35) {
        quality -= 10;
        main = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
      }
    }
    // Derived from the small re-encoded main rather than the original: far cheaper to decode, and invisible at thumb size.
    const thumb = spec.thumb ? await s(main.data).resize(spec.thumb, spec.thumb, { fit: 'cover', withoutEnlargement: true }).webp({ quality: spec.thumbQuality ?? 72 }).toBuffer() : null;
    return { main: main.data, thumb, width: main.info.width, height: main.info.pageHeight ?? main.info.height, contentType: 'image/webp', extension: 'webp' };
  }

  /** SYS-AI-13: at most 1024 px on the long edge before sending to the model. */
  async downscaleForAi(input: Buffer, maxEdge: number) {
    const s = await sharp();
    const data = await s(input).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { data, mediaType: 'image/webp' as const };
  }
}
