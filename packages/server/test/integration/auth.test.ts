import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

describe('auth', () => {
  it('locks an account after five failed attempts', async () => {
    const u = await h.createUser({ onboard: false });
    for (let i = 0; i < 5; i++) {
      const r = await h.app.request('/api/auth/login', { method: 'POST', headers: { 'x-clubhouse-client': 'web', 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${i}` }, body: JSON.stringify({ login: u.username, password: 'wrong-password-1' }) });
      expect(r.status).toBe(401);
    }
    const locked = await h.app.request('/api/auth/login', { method: 'POST', headers: { 'x-clubhouse-client': 'web', 'content-type': 'application/json' }, body: JSON.stringify({ login: u.username, password: u.password }) });
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBeTruthy();
  });

  it('forces a password change before anything else', async () => {
    const u = await h.createUser({ mustChange: true, onboard: false });
    const cl = await h.login(u.username, u.password);
    expect((await cl.req('GET', '/today')).status).toBe(403);
    const me = await cl.req('GET', '/me');
    expect(me.status).toBe(200);
    expect(me.json.user.mustChangePassword).toBe(true);
    const ch = await cl.req('POST', '/auth/change-password', { currentPassword: u.password, newPassword: 'a-much-better-pass-9' });
    expect(ch.status).toBe(200);
  });

  it('rejects mutations without the client header or from another origin', async () => {
    const u = await h.createUser();
    const cl = await h.login(u.username, u.password);
    const noHeader = await h.app.request('/api/chat/read', { method: 'POST', headers: { cookie: cl.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ seq: 1 }) });
    expect(noHeader.status).toBe(403);
    const cross = await cl.req('POST', '/chat/read', { seq: 1 }, { origin: 'https://evil.example' });
    expect(cross.status).toBe(403);
    expect((await cl.req('POST', '/chat/read', { seq: 1 })).status).toBe(200);
  });

  it('keeps members out of the admin API', async () => {
    const u = await h.createUser();
    const cl = await h.login(u.username, u.password);
    const r = await cl.req('GET', '/admin/dashboard');
    expect(r.status).toBe(403);
  });

  it('requires admin activity within 12 hours', async () => {
    const a = await h.createUser({ role: 'admin' });
    const cl = await h.login(a.username, a.password);
    h.clock.advance(13 * 3600_000);
    const r = await cl.req('GET', '/admin/dashboard');
    expect(r.status).toBe(401);
    expect(r.json.code).toBe('admin_reauth_required');
    expect((await cl.req('POST', '/auth/reauth', { password: a.password })).status).toBe(200);
    h.clock.advance(-13 * 3600_000);
  });

  it('keeps the audit log append-only', async () => {
    await h.c.db.execute(sql`insert into audit_logs (action, target_type) values ('test.append', 'test')`);
    await expect(h.c.db.execute(sql`update audit_logs set action = 'tampered' where action = 'test.append'`)).rejects.toThrow();
    await expect(h.c.db.execute(sql`delete from audit_logs where action = 'test.append'`)).rejects.toThrow();
  });
});
