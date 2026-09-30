import type { Broadcaster } from '../../application/ports';
import { log } from '../../lib/log';

/**
 * Supabase Realtime Broadcast over REST — no socket held by the server. Payloads carry ids only; clients treat events
 * as "poll now" hints, so the public anon key on the client exposes no content.
 */
export class SupabaseBroadcaster implements Broadcaster {
  readonly enabled: boolean;
  constructor(
    private url: string | undefined,
    private serviceKey: string | undefined,
    on: boolean,
  ) {
    this.enabled = on && !!url && !!serviceKey;
  }

  async publish(topic: string, event: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.enabled) return;
    try {
      const res = await fetch(`${this.url!.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: { apikey: this.serviceKey!, authorization: `Bearer ${this.serviceKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) log.warn('realtime.publish_failed', { status: res.status, topic, event });
    } catch (e) {
      log.warn('realtime.publish_error', { topic, event, error: (e as Error).message });
    }
  }
}

export class NoopBroadcaster implements Broadcaster {
  readonly enabled = false;
  published: { topic: string; event: string; payload: Record<string, unknown> }[] = [];
  async publish(topic: string, event: string, payload: Record<string, unknown>) {
    this.published.push({ topic, event, payload });
  }
}
