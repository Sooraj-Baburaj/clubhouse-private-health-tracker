import { schema as s } from '@clubhouse/db';
import type { Container } from '../container';

const SECRET_KEYS = /password|secret|token|totp|hash|p256dh|^auth$|recovery|apikey|api_key/i;

export function redact(v: unknown, depth = 0): unknown {
  if (v == null || depth > 6) return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return '[binary]';
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(val, depth + 1);
    return out;
  }
  return v;
}

export const HIGH_IMPACT_ACTIONS = new Set([
  'member.role_change',
  'chat.clear',
  'member.delete_data',
  'ai.budget_update',
  'ai.pricing_update',
  'retention.update',
  'retention.run',
  'member.deactivate',
  'team.export',
  'ai.global_toggle',
]);

export interface AuditInput {
  teamId: string | null;
  actorId: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  memberId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** SYS-ROLE-04 / ADM-AUD-01: every admin action with before and after values, secrets redacted. Append-only. */
export async function audit(c: Container, a: AuditInput) {
  await c.db.insert(s.auditLogs).values({
    teamId: a.teamId,
    actorId: a.actorId,
    actorRole: a.actorRole ?? null,
    action: a.action,
    targetType: a.targetType,
    targetId: a.targetId ?? null,
    memberId: a.memberId ?? null,
    before: (redact(a.before) ?? null) as never,
    after: (redact(a.after) ?? null) as never,
    reason: a.reason ?? null,
    highImpact: HIGH_IMPACT_ACTIONS.has(a.action),
    ip: a.ip ?? null,
    userAgent: a.userAgent?.slice(0, 300) ?? null,
  });
}
