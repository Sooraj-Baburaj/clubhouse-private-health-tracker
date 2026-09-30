import type { PushOutcome, PushPayload, PushSender, PushSubscriptionRef } from '../../application/ports';

type WebPushModule = typeof import('web-push');
let mod: WebPushModule | null = null;
async function load(): Promise<WebPushModule> {
  if (!mod) mod = (await import('web-push')).default as unknown as WebPushModule;
  return mod;
}

/** Web Push (VAPID). 404/410 mean the subscription is dead and must be removed (SYS-NOTIF-09). */
export class WebPushSender implements PushSender {
  readonly enabled: boolean;
  constructor(
    private publicKey?: string,
    private privateKey?: string,
    private subject = 'mailto:admin@example.com',
  ) {
    this.enabled = !!(publicKey && privateKey);
  }

  async send(sub: PushSubscriptionRef, payload: PushPayload, opts: { ttlSec?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string } = {}): Promise<PushOutcome> {
    if (!this.enabled) return { ok: false, gone: false, status: 0, error: 'push not configured' };
    const wp = await load();
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: { subject: this.subject, publicKey: this.publicKey!, privateKey: this.privateKey! },
          TTL: opts.ttlSec ?? 3600,
          urgency: opts.urgency ?? 'normal',
          ...(opts.topic ? { topic: opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
          timeout: 10_000,
        },
      );
      return { ok: true };
    } catch (e) {
      const err = e as { statusCode?: number; body?: string; message?: string };
      const status = err.statusCode ?? 0;
      return { ok: false, gone: status === 404 || status === 410, status, error: (err.body || err.message || 'push failed').slice(0, 300) };
    }
  }
}

export class NoopPushSender implements PushSender {
  readonly enabled = false;
  sent: { sub: PushSubscriptionRef; payload: PushPayload }[] = [];
  async send(sub: PushSubscriptionRef, payload: PushPayload): Promise<PushOutcome> {
    this.sent.push({ sub, payload });
    return { ok: false, gone: false, status: 0, error: 'push disabled' };
  }
}
