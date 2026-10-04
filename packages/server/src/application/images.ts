import { inArray } from 'drizzle-orm';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';

export interface ImageUrls {
  url: string | null;
  thumbUrl: string | null;
  expired: boolean;
  /** Original pixel size, so clients can reserve space before the image loads. */
  width: number | null;
  height: number | null;
}

const NONE: ImageUrls = { url: null, thumbUrl: null, expired: false, width: null, height: null };

/** Resolve signed URLs for many images at once; purged images report `expired` (SYS-MEDIA-06). */
export async function imageUrlMap(c: Container, ids: (string | null | undefined)[]): Promise<Map<string, ImageUrls>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, ImageUrls>();
  if (!unique.length) return out;
  const rows = await c.db.select().from(s.images).where(inArray(s.images.id, unique));
  // Signing is independent per object, so a chat page or leaderboard signs all of its images concurrently.
  await Promise.all(
    rows.map(async (r) => {
      if (r.purgedAt) {
        out.set(r.id, { url: null, thumbUrl: null, expired: true, width: null, height: null });
        return;
      }
      const [url, thumbUrl] = await Promise.all([c.storage.signedUrl(r.storageKey, 86400), r.thumbKey ? c.storage.signedUrl(r.thumbKey, 86400) : null]);
      out.set(r.id, { url, thumbUrl: thumbUrl ?? url, expired: false, width: r.width, height: r.height });
    }),
  );
  return out;
}

export async function imageUrls(c: Container, id: string | null | undefined): Promise<ImageUrls> {
  if (!id) return NONE;
  return (await imageUrlMap(c, [id])).get(id) ?? NONE;
}

export function pick(map: Map<string, ImageUrls>, id: string | null | undefined): ImageUrls {
  return (id && map.get(id)) || NONE;
}
