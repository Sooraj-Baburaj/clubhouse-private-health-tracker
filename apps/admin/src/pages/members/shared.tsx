import { useMemo } from 'react';
import type { Role } from '@clubhouse/contracts';
import { Select } from '@/ui';

/** zod issues → { field: message } (first issue per top-level field). `friendly` replaces zod's generic wording. */
export function zodErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[], friendly: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? '_');
    if (!out[key]) out[key] = friendly[key] ?? i.message;
  }
  return out;
}

let tzCache: string[] | null = null;
function allTimezones(): string[] {
  if (tzCache) return tzCache;
  try {
    tzCache = Intl.supportedValuesOf('timeZone');
  } catch {
    tzCache = ['Asia/Kolkata', 'UTC'];
  }
  return tzCache;
}

/** Timezone select. '' = team default (sent as null). Keeps an unknown current value selectable. */
export function TimezoneSelect({ value, onChange, teamTimezone, id, disabled }: { value: string; onChange: (v: string) => void; teamTimezone: string | null | undefined; id?: string; disabled?: boolean }) {
  const zones = useMemo(() => {
    const list = allTimezones();
    return value && !list.includes(value) ? [value, ...list] : list;
  }, [value]);
  return (
    <Select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">Team default{teamTimezone ? ` (${teamTimezone})` : ''}</option>
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, ' ')}
        </option>
      ))}
    </Select>
  );
}

export const ROLE_LABEL: Record<Role, string> = { member: 'Member', admin: 'Admin', super_admin: 'Super Admin' };

export function roleOptions(isSuper: boolean, current?: Role): { value: Role; label: string }[] {
  const base: Role[] = isSuper || current === 'super_admin' ? ['member', 'admin', 'super_admin'] : ['member', 'admin'];
  return base.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
}

/** Friendly copy for a temp password expiry. */
export function tempPasswordText(iso: string | null): { text: string; expired: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { text: 'Temp password expired', expired: true };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return { text: days >= 1 ? `Temp password · ${days} day${days === 1 ? '' : 's'} left` : `Temp password · ${hours}h left`, expired: false };
}

/** Button-styled router links (outline / secondary look). */
export const LINK_BTN = 'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[rgba(182,49,108,0.25)] bg-white px-3 text-[13px] font-semibold text-ink transition-colors hover:border-accent hover:text-ink';
export const LINK_TEXT = 'inline-flex items-center gap-1 text-[13px] font-semibold';
