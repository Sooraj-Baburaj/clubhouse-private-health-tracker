import { useMemo, useState } from 'react';
import type { ChatMemberDto, ChatMessageDto } from '@clubhouse/contracts';
import { Avatar } from '@/ui/atoms/Avatar';
import { Chip, ChipRow } from '@/ui/atoms/Chip';
import { MemberSheet } from '@/ui/molecules/MemberSheet';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/**
 * Who reacted to a message (long-press a reaction): filter by emoji, one row per person and emoji. `m` is the live
 * message, so reactions arriving while the sheet is open show up.
 */
export function ReactionsSheet({ request, m, onClose, members, myName }: { request: { id: string; emoji: string | null } | null; m: ChatMessageDto | null; onClose: () => void; members: ChatMemberDto[]; myName: string }) {
  const [filter, setFilter] = useState<string | null>(request?.emoji ?? null);
  // Fresh filter for each opening (adjust state during render when the request changes).
  const [forRequest, setForRequest] = useState(request);
  if (request !== forRequest) {
    setForRequest(request);
    setFilter(request?.emoji ?? null);
  }

  const byName = useMemo(() => new Map(members.map((p) => [p.name, p])), [members]);
  const reactions = m?.reactions ?? [];
  const total = reactions.reduce((n, r) => n + r.count, 0);
  // The chosen reaction may have just been removed; fall back to everyone.
  const active = filter && reactions.some((r) => r.emoji === filter) ? filter : null;
  const rows = reactions
    .filter((r) => !active || r.emoji === active)
    .flatMap((r) => {
      // Names come from the server; when the list includes me, show one of them as "You", first.
      let meShown = false;
      return r.names.map((name) => {
        const isMe = r.mine && !meShown && name === myName;
        if (isMe) meShown = true;
        return { emoji: r.emoji, name, isMe };
      });
    })
    .sort((a, b) => Number(b.isMe) - Number(a.isMe));

  return (
    <MemberSheet open={!!m} onClose={onClose} title="Reactions">
      {reactions.length > 1 && (
        <ChipRow label="Filter by reaction">
          <Chip selected={!active} onClick={() => setFilter(null)}>
            All <span className="tabular">{total}</span>
          </Chip>
          {reactions.map((r) => (
            <Chip key={r.emoji} selected={active === r.emoji} onClick={() => setFilter(r.emoji)} aria-label={`${r.emoji}, ${r.count}`}>
              <span aria-hidden className="text-[16px]">
                {r.emoji}
              </span>
              <span aria-hidden className="tabular">
                {r.count}
              </span>
            </Chip>
          ))}
        </ChipRow>
      )}
      <ul className="flex max-h-[55dvh] flex-col overflow-y-auto rounded-[28px] bg-surface py-1">
        {rows.map((row, i) => {
          const p = byName.get(row.name);
          return (
            <li key={`${row.emoji}-${row.name}-${i}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <Avatar name={row.name} initials={p?.initials ?? initialsOf(row.name)} url={p?.avatarUrl} size={36} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{row.isMe ? 'You' : row.name}</span>
              <span className="text-[22px]" aria-label={`reacted ${row.emoji}`}>
                {row.emoji}
              </span>
            </li>
          );
        })}
      </ul>
    </MemberSheet>
  );
}
