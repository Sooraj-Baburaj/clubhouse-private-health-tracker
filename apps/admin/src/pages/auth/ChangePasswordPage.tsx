import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '@clubhouse/client';
import { ChangePasswordRequest, NewPassword, PASSWORD_MIN } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { queryClient } from '@/app/queryClient';
import { errorMessage } from '@/lib/errors';
import { Button, Field, Input } from '@/ui';
import { AuthError, AuthLayout } from './AuthLayout';

/** Forced change after a temporary password (and voluntary change). */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = next ? NewPassword.safeParse(next) : null;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return setError('The two new passwords don’t match.');
    const parsed = ChangePasswordRequest.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the fields.');
    setBusy(true);
    setError(null);
    try {
      await api.auth.changePassword(parsed.data);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Password updated');
      const me = await api.me().catch(() => null);
      await navigate({ to: me?.user.role === 'member' ? '/forbidden' : '/' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout label="Change password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="eyebrow">One more step</div>
        <h1 className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.045em]">Choose a new password.</h1>
        <p className="m-0 text-[13px] leading-relaxed text-muted">Your temporary password works once. Pick something only you know — at least {PASSWORD_MIN} characters, mixing letters with numbers or symbols.</p>
        <AuthError message={error} />
        <Field label="Current (temporary) password">
          <Input autoFocus type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-11 rounded-[12px]" />
        </Field>
        <Field label="New password" error={strength && !strength.success ? strength.error.issues[0]?.message : undefined} hint={strength?.success ? 'Looks good.' : undefined}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-11 rounded-[12px]" invalid={!!strength && !strength.success} />
        </Field>
        <Field label="Repeat new password" error={mismatch ? 'Doesn’t match yet.' : undefined}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 rounded-[12px]" invalid={mismatch} />
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!current || !next || !confirm}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}
