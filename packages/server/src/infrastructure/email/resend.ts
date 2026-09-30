import type { EmailSender } from '../../application/ports';
import { log } from '../../lib/log';

export class ResendEmailSender implements EmailSender {
  readonly enabled: boolean;
  constructor(
    private apiKey: string | undefined,
    private from: string,
  ) {
    this.enabled = !!apiKey;
  }

  async send(to: string[], subject: string, text: string): Promise<void> {
    const recipients = to.filter(Boolean);
    if (!recipients.length) return;
    if (!this.enabled) {
      log.info('email.skipped', { subject, to: recipients.length });
      return;
    }
    const { Resend } = await import('resend');
    const client = new Resend(this.apiKey);
    const res = await client.emails.send({ from: this.from, to: recipients, subject, text });
    if (res.error) log.warn('email.failed', { subject, error: res.error.message });
  }
}
