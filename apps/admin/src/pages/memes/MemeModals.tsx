import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CreateMemeRequest, MEME_TONES, UpdateMemeRequest, type MemeDto, type MemeTone } from '@clubhouse/contracts';
import { useCreateMeme, useUpdateMeme } from '@/features/memes';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { fmtBytes, fmtDateTime, fmtInt, fmtRelative } from '@/lib/format';
import { Button, ChipInput, Field, KeyValues, Modal, PersonCell, Segmented, Textarea, ToggleRow } from '@/ui';
import { issuesAt, MemeImage, TONE_LABELS, type Issue } from './shared';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const TONE_OPTIONS = MEME_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }));

/* ───────── Upload ───────── */

export function UploadMemeModal({ open, onClose, tagSuggestions }: { open: boolean; onClose: () => void; tagSuggestions: string[] }) {
  const create = useCreateMeme();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewFor, setPreviewFor] = useState<{ file: File; url: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tone, setTone] = useState<MemeTone>('celebrate');
  const [enabled, setEnabled] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Reset each time the modal opens (adjust state during render on the open transition).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFile(null);
      setFileError(null);
      setCaption('');
      setTags([]);
      setTone('celebrate');
      setEnabled(true);
      setSubmitted(false);
      setApiError(null);
    }
  }

  // Object URL for the picked file; revoked when the file changes or the modal unmounts.
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL is an external resource that needs effect cleanup (revoke); StrictMode-safe unlike useMemo
    setPreviewFor({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const preview = file && previewFor?.file === file ? previewFor.url : null;

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) {
      setFileError('Use a PNG, JPG, WebP or GIF image.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`That file is ${fmtBytes(f.size)}. Keep memes under 2 MB.`);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const parsed = CreateMemeRequest.omit({ imageId: true }).safeParse({ caption: caption.trim(), tags, tone, enabled });
  const issues = (parsed.success ? [] : parsed.error.issues) as unknown as Issue[];
  const canSubmit = !!file && parsed.success;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setApiError(null);
    if (!file || !parsed.success) return;
    try {
      await create.mutateAsync({ file, ...parsed.data });
      onClose();
    } catch (err) {
      setApiError(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={() => !create.isPending && onClose()} eyebrow="Meme library" title="Upload meme" width={520}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pick(e.dataTransfer.files[0]);
          }}
          className={cn('flex items-center gap-4 rounded-[16px] border border-dashed p-3 transition-colors', dragOver ? 'border-accent bg-accent-tint/30' : 'border-border bg-white/70')}
        >
          <div className="w-[112px] shrink-0">
            <MemeImage url={preview} alt="Preview of the selected image" rounded />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={inputId} className="text-[13px] font-semibold">
              Image <span className="text-accent">*</span>
            </label>
            <span className="text-[12px] leading-snug text-muted">{file ? `${file.name} · ${fmtBytes(file.size)}` : 'PNG, JPG, WebP or GIF up to 2 MB. Drop it here or choose a file.'}</span>
            <input ref={fileRef} id={inputId} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            <Button variant="outline" size="sm" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()} className="self-start">
              {file ? 'Choose another' : 'Choose image'}
            </Button>
            {(fileError || (submitted && !file)) && (
              <span role="alert" className="text-[12px] font-semibold text-accent-dark">
                {fileError ?? 'Choose an image to upload.'}
              </span>
            )}
          </div>
        </div>
        <MemeFields caption={caption} setCaption={setCaption} tags={tags} setTags={setTags} tone={tone} setTone={setTone} issues={submitted ? issues : []} tagSuggestions={tagSuggestions} />
        <ToggleRow label="Switched on" hint="Triggers can pick it straight away." checked={enabled} onChange={setEnabled} className="border-t-0 py-0" />
        {apiError && (
          <div role="alert" className="text-[13px] font-semibold text-accent-dark">
            {apiError}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={submitted && !canSubmit}>
            Upload
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────── Shared caption / tags / tone fields ───────── */

function MemeFields({ caption, setCaption, tags, setTags, tone, setTone, issues, tagSuggestions }: { caption: string; setCaption: (v: string) => void; tags: string[]; setTags: (v: string[]) => void; tone: MemeTone; setTone: (t: MemeTone) => void; issues: Issue[]; tagSuggestions: string[] }) {
  return (
    <>
      <Field label="Caption" labelAside={<span className="font-mono text-[11px] text-muted">{caption.length}/160</span>} error={issuesAt(issues, ['caption']).join(' ') || undefined} hint="Shown under the image. Triggers can override it.">
        <Textarea rows={2} maxLength={160} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. When the salad is the side dish" />
      </Field>
      <Field as="div" label="Tags" hint={`Triggers pick memes by tag. Up to 10 (${tags.length}/10).`} error={issuesAt(issues, ['tags']).join(' ') || undefined}>
        <ChipInput label="Meme tags" value={tags} onChange={(v) => setTags(v.map((t) => t.toLowerCase().replace(/\s+/g, '_')))} max={10} maxLength={30} suggestions={tagSuggestions} placeholder="Type a tag and press Enter" />
      </Field>
      <Field as="div" label="Tone" hint={tone === 'roast' ? 'Roasts only go to members who opted in.' : undefined}>
        <Segmented label="Tone" value={tone} onChange={setTone} options={TONE_OPTIONS} />
      </Field>
    </>
  );
}

/* ───────── Edit ───────── */

export function EditMemeModal({ meme, onClose, onDelete, tagSuggestions }: { meme: MemeDto | undefined; onClose: () => void; onDelete: (m: MemeDto) => void; tagSuggestions: string[] }) {
  const update = useUpdateMeme();
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tone, setTone] = useState<MemeTone>('neutral');
  const [enabled, setEnabled] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [last, setLast] = useState<MemeDto | undefined>(meme);

  if (meme && loadedFor !== meme.id) {
    setLoadedFor(meme.id);
    setLast(meme);
    setCaption(meme.caption);
    setTags(meme.tags);
    setTone(meme.tone);
    setEnabled(meme.enabled);
    setApiError(null);
  }
  if (!meme && loadedFor !== null) setLoadedFor(null);

  const shown = meme ?? last;
  const body = { caption: caption.trim(), tags, tone, enabled };
  const parsed = UpdateMemeRequest.safeParse(body);
  const issues = (parsed.success ? [] : parsed.error.issues) as unknown as Issue[];
  const dirty = !!shown && (body.caption !== shown.caption || body.tone !== shown.tone || body.enabled !== shown.enabled || JSON.stringify(body.tags) !== JSON.stringify(shown.tags));
  const pending = shown?.status === 'pending';

  const save = async (approve: boolean) => {
    if (!shown || !parsed.success) return;
    setApiError(null);
    try {
      await update.mutateAsync({ id: shown.id, body: approve ? { ...parsed.data, status: 'approved' } : parsed.data });
      onClose();
    } catch (err) {
      setApiError(errorMessage(err));
    }
  };

  const facts = useMemo<[string, React.ReactNode][]>(() => {
    if (!shown) return [];
    const rows: [string, React.ReactNode][] = [
      ['Uses', fmtInt(shown.uses)],
      ['Last used', <span title={shown.lastUsedAt ? fmtDateTime(shown.lastUsedAt) : undefined}>{fmtRelative(shown.lastUsedAt)}</span>],
      ['Reactions', fmtInt(shown.reactions)],
    ];
    if (shown.suggestedBy) rows.push(['Suggested by', <PersonCell person={shown.suggestedBy} size={20} />]);
    return rows;
  }, [shown]);

  return (
    <Modal open={!!meme} onClose={() => !update.isPending && onClose()} eyebrow={pending ? 'Suggestion · pending review' : 'Meme library'} title="Edit meme" width={600}>
      {shown && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <MemeImage url={shown.url ?? shown.thumbUrl} alt={shown.caption || 'Meme'} rounded />
              <KeyValues items={facts} className="text-[12px]" />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <MemeFields caption={caption} setCaption={setCaption} tags={tags} setTags={setTags} tone={tone} setTone={setTone} issues={issues} tagSuggestions={tagSuggestions} />
              <ToggleRow label="Switched on" hint="Off memes are never picked by triggers." checked={enabled} onChange={setEnabled} className="border-t-0 py-0" />
            </div>
          </div>
          {apiError && (
            <div role="alert" className="text-[13px] font-semibold text-accent-dark">
              {apiError}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(shown)} disabled={update.isPending}>
              {pending ? 'Reject' : 'Delete'}
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
                Cancel
              </Button>
              {pending ? (
                <Button loading={update.isPending} disabled={!parsed.success} onClick={() => void save(true)}>
                  Approve
                </Button>
              ) : (
                <Button type="submit" loading={update.isPending} disabled={!parsed.success || !dirty}>
                  Save
                </Button>
              )}
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ───────── Bulk add / remove tags ───────── */

export function BulkTagsModal({ mode, count, onClose, onApply, suggestions, busy }: { mode: 'add_tags' | 'remove_tags' | null; count: number; onClose: () => void; onApply: (tags: string[]) => Promise<void>; suggestions: string[]; busy: boolean }) {
  const [tags, setTags] = useState<string[]>([]);
  // Clear the tags each time the modal opens in a mode (adjust state during render on change).
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode) setTags([]);
  }
  const adding = mode === 'add_tags';
  return (
    <Modal open={!!mode} onClose={() => !busy && onClose()} eyebrow={`${fmtInt(count)} selected`} title={adding ? 'Add tags' : 'Remove tags'} width={460}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tags.length) void onApply(tags);
        }}
        className="flex flex-col gap-4"
      >
        <Field as="div" label="Tags" hint={adding ? 'Added to every selected meme (each meme keeps at most 10 tags).' : 'Removed from every selected meme that has them.'}>
          <ChipInput label="Tags" value={tags} onChange={(v) => setTags(v.map((t) => t.toLowerCase().replace(/\s+/g, '_')))} max={10} maxLength={30} suggestions={suggestions} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!tags.length}>
            {adding ? 'Add tags' : 'Remove tags'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
