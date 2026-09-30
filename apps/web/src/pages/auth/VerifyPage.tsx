import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@clubhouse/client';
import { TotpCodeRequest } from '@clubhouse/contracts';
import { authErrorMessage, useSignOut, useVerifyTotp } from '@/features/auth';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { AuthLayout, AuthSection } from '@/ui/organisms/auth/AuthLayout';
import { useShake } from '@/ui/organisms/auth/useShake';

/** Two-step sign-in for admins opening the member app (authenticator code or a recovery code). */
export function VerifyPage() {
  const navigate = useNavigate();
  const verify = useVerifyTotp();
  const signOut = useSignOut();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { controls, shake } = useShake();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = TotpCodeRequest.safeParse({ code });
    if (!parsed.success) {
      setError(recovery ? 'Enter a recovery code like abcd-1234.' : 'Enter the 6-digit code from your authenticator app.');
      shake();
      return;
    }
    setError(null);
    verify.mutate(parsed.data.code, {
      onSuccess: (to) => void navigate({ to, search: to === '/' || to === '/onboarding' ? {} : undefined, replace: true }),
      onError: (err) => {
        if (err instanceof ApiError && err.status === 401) return void navigate({ to: '/login', replace: true });
        setError(authErrorMessage(err));
        setCode('');
        shake();
      },
    });
  };

  return (
    <AuthLayout
      footer={
        <>
          <Button type="submit" form="verify-form" size="lg" block loading={verify.isPending}>
            Verify
          </Button>
          <Button variant="ghost" size="sm" onClick={() => signOut.mutate(undefined, { onSettled: () => void navigate({ to: '/login', replace: true }) })}>
            Use a different account
          </Button>
        </>
      }
    >
      <AuthSection className="mt-4 flex flex-col gap-2.5">
        <div className="eyebrow">Two-step sign-in</div>
        <h1 className="font-heading text-[36px] leading-[1.05]">Just checking it’s you</h1>
        <p className="m-0 text-[15px] text-neutral-700">{recovery ? 'Type one of the recovery codes you saved when you set this up.' : 'Open your authenticator app and type the 6-digit code for Clubhouse.'}</p>
      </AuthSection>
      <AuthSection>
        <motion.form id="verify-form" onSubmit={submit} animate={controls} noValidate className="flex flex-col gap-3">
          <TextField
            label={recovery ? 'Recovery code' : 'Code'}
            value={code}
            onChange={(e) => {
              setCode(recovery ? e.target.value.slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            inputMode={recovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            autoCapitalize="none"
            placeholder={recovery ? 'abcd-1234' : '123456'}
            className="[&_input]:text-center [&_input]:font-heading [&_input]:text-[26px] [&_input]:tracking-[0.3em]"
            error={error}
            autoFocus
          />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              setRecovery((r) => !r);
              setCode('');
              setError(null);
            }}
          >
            {recovery ? 'Use the authenticator code instead' : 'Use a recovery code'}
          </Button>
          <AnimatePresence>{verify.isPending && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="sr-only" role="status">Checking your code</motion.span>}</AnimatePresence>
        </motion.form>
      </AuthSection>
    </AuthLayout>
  );
}
