import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api, ApiError } from '@clubhouse/client';
import { LoginRequest } from '@clubhouse/contracts';
import { queryClient } from '@/app/queryClient';
import { errorMessage } from '@/lib/errors';
import { Button, Field, Input } from '@/ui';
import { AuthError, AuthLayout } from './AuthLayout';

/** Admin sign in (design: glass card). Routes to TOTP, forced password change, or the member-app notice. */
export function LoginPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ login?: string; password?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = LoginRequest.safeParse({ login, password, deviceLabel: 'Admin panel' });
    if (!parsed.success) {
      const f: { login?: string; password?: string } = {};
      for (const i of parsed.error.issues) f[i.path[0] as 'login' | 'password'] = i.message;
      setFieldErr(f);
      return;
    }
    setFieldErr({});
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.login(parsed.data);
      queryClient.clear();
      if (res.mfaRequired) await navigate({ to: '/verify' });
      else if (res.mustChangePassword) await navigate({ to: '/change-password' });
      else if (res.role === 'member') await navigate({ to: '/forbidden' });
      else await navigate({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const mins = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : 15;
        setError(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      } else if (err instanceof ApiError && err.status === 401) setError('That username and password don’t match.');
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout label="Sign in">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="eyebrow">Clubhouse Admin</div>
        <h1 className="m-0 font-display text-[34px] font-extrabold leading-none tracking-[-0.045em]">Sign in to manage the team.</h1>
        <AuthError message={error} />
        <Field label="Username or email" error={fieldErr.login}>
          <Input autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} invalid={!!fieldErr.login} className="h-11 rounded-[12px] px-3.5" />
        </Field>
        <Field label="Password" error={fieldErr.password}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fieldErr.password} className="h-11 rounded-[12px] px-3.5" />
        </Field>
        <Button type="submit" size="lg" block loading={busy}>
          Sign in
        </Button>
        <p className="m-0 text-[12px] leading-normal text-muted">No public sign-up. Accounts are created by an admin. 5 failed attempts trigger a 15-minute cooldown.</p>
      </form>
    </AuthLayout>
  );
}
