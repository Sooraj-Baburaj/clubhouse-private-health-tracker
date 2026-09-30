import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { errorMessage } from '@/lib/errors';
import { Button } from './Button';
import { Field, Input, Textarea } from './Field';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: ReactNode;
  eyebrow?: ReactNode;
  /** What will happen, including counts of what is affected. */
  body?: ReactNode;
  /** Optional bullet list of affected things ("12 messages", "3 images"). */
  impact?: ReactNode[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  /** When set, the confirm button stays disabled until this exact text is typed. */
  typedConfirm?: string;
  /** Ask for a reason (min 3 chars) — audited, high-impact actions. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Runs while the dialog stays open (busy state); throwing keeps it open and shows the error. */
  onConfirm?: (reason: string) => Promise<unknown> | unknown;
}

/** Confirmation dialog with optional typed confirmation and reason. */
export function ConfirmDialog({ open, onClose, onDone, ...o }: ConfirmOptions & { open: boolean; onClose: () => void; onDone?: (reason: string) => void }) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setTyped('');
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);
  const typedOk = !o.typedConfirm || typed.trim() === o.typedConfirm;
  const reasonOk = !o.requireReason || reason.trim().length >= 3;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedOk || !reasonOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await o.onConfirm?.(reason.trim());
      onDone?.(reason.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const danger = (o.tone ?? 'danger') === 'danger';
  return (
    <Modal open={open} onClose={() => !busy && onClose()} eyebrow={o.eyebrow} title={o.title} label={typeof o.title === 'string' ? o.title : 'Confirm'} width={440}>
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        {o.body && <div className="text-[13px] leading-relaxed text-muted">{o.body}</div>}
        {o.impact && o.impact.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 rounded-[12px] bg-bg p-3 text-[13px] font-semibold">
            {o.impact.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
        {o.requireReason && (
          <Field label={o.reasonLabel ?? 'Reason'} hint="Recorded in the audit log.">
            <Textarea data-autofocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={o.reasonPlaceholder ?? 'Why are you doing this?'} maxLength={300} />
          </Field>
        )}
        {o.typedConfirm && (
          <Field label={<>Type <b className="font-mono">{o.typedConfirm}</b> to confirm</>}>
            <Input data-autofocus={!o.requireReason || undefined} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
          </Field>
        )}
        {error && (
          <div role="alert" className="text-[13px] font-semibold text-accent-dark">
            {error}
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy} data-autofocus={!o.requireReason && !o.typedConfirm ? true : undefined}>
            {o.cancelLabel ?? 'Cancel'}
          </Button>
          <Button type="submit" variant={danger ? 'danger-solid' : 'primary'} loading={busy} disabled={!typedOk || !reasonOk}>
            {o.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ───────── Imperative API: `await confirmAction({...})` resolves to the reason (string) or null if cancelled. ───────── */

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (v: string | null) => void }) | null;
}
const useConfirmStore = create<ConfirmState>(() => ({ current: null }));

export function confirmAction(o: ConfirmOptions): Promise<string | null> {
  return new Promise((resolve) => {
    useConfirmStore.getState().current?.resolve(null);
    useConfirmStore.setState({ current: { ...o, resolve } });
  });
}

/** Mount once (RootLayout). */
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current);
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmState['current']>(null);
  useEffect(() => {
    if (current) {
      setOpts(current);
      setOpen(true);
    }
  }, [current]);
  if (!opts) return null;
  let settled = false;
  return (
    <ConfirmDialog
      {...opts}
      open={open}
      onDone={(reason) => {
        settled = true;
        opts.resolve(reason);
      }}
      onClose={() => {
        if (!settled) opts.resolve(null);
        setOpen(false);
        useConfirmStore.setState({ current: null });
      }}
    />
  );
}
