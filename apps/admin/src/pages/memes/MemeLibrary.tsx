import { CheckSquare, Heart, ImagePlus, Repeat2, Tag, TagsIcon, Trash2, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { AdminTriggerDto, MemeDto, MemeTone } from '@clubhouse/contracts';
import { useBulkMemes, useMemes, useToggleMeme, useUpdateMeme, type BulkMemeAction } from '@/features/memes';
import { cn } from '@/lib/cn';
import { fmtDateTime, fmtInt, fmtRelative, plural } from '@/lib/format';
import { Button, Card, CardHeader, confirmAction, EmptyState, ErrorState, FilterSelect, PersonCell, Pill, SearchInput, Toggle } from '@/ui';
import { BulkTagsModal, EditMemeModal } from './MemeModals';
import { MemeImage, tagLabel, tagOptions, TONE_LABELS, TonePill } from './shared';

type Sort = 'used' | 'recent' | 'newest';
const GRID = { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } as const;

/** Library tab: meme grid with search/filter/sort, pending suggestions, bulk actions and edit. */
export function MemeLibrary({ triggers, onUpload }: { triggers: AdminTriggerDto[] | undefined; onUpload: () => void }) {
  const q = useMemes();
  const toggle = useToggleMeme();
  const update = useUpdateMeme();
  const bulk = useBulkMemes();
  const reduce = useReducedMotion();

  const [query, setQuery] = useState('');
  const [tone, setTone] = useState('');
  const [tag, setTag] = useState('');
  const [enabled, setEnabled] = useState('');
  const [status, setStatus] = useState('approved');
  const [sort, setSort] = useState<Sort>('used');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tagMode, setTagMode] = useState<'add_tags' | 'remove_tags' | null>(null);

  const all = q.data ?? [];
  const libraryTags = useMemo(() => Array.from(new Set(all.flatMap((m) => m.tags))).sort(), [all]);
  const suggestions = useMemo(() => tagOptions(libraryTags), [libraryTags]);
  const pending = all.filter((m) => m.status === 'pending');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const order = new Map(all.map((m, i) => [m.id, i]));
    const out = all.filter(
      (m) =>
        (!needle || `${m.caption} ${m.tags.join(' ')}`.toLowerCase().includes(needle)) &&
        (!tone || m.tone === tone) &&
        (!tag || m.tags.includes(tag)) &&
        (!enabled || m.enabled === (enabled === 'on')) &&
        (!status || m.status === status),
    );
    return out.sort((a, b) => {
      if (sort === 'used') return b.uses - a.uses || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
      if (sort === 'recent') return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
      // The API lists newest first; keep that order.
      return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
  }, [all, query, tone, tag, enabled, status, sort]);

  const filtered = !!(query || tone || tag || enabled || status !== 'approved');
  const selectedMemes = all.filter((m) => selected.has(m.id));
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const editing = editingId ? all.find((m) => m.id === editingId) : undefined;

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const runBulk = async (action: BulkMemeAction, ids: string[], tags?: string[]) => {
    await bulk.mutateAsync({ ids, action, tags });
  };

  const deleteMemes = async (list: MemeDto[], opts: { reject?: boolean } = {}) => {
    if (!list.length) return null;
    const ids = new Set(list.map((m) => m.id));
    const direct = (triggers ?? []).filter((t) => t.selection.mode === 'specific' && ids.has(t.selection.memeId));
    const uses = list.reduce((s, m) => s + m.uses, 0);
    const n = list.length;
    const impact = [opts.reject ? `${plural(n, 'suggestion')} from members` : `${plural(n, 'meme')} · used ${plural(uses, 'time')} in total`];
    if (direct.length) impact.push(`${plural(direct.length, 'trigger')} pick${direct.length === 1 ? 's' : ''} one of these directly and will need a new meme: ${direct.map((t) => t.name).join(', ')}`);
    return confirmAction({
      title: opts.reject ? (n === 1 ? 'Reject this suggestion?' : `Reject ${plural(n, 'suggestion')}?`) : n === 1 ? 'Delete this meme?' : `Delete ${plural(n, 'meme')}?`,
      body: 'The images are removed from the library and can’t be picked by triggers again. This can’t be undone.',
      impact,
      confirmLabel: opts.reject ? 'Reject' : `Delete ${n > 1 ? plural(n, 'meme') : 'meme'}`,
      typedConfirm: n > 5 ? 'delete' : undefined,
      onConfirm: () => runBulk('delete', [...ids]),
    });
  };

  const onBulkDelete = async () => {
    const r = await deleteMemes(selectedMemes);
    if (r !== null) setSelected(new Set());
  };

  if (q.isError) {
    return (
      <Card padded={false}>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pending suggestions */}
      {pending.length > 0 && (
        <Card>
          <CardHeader title={<>Suggestions from members <Pill tone="under">{fmtInt(pending.length)}</Pill></>} aside="Approved memes join the library as they are. You can edit before approving." />
          <div className="grid gap-3" style={GRID}>
            {pending.map((m) => (
              <article key={m.id} className="flex flex-col overflow-hidden rounded-[14px] border border-hairline bg-white">
                <button type="button" onClick={() => setEditingId(m.id)} aria-label={`Review ${m.caption || 'suggestion'}`} className="block">
                  <MemeImage url={m.thumbUrl ?? m.url} alt="" />
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <span className="line-clamp-2 text-[13px] font-semibold">{m.caption || 'No caption'}</span>
                  <PersonCell person={m.suggestedBy} size={20} className="text-[12px]" />
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    <Button size="sm" loading={update.isPending && update.variables?.id === m.id} onClick={() => update.mutate({ id: m.id, body: { status: 'approved' } })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void deleteMemes([m], { reject: true })}>
                      Reject
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search captions or tags" />
        <FilterSelect label="Tone" value={tone} onChange={setTone} options={[{ value: '', label: 'All tones' }, ...(['roast', 'celebrate', 'neutral'] as MemeTone[]).map((t) => ({ value: t, label: TONE_LABELS[t] }))]} />
        <FilterSelect label="Tag" value={tag} onChange={setTag} options={[{ value: '', label: 'All tags' }, ...libraryTags.map((t) => ({ value: t, label: tagLabel(t) }))]} />
        <FilterSelect label="On or off" value={enabled} onChange={setEnabled} options={[{ value: '', label: 'On and off' }, { value: 'on', label: 'Switched on' }, { value: 'off', label: 'Switched off' }]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'approved', label: 'In library' }, { value: 'pending', label: 'Suggestions' }, { value: '', label: 'Everything' }]} />
        <FilterSelect label="Sort" value={sort} onChange={(v) => setSort(v as Sort)} options={[{ value: 'used', label: 'Most used' }, { value: 'recent', label: 'Recently used' }, { value: 'newest', label: 'Newest' }]} />
        <div className="ml-auto flex items-center gap-2">
          {selecting ? (
            <Button variant="secondary" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={stopSelecting}>
              Done selecting
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={<CheckSquare className="h-3.5 w-3.5" />} onClick={() => setSelecting(true)} disabled={!all.length}>
              Select
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {q.isPending ? (
        <div className="grid gap-3" style={GRID} role="status" aria-label="Loading memes">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="flex flex-col overflow-hidden rounded-[16px] border border-border bg-card">
              <div className="skeleton aspect-square rounded-none" />
              <div className="flex flex-col gap-2 p-3">
                <div className="skeleton h-3.5 w-4/5" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<ImagePlus className="h-5 w-5" />}
            title="No memes yet"
            body="Upload a few images and tag them (celebrate, gym, comeback…). Triggers pick memes by tag."
            action={
              <Button icon={<ImagePlus className="h-4 w-4" />} onClick={onUpload}>
                Upload meme
              </Button>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="No memes match"
            body="Try a different search or clear the filters."
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setTone('');
                    setTag('');
                    setEnabled('');
                    setStatus('approved');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0" style={GRID} aria-label="Memes">
          {visible.map((m, i) => (
            <motion.li key={m.id} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: reduce ? 0 : Math.min(i, 14) * 0.022, ease: [0.2, 0.8, 0.2, 1] }}>
              <MemeCard meme={m} selecting={selecting} selected={selected.has(m.id)} onSelect={() => toggleSelect(m.id)} onEdit={() => setEditingId(m.id)} onToggle={(v) => toggle.mutate({ id: m.id, enabled: v })} />
            </motion.li>
          ))}
        </ul>
      )}
      {!q.isPending && all.length > 0 && (
        <span className="text-[12px] text-muted">
          Showing {fmtInt(visible.length)} of {fmtInt(all.length)} memes
          {selected.size > 0 && ` · ${fmtInt(selected.size)} selected`}
        </span>
      )}

      {/* Bulk bar */}
      {selecting && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-2 rounded-[20px] border border-border bg-white/95 p-2.5 pl-4 shadow-[0_20px_60px_rgba(23,23,28,0.14)] backdrop-blur" role="toolbar" aria-label="Bulk actions">
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#B6316C]"
              checked={allVisibleSelected}
              onChange={(e) => setSelected((s) => {
                const n = new Set(s);
                for (const m of visible) {
                  if (e.target.checked) n.add(m.id);
                  else n.delete(m.id);
                }
                return n;
              })}
            />
            {selected.size ? `${fmtInt(selected.size)} selected` : 'Select all shown'}
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="secondary" disabled={!selected.size} loading={bulk.isPending && bulk.variables?.action === 'enable'} onClick={() => void runBulk('enable', [...selected]).catch(() => {})}>
              Switch on
            </Button>
            <Button size="sm" variant="secondary" disabled={!selected.size} loading={bulk.isPending && bulk.variables?.action === 'disable'} onClick={() => void runBulk('disable', [...selected]).catch(() => {})}>
              Switch off
            </Button>
            <Button size="sm" variant="secondary" icon={<Tag className="h-3.5 w-3.5" />} disabled={!selected.size} onClick={() => setTagMode('add_tags')}>
              Add tags
            </Button>
            <Button size="sm" variant="secondary" icon={<TagsIcon className="h-3.5 w-3.5" />} disabled={!selected.size} onClick={() => setTagMode('remove_tags')}>
              Remove tags
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={!selected.size} onClick={() => void onBulkDelete()}>
              Delete
            </Button>
          </div>
        </div>
      )}

      <EditMemeModal
        meme={editing}
        onClose={() => setEditingId(null)}
        tagSuggestions={suggestions}
        onDelete={async (m) => {
          const r = await deleteMemes([m], { reject: m.status === 'pending' });
          if (r !== null) setEditingId(null);
        }}
      />
      <BulkTagsModal
        mode={tagMode}
        count={selected.size}
        busy={bulk.isPending}
        onClose={() => setTagMode(null)}
        suggestions={tagMode === 'remove_tags' ? Array.from(new Set(selectedMemes.flatMap((m) => m.tags))).sort() : suggestions}
        onApply={async (tags) => {
          try {
            await runBulk(tagMode!, [...selected], tags);
            setTagMode(null);
          } catch {
            /* toast shown */
          }
        }}
      />
    </div>
  );
}

function MemeCard({ meme: m, selecting, selected, onSelect, onEdit, onToggle }: { meme: MemeDto; selecting: boolean; selected: boolean; onSelect: () => void; onEdit: () => void; onToggle: (v: boolean) => void }) {
  const name = m.caption || 'Untitled meme';
  return (
    <article className={cn('relative flex h-full flex-col overflow-hidden rounded-[16px] border bg-card transition-[border-color,box-shadow]', selected ? 'border-accent shadow-[0_0_0_2px_rgba(182,49,108,0.3)]' : 'border-border')}>
      <button type="button" onClick={selecting ? onSelect : onEdit} aria-label={selecting ? `${selected ? 'Deselect' : 'Select'} ${name}` : `Edit ${name}`} aria-pressed={selecting ? selected : undefined} className="block">
        <MemeImage url={m.thumbUrl ?? m.url} alt="" className={cn(!m.enabled && 'opacity-55 grayscale-[0.4]')} />
      </button>
      {selecting && (
        <input type="checkbox" aria-label={`Select ${name}`} checked={selected} onChange={onSelect} className="absolute left-2.5 top-2.5 h-5 w-5 accent-[#B6316C] shadow" />
      )}
      <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
        <TonePill tone={m.tone} className="shadow-sm" />
        {m.status === 'pending' && <Pill tone="under">Suggested</Pill>}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-2.5 pt-2.5">
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug" title={m.caption}>
          {m.caption || <span className="text-muted">No caption</span>}
        </span>
        {m.tags.length > 0 && <span className="line-clamp-1 text-[12px] text-muted">{m.tags.map((t) => `#${t}`).join(' ')}</span>}
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] text-muted">
          <span className="inline-flex items-center gap-1" title="Times used">
            <Repeat2 aria-hidden className="h-3 w-3" />
            {fmtInt(m.uses)}
          </span>
          <span className="inline-flex items-center gap-1" title="Reactions">
            <Heart aria-hidden className="h-3 w-3" />
            {fmtInt(m.reactions)}
          </span>
          <span title={m.lastUsedAt ? `Last used ${fmtDateTime(m.lastUsedAt)}` : 'Never used'}>{m.lastUsedAt ? fmtRelative(m.lastUsedAt) : 'unused'}</span>
        </span>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <span className={cn('text-[12px] font-semibold', m.enabled ? 'text-ink' : 'text-muted')}>{m.enabled ? 'On' : 'Off'}</span>
          <Toggle checked={m.enabled} onChange={onToggle} label={`${m.enabled ? 'Switch off' : 'Switch on'} ${name}`} />
        </div>
      </div>
    </article>
  );
}
