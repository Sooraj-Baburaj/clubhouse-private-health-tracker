import { useMutation } from '@tanstack/react-query';
import { Copy, KeyRound, Laptop, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { api } from '@clubhouse/client';
import { NewPassword, type TotpEnrolResponse } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { relativeTime } from '@/features/format';
import { useMeData, useRefreshMe } from '@/features/me';
import { errorText, useLogout, useRevokeSession, useSessions } from '@/features/settings';
import { Tag } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';

export function SecuritySection() {
  const me = useMeData();
  const admin = me.user.role !== 'member';
  return (
    <div className="flex flex-col gap-3.5">
      <ChangePassword />
      <Sessions />
      {admin && <Totp enabled={me.user.totpEnabled} />}
    </div>
  );
}

function ChangePassword() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [err, setErr] = useState<{ cur?: string; next?: string; again?: string }>({});
  const m = useMutation({
    mutationFn: () => api.auth.changePassword({ currentPassword: cur, newPassword: next }),
    onSuccess: () => {
      toast.success('Password changed');
      setCur('');
      setNext('');
      setAgain('');
    },
    onError: (e) => setErr({ cur: errorText(e, 'Couldn’t change your password.') }),
  });
  const submit = () => {
    const e: typeof err = {};
    if (!cur) e.cur = 'Enter your current password to continue.';
    const parsed = NewPassword.safeParse(next);
    if (!parsed.success) e.next = parsed.error.issues[0]?.message ?? 'Pick a stronger password';
    if (next !== again) e.again = 'These don’t match yet';
    setErr(e);
    if (!Object.keys(e).length) m.mutate();
  };
  return (
    <form
      className="flex flex-col gap-3 rounded-[28px] bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="flex items-center gap-2 font-heading text-[19px]">
        <KeyRound aria-hidden className="h-5 w-5" strokeWidth={2.75} />
        Change password
      </span>
      <TextField label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={err.cur} />
      <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={err.next} hint="At least 10 characters, mixing letters with numbers or symbols" />
      <TextField label="New password again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={err.again} />
      <Button type="submit" loading={m.isPending} className="self-start">
        Update password
      </Button>
    </form>
  );
}

function Sessions() {
  const q = useSessions();
  const revoke = useRevokeSession();
  const logout = useLogout();
  const [confirmAll, setConfirmAll] = useState(false);
  return (
    <>
      <ListGroup title="Signed-in devices">
        {!q.data ? (
          <div className="px-4 py-3">{q.isError ? <span className="text-[13px] text-neutral-700">Couldn’t load your sessions.</span> : <Skeleton h={48} r={16} />}</div>
        ) : (
          q.data.map((s) => {
            const mobile = /iPhone|Android|Mobile/i.test(s.userAgent ?? '');
            return (
              <ListRow
                key={s.id}
                title={
                  <span className="flex items-center gap-2">
                    {mobile ? <Smartphone aria-hidden className="h-4 w-4" strokeWidth={2.75} /> : <Laptop aria-hidden className="h-4 w-4" strokeWidth={2.75} />}
                    <span className="truncate">{s.deviceLabel ?? browserOf(s.userAgent)}</span>
                    {s.current && <Tag tone="accent2">This device</Tag>}
                  </span>
                }
                sub={`Active ${relativeTime(s.lastSeenAt)}${s.ip ? ` · ${s.ip}` : ''}`}
                right={
                  !s.current ? (
                    <Button size="sm" variant="secondary" loading={revoke.isPending && revoke.variables === s.id} onClick={() => revoke.mutate(s.id)}>
                      Sign out
                    </Button>
                  ) : undefined
                }
              />
            );
          })
        )}
      </ListGroup>
      <Button variant="danger" onClick={() => setConfirmAll(true)}>
        Sign out of all devices
      </Button>
      <ConfirmDialog open={confirmAll} onClose={() => setConfirmAll(false)} title="Sign out everywhere?" body="Every device, including this one, will need your password again." confirmLabel="Sign out everywhere" danger loading={logout.isPending} onConfirm={() => logout.mutate(true)} />
    </>
  );
}

const browserOf = (ua: string | null) => {
  if (!ua) return 'Unknown device';
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : '';
  return os ? `${b} on ${os}` : b;
};

/** Admins: TOTP enrol → confirm (shows recovery codes once) → disable. */
function Totp({ enabled }: { enabled: boolean }) {
  const refreshMe = useRefreshMe();
  const [enrol, setEnrol] = useState<TotpEnrolResponse | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const start = useMutation({ mutationFn: () => api.auth.enrolTotp(), onSuccess: setEnrol, onError: (e) => toast.error(errorText(e)) });
  const confirm = useMutation({
    mutationFn: () => api.auth.confirmTotp(code.trim()),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      setEnrol(null);
      setCode('');
      setErr(null);
    },
    onError: (e) => setErr(errorText(e, 'That code didn’t match. Try the newest one.')),
  });
  const disable = useMutation({
    mutationFn: () => api.auth.disableTotp(code.trim()),
    onSuccess: () => {
      toast.show('Two-step sign-in is off');
      setCode('');
      void refreshMe();
    },
    onError: (e) => setErr(errorText(e, 'That code didn’t match.')),
  });
  const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.show('Copied'), () => toast.error('Couldn’t copy'));

  return (
    <div className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
      <span className="flex items-center gap-2 font-heading text-[19px]">
        <ShieldCheck aria-hidden className="h-5 w-5" strokeWidth={2.75} />
        Two-step sign-in (admins)
      </span>
      {codes ? (
        <>
          <p className="m-0 text-[13px]">
            <b>Save these recovery codes now.</b> Each works once if you lose your phone. We won’t show them again.
          </p>
          <div className="grid grid-cols-2 gap-1.5 rounded-[20px] bg-bg p-3 font-mono text-[14px]">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" strokeWidth={2.75} />} onClick={() => void copy(codes.join('\n'))}>
              Copy all
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setCodes(null);
                void refreshMe();
              }}
            >
              I’ve saved them
            </Button>
          </div>
        </>
      ) : enabled ? (
        <>
          <span className="text-[13px] text-neutral-700">On. To switch it off, enter a code from your authenticator app.</span>
          <TextField label="Code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} error={err} />
          <Button variant="danger" size="sm" className="self-start" loading={disable.isPending} disabled={code.trim().length < 6} onClick={() => disable.mutate()}>
            Turn off two-step
          </Button>
        </>
      ) : enrol ? (
        <>
          <span className="text-[13px] text-neutral-700">Add this key to your authenticator app (or open the link on this phone), then type the 6-digit code it shows.</span>
          <div className="flex items-center gap-2 rounded-[20px] bg-bg p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-[14px]">{enrol.secret}</code>
            <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" strokeWidth={2.75} />} onClick={() => void copy(enrol.secret)}>
              Copy
            </Button>
          </div>
          <a href={enrol.otpauthUrl} className="text-[13px] font-bold">
            Open in authenticator app
          </a>
          <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} error={err} />
          <Button size="sm" className="self-start" loading={confirm.isPending} disabled={code.trim().length < 6} onClick={() => confirm.mutate()}>
            Confirm and turn on
          </Button>
        </>
      ) : (
        <>
          <span className="text-[13px] text-neutral-700">Adds a code from your phone when you open the admin area.</span>
          <Button size="sm" className="self-start" loading={start.isPending} onClick={() => start.mutate()}>
            Set up two-step
          </Button>
        </>
      )}
    </div>
  );
}
