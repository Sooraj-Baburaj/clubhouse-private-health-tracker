import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@clubhouse/ui';
import { useUploadLogo } from '@/features/settings';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { initialsOf } from '@/lib/format';
import { Button, Card, CardHeader, ChipInput, Pill, Select } from '@/ui';

/** One settings section: anchored card with title, short description and a "changed" marker. */
export function SettingsCard({ id, title, description, actions, dirty, children, aside }: { id: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; dirty?: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <Card id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-1.5">
        <CardHeader
          id={`${id}-title`}
          title={
            <>
              {title}
              {dirty && (
                <Pill tone="under" className="ml-1 !py-[1px] !text-[11px]">
                  Unsaved
                </Pill>
              )}
            </>
          }
          aside={aside}
          actions={actions}
        />
        {description && <p className="m-0 max-w-[640px] text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

/** "Default: x" hint text. */
export function DefaultHint({ children }: { children: ReactNode }) {
  return <span className="text-[12px] text-muted">Default {children}</span>;
}

/* ───────── Timezone ───────── */

function offsetOf(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

function supportedZones(): string[] {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  } catch {
    return [];
  }
}

export function browserZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Every IANA zone the browser knows (with its current UTC offset); falls back to the saved value and UTC. */
export function TimezoneSelect({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const zones = useMemo(() => {
    const now = new Date();
    const list = supportedZones();
    const all = Array.from(new Set([value, ...list, ...(list.includes('UTC') ? [] : ['UTC'])])).filter(Boolean);
    return all.map((z) => ({ z, label: `${z.replace(/_/g, ' ')}${offsetOf(z, now) ? ` (${offsetOf(z, now)})` : ''}` }));
  }, [value]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid}>
      {zones.map((o) => (
        <option key={o.z} value={o.z}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

/* ───────── Logo ───────── */

const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/** Logo preview + upload/replace/remove. Uploads immediately (kind "logo"); the id is saved with the form. */
export function LogoField({ url, teamName, onUploaded, onRemove, canRemove }: { url: string | null; teamName: string; onUploaded: (id: string, url: string | null) => void; onRemove: () => void; canRemove: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadLogo();
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? url;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file (PNG, JPG or WebP).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('That image is over 8 MB. Try a smaller one.');
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local);
    upload.mutate(file, {
      onSuccess: (r) => {
        onUploaded(r.id, r.url ?? r.thumbUrl ?? local);
        toast.success('Logo uploaded. Save changes to use it.');
      },
      onError: (e) => {
        toast.error(errorMessage(e));
        setPreview(null);
        URL.revokeObjectURL(local);
      },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className={cn('relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[16px] border border-border bg-bg', !shown && 'border-dashed')}>
        {shown ? <img src={shown} alt={`${teamName} logo`} className="h-full w-full object-cover" /> : <span className="font-display text-[20px] font-extrabold tracking-[-0.04em] text-muted">{initialsOf(teamName || 'C')}</span>}
        {upload.isPending && (
          <span className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 aria-label="Uploading" className="h-5 w-5 animate-spin text-accent" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<ImagePlus className="h-3.5 w-3.5" />} loading={upload.isPending} onClick={() => input.current?.click()}>
            {shown ? 'Replace logo' : 'Upload logo'}
          </Button>
          {shown && canRemove && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              disabled={upload.isPending}
              onClick={() => {
                setPreview(null);
                onRemove();
              }}
            >
              Remove
            </Button>
          )}
        </div>
        <span className="text-[12px] text-muted">Square PNG, JPG or WebP, up to 8 MB. Shown on the sign-in screen and in the app header.</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Team logo file"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* ───────── Milestones ───────── */

/** ChipInput of positive whole numbers: sorted, de-duplicated, at most `max`. */
export function MilestonesInput({ value, onChange, label, max = 12, suggestions }: { value: number[]; onChange: (v: number[]) => void; label: string; max?: number; suggestions?: number[] }) {
  const [rejected, setRejected] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <ChipInput
        label={label}
        max={max}
        maxLength={4}
        placeholder="Add a day count and press Enter"
        value={value.map(String)}
        suggestions={suggestions?.map(String)}
        onChange={(strs) => {
          const bad = strs.filter((s) => !/^\d+$/.test(s) || Number(s) <= 0);
          setRejected(bad.length ? `“${bad[0]}” isn’t a whole number of days` : null);
          const nums = Array.from(new Set(strs.filter((s) => /^\d+$/.test(s) && Number(s) > 0).map(Number))).sort((a, b) => a - b);
          onChange(nums.slice(0, max));
        }}
      />
      {rejected && (
        <span role="alert" className="text-[12px] font-semibold text-accent-dark">
          {rejected}
        </span>
      )}
    </div>
  );
}
