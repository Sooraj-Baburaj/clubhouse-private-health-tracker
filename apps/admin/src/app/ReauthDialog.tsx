import { useState } from 'react';
import { api, ApiError } from '@clubhouse/client';
import { Dialog } from '@clubhouse/ui';
import { queryClient } from './queryClient';
import { useReauth } from './reauth';
import { useMeAdmin } from '@/features/me';

/** Shown when the admin area has been idle for 12 hours (NFR-SEC-06). */
export function ReauthDialog() {
  const { open, hide } = useReauth();
  const me = useMeAdmin();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.reauth({ password, code: code || undefined });
      hide();
      setPassword('');
      setCode('');
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t confirm. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={() => undefined} dismissible={false} label="Confirm it’s you" className="glass w-[min(420px,92vw)] rounded-[28px] p-7" backdropClassName="bg-[rgba(23,23,28,0.18)]">
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <div className="eyebrow">Admin session</div>
        <h2 className="display-2">Confirm it’s you</h2>
        <p className="m-0 text-[13px] leading-relaxed text-muted">The admin panel has been idle for 12 hours. Enter your password to continue.</p>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">
          Password
          <input data-autofocus type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-[42px] rounded-[10px] border border-border bg-white px-3" />
        </label>
        {me.data?.user.totpEnabled && (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Authenticator code
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="h-[42px] rounded-[10px] border border-border bg-white px-3 font-mono tracking-[0.2em]" />
          </label>
        )}
        {error && <div className="text-[13px] font-semibold text-accent-dark">{error}</div>}
        <button type="submit" disabled={busy || !password} className="h-[46px] rounded-full bg-ink font-semibold text-white disabled:opacity-50">
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </Dialog>
  );
}
