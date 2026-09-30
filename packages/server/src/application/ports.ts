/** Ports: the application layer depends on these interfaces; infrastructure provides the implementations. */

export interface StoredObject {
  key: string;
  bytes: number;
  contentType: string;
}

export interface Storage {
  put(key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** A URL the browser can GET for `ttlSec` seconds. */
  signedUrl(key: string, ttlSec: number): Promise<string>;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  actions?: { action: string; title: string }[];
  badge?: number;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionRef {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushOutcome = { ok: true } | { ok: false; gone: boolean; status: number; error: string };

export interface PushSender {
  readonly enabled: boolean;
  send(sub: PushSubscriptionRef, payload: PushPayload, opts?: { ttlSec?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string }): Promise<PushOutcome>;
}

export interface EmailSender {
  readonly enabled: boolean;
  send(to: string[], subject: string, text: string): Promise<void>;
}

export interface Broadcaster {
  readonly enabled: boolean;
  publish(topic: string, event: string, payload: Record<string, unknown>): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}

export interface Clock {
  now(): Date;
}

export interface ProcessedImage {
  main: Buffer;
  thumb: Buffer | null;
  width: number;
  height: number;
  contentType: string;
  extension: string;
}

export interface ImageProcessor {
  process(input: Buffer, kind: 'food' | 'activity' | 'chat' | 'meme' | 'avatar' | 'logo'): Promise<ProcessedImage>;
  downscaleForAi(input: Buffer, maxEdge: number): Promise<{ data: Buffer; mediaType: 'image/webp' | 'image/jpeg' | 'image/png' }>;
}
