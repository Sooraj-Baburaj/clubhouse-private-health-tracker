import { randomUUID, createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { UploadResponse } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';
import { badRequest } from '../lib/errors';
import type { AuthUser } from '../interface/http/types';
import { hitRateLimit, LIMITS } from './rateLimit';
import { imageUrls } from './images';
import { getTeam } from './team';

/** `diet` (diet-plan option photos) and `logo` are admin uploads; neither expires. */
export const IMAGE_KINDS = ['food', 'activity', 'chat', 'meme', 'avatar', 'logo', 'diet'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/** Raw upload ceiling. Clients compress to ~120 KB (SYS-MEDIA-01); memes and logos may be larger GIFs. */
export const MAX_UPLOAD_BYTES = { default: 2_000_000, meme: 4_000_000 } as const;
const EXPIRING: ImageKind[] = ['food', 'activity', 'chat'];

function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return 'heif';
  return null;
}

export interface StoredImage {
  row: typeof s.images.$inferSelect;
  /** The re-encoded main image bytes (reused by AI recognition to avoid a storage round-trip). */
  main: Buffer;
}

/**
 * SYS-MEDIA-02/03: validate, re-encode (EXIF/GPS dropped), store main + thumbnail in the private bucket and record
 * the image with its retention expiry. Idempotent per (owner, clientId) so offline retries never duplicate.
 */
export async function storeImage(c: Container, user: AuthUser, file: Buffer, kind: ImageKind, clientId?: string | null): Promise<StoredImage> {
  if (clientId) {
    const existing = await c.db.query.images.findFirst({ where: and(eq(s.images.ownerId, user.id), eq(s.images.clientId, clientId)) });
    if (existing) return { row: existing, main: (await c.storage.get(existing.storageKey)) ?? Buffer.alloc(0) };
  }
  const limit = kind === 'meme' || kind === 'logo' ? MAX_UPLOAD_BYTES.meme : MAX_UPLOAD_BYTES.default;
  if (file.length > limit) throw badRequest(`That image is too large (max ${Math.round(limit / 1_000_000)} MB).`, 'too_large');
  if (!sniff(file)) throw badRequest('Send a JPEG, PNG, WebP, HEIC or GIF image.', 'unsupported_image');
  if (kind === 'food' || kind === 'activity' || kind === 'chat') {
    await hitRateLimit(c, `photo:${user.id}`, LIMITS.photos.limit, LIMITS.photos.windowSec, 'That’s a lot of photos this hour. Try search for now.');
  }
  let processed;
  try {
    processed = await c.images.process(file, kind);
  } catch {
    throw badRequest('We couldn’t read that image. Try another photo.', 'unsupported_image');
  }
  const team = await getTeam(c, user.teamId);
  const id = randomUUID();
  const day = c.clock.now().toISOString().slice(0, 10);
  const key = `${user.teamId}/${kind}/${day}/${id}.${processed.extension}`;
  const thumbKey = processed.thumb ? `${user.teamId}/${kind}/${day}/${id}_t.webp` : null;
  await c.storage.put(key, processed.main, processed.contentType, 'private, max-age=86400');
  if (processed.thumb && thumbKey) await c.storage.put(thumbKey, processed.thumb, 'image/webp', 'private, max-age=86400');
  const expiresAt = EXPIRING.includes(kind) ? new Date(c.clock.now().getTime() + team.settings.media.retentionDays * 86400_000) : null;
  const [row] = await c.db
    .insert(s.images)
    .values({
      id,
      teamId: user.teamId,
      ownerId: user.id,
      clientId: clientId ?? null,
      kind,
      storageKey: key,
      thumbKey,
      contentType: processed.contentType,
      bytes: processed.main.length,
      thumbBytes: processed.thumb?.length ?? 0,
      width: processed.width,
      height: processed.height,
      sha256: createHash('sha256').update(processed.main).digest('hex'),
      expiresAt,
    })
    .returning();
  return { row: row!, main: processed.main };
}

export async function uploadResponse(c: Container, row: typeof s.images.$inferSelect): Promise<UploadResponse> {
  const urls = await imageUrls(c, row.id);
  return { id: row.id, url: urls.url, thumbUrl: urls.thumbUrl, width: row.width, height: row.height, bytes: row.bytes };
}

/** Pull the file part out of a multipart body (field `file` or `image`). */
export async function fileFromForm(form: FormData): Promise<Buffer> {
  const f = form.get('file') ?? form.get('image');
  if (!f || typeof f === 'string') throw badRequest('Attach an image.', 'missing_file');
  return Buffer.from(await (f as Blob).arrayBuffer());
}
