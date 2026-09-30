import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { adminApi } from '@clubhouse/client';
import { ClearChatRequest } from '@clubhouse/contracts';
import { useClearChat } from '@/features/chat';
import { errorMessage } from '@/lib/errors';
import {
  fmtDate,
  fmtDateTime,
  fmtInt,
  fromDateTimeLocal,
  todayLocal,
  toDateTimeLocal,
} from '@/lib/format';
import { Button, confirmAction, Field, FormGrid, Input, Inset, Modal, Select } from '@/ui';

type Preset = '24h' | '7d' | 'before' | 'custom';

const EPOCH = new Date(0).toISOString();

function rangeFor(
  preset: Preset,
  before: string,
  cFrom: string,
  cTo: string,
): { from: string; to: string } | null {
  const now = Date.now();
  if (preset === '24h')
    return { from: new Date(now - 24 * 3_600_000).toISOString(), to: new Date(now).toISOString() };
  if (preset === '7d')
    return {
      from: new Date(now - 7 * 24 * 3_600_000).toISOString(),
      to: new Date(now).toISOString(),
    };
  if (preset === 'before') {
    if (!before) return null;
    const d = new Date(`${before}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : { from: EPOCH, to: d.toISOString() };
  }
  const f = fromDateTimeLocal(cFrom);
  const t = fromDateTimeLocal(cTo);
  return f && t ? { from: f, to: t } : null;
}

/** "Clear chat" (design): pick a period → preview counts → typed confirmation → clear. Audited, irreversible. */
export function ClearChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clear = useClearChat();
  const [preset, setPreset] = useState<Preset>('24h');
  const [before, setBefore] = useState(() => todayLocal(-30));
  const [cFrom, setCFrom] = useState(() =>
    toDateTimeLocal(new Date(Date.now() - 3 * 3_600_000).toISOString()),
  );
  const [cTo, setCTo] = useState(() => toDateTimeLocal(new Date().toISOString()));
  const [preview, setPreview] = useState<{
    from: string;
    to: string;
    messages: number;
    images: number;
    confirmWord: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPreview(null);
      setError(null);
      setConfirming(false);
    }
  }

  // Any change to the period invalidates the preview.
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview(null);
      setError(null);
    };

  const runPreview = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const r = rangeFor(preset, before, cFrom, cTo);
    if (!r) return setError(preset === 'before' ? 'Pick a date.' : 'Pick both a start and an end.');
    const parsed = ClearChatRequest.safeParse(r);
    if (!parsed.success || r.from >= r.to) return setError('The start needs to be before the end.');
    if (new Date(r.from).getTime() > Date.now())
      return setError('That period is in the future, so there’s nothing to clear.');
    setLoading(true);
    setError(null);
    try {
      const p = await adminApi.chat.clearPreview(r.from, r.to);
      setPreview({ ...r, ...p });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const runClear = async () => {
    if (!preview) return;
    setConfirming(true);
    const p = preview;
    const ok = await confirmAction({
      title: 'Clear these messages?',
      eyebrow: 'Clear chat',
      body: `Everything posted ${periodText(p.from, p.to)} is removed for everyone, including reactions and photos. This can’t be undone and is recorded in the audit log.`,
      impact: [
        `${fmtInt(p.messages)} ${p.messages === 1 ? 'message' : 'messages'}`,
        `${fmtInt(p.images)} ${p.images === 1 ? 'image' : 'images'}`,
      ],
      confirmLabel: 'Clear messages',
      typedConfirm: p.confirmWord,
      onConfirm: () => clear.mutateAsync({ from: p.from, to: p.to, confirm: p.confirmWord }),
    });
    if (ok === null) setConfirming(false);
    else onClose();
  };

  return (
    <Modal
      open={open && !confirming}
      onClose={onClose}
      eyebrow="Team chat"
      title="Clear chat"
      width={460}
    >
      <form onSubmit={runPreview} className="flex flex-col gap-3.5" noValidate>
        <Field label="Period">
          <Select value={preset} onChange={(e) => change(setPreset)(e.target.value as Preset)}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="before">Before a date</option>
            <option value="custom">Custom range</option>
          </Select>
        </Field>
        {preset === 'before' && (
          <Field
            label="Clear everything before"
            hint={
              before ? `Messages up to the start of ${fmtDate(before, { year: true })}` : undefined
            }
          >
            <Input
              type="date"
              value={before}
              max={todayLocal()}
              onChange={(e) => change(setBefore)(e.target.value)}
            />
          </Field>
        )}
        {preset === 'custom' && (
          <FormGrid min={180}>
            <Field label="From">
              <Input
                type="datetime-local"
                value={cFrom}
                max={cTo || undefined}
                onChange={(e) => change(setCFrom)(e.target.value)}
              />
            </Field>
            <Field label="To">
              <Input
                type="datetime-local"
                value={cTo}
                min={cFrom || undefined}
                onChange={(e) => change(setCTo)(e.target.value)}
              />
            </Field>
          </FormGrid>
        )}
        <div className="text-[13px] leading-relaxed text-muted">
          Messages, reactions and media in this period are removed for everyone. This can’t be
          undone and is recorded in the audit log.
        </div>
        {preview && (
          <div aria-live="polite">
            <Inset>
              {preview.messages === 0 ? (
                <span className="text-[13px] font-semibold">
                  Nothing to clear {periodText(preview.from, preview.to)}.
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <AlertTriangle aria-hidden className="h-4 w-4 text-accent-dark" />
                    {fmtInt(preview.messages)} {preview.messages === 1 ? 'message' : 'messages'} ·{' '}
                    {fmtInt(preview.images)} {preview.images === 1 ? 'image' : 'images'}
                  </span>
                  <span className="text-[12px] text-muted">
                    Posted {periodText(preview.from, preview.to)}.
                  </span>
                </>
              )}
            </Inset>
          </div>
        )}
        {error && (
          <div role="alert" className="text-[13px] font-semibold text-accent-dark">
            {error}
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {preview && preview.messages > 0 ? (
            <Button variant="danger-solid" onClick={() => void runClear()}>
              Clear messages
            </Button>
          ) : (
            <Button type="submit" variant="primary" loading={loading}>
              Preview
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function periodText(from: string, to: string): string {
  return from === EPOCH
    ? `before ${fmtDateTime(to)}`
    : `between ${fmtDateTime(from)} and ${fmtDateTime(to)}`;
}
