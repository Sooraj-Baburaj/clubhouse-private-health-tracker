import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Storage, StoredObject } from '../../application/ports';
import { hmacHex } from '../../lib/crypto';

/** Development storage: files on disk, served by GET /api/media/local/* with an HMAC-signed, day-stable URL. */
export class LocalDiskStorage implements Storage {
  private root: string;
  constructor(
    dir: string,
    private secret: string,
  ) {
    this.root = resolve(dir);
  }

  private path(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new Error('invalid storage key');
    return p;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    await writeFile(`${p}.type`, contentType);
    return { key, bytes: body.length, contentType };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch {
      return null;
    }
  }

  async contentType(key: string): Promise<string> {
    try {
      return (await readFile(`${this.path(key)}.type`, 'utf8')).trim();
    } catch {
      return 'application/octet-stream';
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
    await rm(`${this.path(key)}.type`, { force: true });
  }

  async signedUrl(key: string): Promise<string> {
    const now = new Date();
    const exp = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2) / 1000;
    const sig = hmacHex(this.secret, `${key}:${exp}`);
    return `/api/media/local/${key.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sig}`;
  }

  verify(key: string, exp: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
    return hmacHex(this.secret, `${key}:${exp}`) === sig;
  }
}
