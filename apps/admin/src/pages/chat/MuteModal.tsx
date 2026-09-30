import { useState } from 'react';
import type { PersonRef } from '@clubhouse/contracts';
import { MuteRequest } from '@clubhouse/contracts';
import { useMute } from '@/features/chat';
import {
  Button,
  Field,
  FormGrid,
  MemberSelect,
  Modal,
  NumberInput,
  PersonCell,
  Select,
  Textarea,
} from '@/ui';

const PERIODS = [
  { value: '1', label: '1 hour' },
  { value: '8', label: '8 hours' },
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
  { value: 'custom', label: 'Custom…' },
];

/** Mute a member in chat for a period, with a reason (audited). Member is fixed when opened from a message. */
export function MuteModal({
  open,
  onClose,
  person,
}: {
  open: boolean;
  onClose: () => void;
  person: PersonRef | null;
}) {
  const mute = useMute();
  const [userId, setUserId] = useState('');
  const [period, setPeriod] = useState('24');
  const [custom, setCustom] = useState<number | null>(48);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form each time the modal opens (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUserId(person?.id ?? '');
      setPeriod('24');
      setCustom(48);
      setReason('');
      setErrors({});
    }
  }

  const hours = period === 'custom' ? (custom ?? 0) : Number(period);
  const span =
    hours >= 48
      ? `about ${Math.round(hours / 24)} days`
      : hours > 0
        ? `${hours} ${hours === 1 ? 'hour' : 'hours'}`
        : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = MuteRequest.safeParse({ userId, hours, reason });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? 'form');
        errs[k] ??=
          k === 'userId'
            ? 'Choose a member'
            : k === 'hours'
              ? 'Use whole hours from 1 to 720 (30 days)'
              : k === 'reason'
                ? 'Add a short reason (3–200 characters)'
                : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    mute.mutate(parsed.data, { onSuccess: onClose });
  };

  return (
    <Modal open={open} onClose={onClose} eyebrow="Team chat" title="Mute member" width={460}>
      <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          They can still read chat and log as usual, they just can’t post until the mute ends.
          Recorded in the audit log.
        </p>
        {person ? (
          <PersonCell person={person} />
        ) : (
          <Field label="Member" required error={errors.userId}>
            <MemberSelect value={userId} onChange={(id) => setUserId(id)} />
          </Field>
        )}
        <FormGrid min={160}>
          <Field label="For" required>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {period === 'custom' && (
            <Field label="Hours" required error={errors.hours}>
              <NumberInput
                min={1}
                max={720}
                step={1}
                value={custom}
                onValue={(v) => setCustom(v == null ? null : Math.round(v))}
                invalid={!!errors.hours}
              />
            </Field>
          )}
        </FormGrid>
        {span && (
          <span className="-mt-1 text-[12px] text-muted">
            Muted for {span} from when you confirm.
          </span>
        )}
        <Field label="Reason" required hint={`${reason.length}/200`} error={errors.reason}>
          <Textarea
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Cooling off after a heated thread"
            invalid={!!errors.reason}
          />
        </Field>
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={mute.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger-solid" loading={mute.isPending}>
            Mute
          </Button>
        </div>
      </form>
    </Modal>
  );
}
