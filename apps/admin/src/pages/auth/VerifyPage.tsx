import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '@clubhouse/client';
import { TotpCodeRequest } from '@clubhouse/contracts';
import { queryClient } from '@/app/queryClient';
import { errorMessage } from '@/lib/errors';
import { Button, Field, Input } from '@/ui';
import { AuthError, AuthLayout } from './AuthLayout';

/** Second step for accounts with an authenticator app: 6-digit code or a recovery code (xxxx-xxxx). */
export function VerifyPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = TotpCodeRequest.safeParse({ code: code.replace(/\s/g, '') });
    if (!parsed.success) {
      setError(recovery ? 'Recovery codes look like abcd-1234.' : 'Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.verifyTotp(parsed.data.code);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      const me = await api.me().catch(() => null);
      if (me?.user.mustChangePassword) await navigate({ to: '/change-password' });
      else if (me?.user.role === 'member') await navigate({ to: '/forbidden' });
      else await navigate({ to: '/' });
    } catch (err) {
      setError(errorMessage(err, 'That code didn’t work. Try the newest one.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout label="Two-step verification">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="eyebrow">Two-step verification</div>
        <h1 className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.045em]">{recovery ? 'Use a recovery code.' : 'Enter your code.'}</h1>
        <p className="m-0 text-[13px] leading-relaxed text-muted">{recovery ? 'Each recovery code works once.' : 'Open your authenticator app and type the 6-digit code for Clubhouse.'}</p>
        <AuthError message={error} />
        <Field label={recovery ? 'Recovery code' : 'Authenticator code'}>
          <Input
            key={recovery ? 'r' : 't'}
            autoFocus
            inputMode={recovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            maxLength={recovery ? 9 : 6}
            placeholder={recovery ? 'abcd-1234' : '123456'}
            value={code}
            onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ''))}
            className="h-12 rounded-[12px] text-center font-mono text-[20px] tracking-[0.35em]"
          />
        </Field>
        <Button type="submit" size="lg" block loading={busy}>
          Verify
        </Button>
        <div className="flex items-center justify-between text-[13px]">
          <button
            type="button"
            className="font-semibold text-accent hover:text-accent-dark"
            onClick={() => {
              setRecovery((r) => !r);
              setCode('');
              setError(null);
            }}
          >
            {recovery ? 'Use authenticator code' : 'Use a recovery code'}
          </button>
          <button
            type="button"
            className="text-muted hover:text-ink"
            onClick={async () => {
              await api.auth.logout().catch(() => undefined);
              queryClient.clear();
              void navigate({ to: '/login' });
            }}
          >
            Back to sign in
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
