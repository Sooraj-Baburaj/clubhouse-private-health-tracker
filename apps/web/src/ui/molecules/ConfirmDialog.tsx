import { Dialog } from '@clubhouse/ui';
import { Button } from '@/ui/atoms/Button';

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} label={title} className="w-[min(420px,calc(100vw-32px))] rounded-[32px] bg-surface p-6 text-text shadow-lg" backdropClassName="bg-[rgba(10,8,6,0.55)]">
      <div className="flex flex-col gap-3">
        <div className="font-heading text-[22px] leading-tight">{title}</div>
        {body && <p className="m-0 text-[14px] text-neutral-700">{body}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
