import { sql } from 'drizzle-orm';
import type { Container } from '../../container';

/**
 * Lease row instead of advisory locks (the Supabase transaction pooler has no session state). One UPDATE … RETURNING
 * either takes an expired/free lease or returns nothing; a crashed holder is recovered once `locked_until` passes.
 */
export async function acquireLease(c: Container, name: string, seconds: number, owner: string): Promise<boolean> {
  await c.db.execute(sql`insert into job_locks (name, locked_until, owner, acquired_at) values (${name}, null, null, null) on conflict (name) do nothing`);
  const rows = await c.db.execute(sql`
    update job_locks
       set locked_until = now() + make_interval(secs => ${seconds}), owner = ${owner}, acquired_at = now()
     where name = ${name} and (locked_until is null or locked_until < now())
     returning name`);
  return rows.length > 0;
}

export async function releaseLease(c: Container, name: string, owner: string) {
  await c.db.execute(sql`update job_locks set locked_until = null where name = ${name} and owner = ${owner}`);
}
