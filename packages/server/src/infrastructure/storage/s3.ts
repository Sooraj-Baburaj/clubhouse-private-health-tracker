import { AwsClient } from 'aws4fetch';
import type { Storage, StoredObject } from '../../application/ports';

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

/**
 * S3-compatible storage via SigV4 (aws4fetch): Supabase Storage's S3 endpoint in production, MinIO/R2/AWS elsewhere.
 * Path-style addressing (`<endpoint>/<bucket>/<key>`), which Supabase requires.
 */
export class S3Storage implements Storage {
  private aws: AwsClient;
  constructor(
    private endpoint: string,
    region: string,
    private bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.aws = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region });
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  private url(key: string) {
    return `${this.endpoint}/${this.bucket}/${encodeKey(key)}`;
  }

  async put(key: string, body: Buffer, contentType: string, cacheControl = 'private, max-age=86400'): Promise<StoredObject> {
    const res = await this.aws.fetch(this.url(key), {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'content-type': contentType, 'cache-control': cacheControl, 'content-length': String(body.length) },
    });
    if (!res.ok) throw new Error(`S3 put failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return { key, bytes: body.length, contentType };
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.aws.fetch(this.url(key), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 get failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await this.aws.fetch(this.url(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`S3 delete failed (${res.status})`);
  }

  /**
   * Presigned GET. The signing time is pinned to the start of the current UTC day and the URL lives for two days,
   * so the URL for an object is byte-stable within a day and browsers can cache it.
   */
  async signedUrl(key: string, _ttlSec: number): Promise<string> {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const datetime = dayStart.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const signed = await this.aws.sign(`${this.url(key)}?X-Amz-Expires=172800`, { method: 'GET', aws: { signQuery: true, datetime } });
    return signed.url;
  }
}
