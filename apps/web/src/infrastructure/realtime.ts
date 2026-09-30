import type { MeResponse } from '@clubhouse/contracts';

type Handler = (event: string, payload: Record<string, unknown>) => void;

/**
 * Supabase Realtime broadcast signals (ids only). Events are just "poll now" hints; when realtime is not configured
 * or the socket drops, callers fall back to polling (SYS-CHAT-04).
 */
export class LiveSignals {
  private client: { removeAllChannels: () => void; disconnect: () => void } | null = null;
  connected = false;
  private listeners = new Set<Handler>();
  private statusListeners = new Set<(c: boolean) => void>();

  async start(cfg: NonNullable<MeResponse['realtime']>) {
    if (this.client) return;
    const { RealtimeClient } = await import('@supabase/realtime-js');
    const rt = new RealtimeClient(`${cfg.url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: cfg.anonKey } });
    this.client = rt as unknown as { removeAllChannels: () => void; disconnect: () => void };
    for (const topic of [cfg.teamTopic, cfg.userTopic]) {
      rt.channel(topic, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: '*' }, (msg: { event: string; payload: Record<string, unknown> }) => this.listeners.forEach((l) => l(msg.event, msg.payload ?? {})))
        .subscribe((status: string) => this.setConnected(status === 'SUBSCRIBED'));
    }
  }

  private setConnected(v: boolean) {
    this.connected = v;
    this.statusListeners.forEach((l) => l(v));
  }

  on(h: Handler) {
    this.listeners.add(h);
    return () => {
      this.listeners.delete(h);
    };
  }

  onStatus(h: (c: boolean) => void) {
    this.statusListeners.add(h);
    return () => {
      this.statusListeners.delete(h);
    };
  }

  stop() {
    this.client?.removeAllChannels();
    this.client?.disconnect();
    this.client = null;
    this.setConnected(false);
  }
}

export const live = new LiveSignals();
