import { useMemo, useState } from 'react';
import type { AdminMemberRow } from '@clubhouse/contracts';
import { useMembers } from '@/features/directory';
import { cn } from '@/lib/cn';
import { Checkbox, Select } from './Field';
import { Avatar } from './Person';

/** Single member select (native select; loads the member list). */
export function MemberSelect({ value, onChange, placeholder = 'Choose a member', includeInactive = false, filter, className, id, ...aria }: { value: string; onChange: (id: string, member: AdminMemberRow | undefined) => void; placeholder?: string; includeInactive?: boolean; filter?: (m: AdminMemberRow) => boolean; className?: string; id?: string; 'aria-label'?: string }) {
  const q = useMembers();
  const list = useMemo(() => (q.data ?? []).filter((m) => (includeInactive || m.status !== 'deactivated') && (!filter || filter(m))).sort((a, b) => a.person.name.localeCompare(b.person.name)), [q.data, includeInactive, filter]);
  return (
    <Select id={id} aria-label={aria['aria-label']} className={className} value={value} disabled={q.isPending} onChange={(e) => onChange(e.target.value, list.find((m) => m.id === e.target.value))}>
      <option value="">{q.isPending ? 'Loading members…' : placeholder}</option>
      {list.map((m) => (
        <option key={m.id} value={m.id}>
          {m.person.name} (@{m.username}){m.status === 'deactivated' ? ' · deactivated' : ''}
        </option>
      ))}
    </Select>
  );
}

/** Multi-select member list with search and select-all (checkbox list). */
export function MemberMultiSelect({ value, onChange, label, includeInactive = false, maxHeight = 240, className }: { value: string[]; onChange: (ids: string[]) => void; label: string; includeInactive?: boolean; maxHeight?: number; className?: string }) {
  const q = useMembers();
  const [query, setQuery] = useState('');
  const list = useMemo(() => (q.data ?? []).filter((m) => includeInactive || m.status !== 'deactivated').sort((a, b) => a.person.name.localeCompare(b.person.name)), [q.data, includeInactive]);
  const shown = list.filter((m) => `${m.person.name} ${m.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  const all = shown.length > 0 && shown.every((m) => value.includes(m.id));
  return (
    <div role="group" aria-label={label} className={cn('flex flex-col gap-2 rounded-[12px] border border-border bg-white p-2', className)}>
      <div className="flex items-center gap-2">
        <input aria-label={`Search ${label}`} placeholder="Search members" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 min-w-0 flex-1 rounded-full border border-border px-3 text-[13px] outline-none focus:border-accent" />
        <button type="button" className="shrink-0 text-[12px] font-semibold text-accent hover:text-accent-dark" onClick={() => onChange(all ? value.filter((id) => !shown.some((m) => m.id === id)) : Array.from(new Set([...value, ...shown.map((m) => m.id)])))}>
          {all ? 'Clear' : 'Select all'}
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto pr-1" style={{ maxHeight }}>
        {q.isPending && <div className="skeleton h-6" />}
        {shown.map((m) => (
          <Checkbox
            key={m.id}
            checked={value.includes(m.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, m.id] : value.filter((v) => v !== m.id))}
            label={
              <span className="flex items-center gap-2">
                <Avatar person={m.person} size={20} />
                {m.person.name} <span className="text-muted">@{m.username}</span>
              </span>
            }
          />
        ))}
        {!q.isPending && shown.length === 0 && <span className="px-1 text-[12px] text-muted">No members match.</span>}
      </div>
      <span className="px-1 text-[12px] text-muted">{value.length} selected</span>
    </div>
  );
}
