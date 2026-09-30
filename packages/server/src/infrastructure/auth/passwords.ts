import type { PasswordHasher } from '../../application/ports';

/** Argon2id (m=19456 KiB, t=2, p=1) by default; bcrypt (cost 12) selectable. Verify dispatches on the hash prefix. */
export class Passwords implements PasswordHasher {
  constructor(private algo: 'argon2' | 'bcrypt') {}

  async hash(plain: string): Promise<string> {
    if (this.algo === 'bcrypt') {
      const bcrypt = await import('bcryptjs');
      return bcrypt.hash(plain, 12);
    }
    const { hash } = await import('@node-rs/argon2');
    return hash(plain, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  async verify(stored: string, plain: string): Promise<boolean> {
    try {
      if (stored.startsWith('$argon2')) {
        const { verify } = await import('@node-rs/argon2');
        return await verify(stored, plain);
      }
      if (stored.startsWith('$2')) {
        const bcrypt = await import('bcryptjs');
        return await bcrypt.compare(plain, stored);
      }
      return false;
    } catch {
      return false;
    }
  }
}
