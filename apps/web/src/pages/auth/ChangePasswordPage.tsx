import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@clubhouse/client';
import { NewPassword } from '@clubhouse/contracts';
import { authErrorMessage, useChangePassword, useSignOut } from '@/features/auth';
import { Button } from '@/ui/atoms/Button';
import { AuthLayout, AuthSection } from '@/ui/organisms/auth/AuthLayout';
import { PasswordField, PasswordStrength } from '@/ui/organisms/auth/PasswordField';
import { useShake } from '@/ui/organisms/auth/useShake';

type Field = 'current' | 'next' | 'confirm' | 'form';

/** APP-NAV-02: forced change of the temporary password before anything else. */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const change = useChangePassword();
  const signOut = useSignOut();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<{ field: Field; message: string } | null>(null);
  const { controls, shake } = useShake();

  const showError = (field: Field, message: string) => {
    setError({ field, message });
    shake();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return showError('current', 'Enter the temporary password from your admin.');
    const parsed = NewPassword.safeParse(next);
    if (!parsed.success) return showError('next', parsed.error.issues[0]?.message ?? 'Pick a stronger password.');
    if (next !== confirm) return showError('confirm', 'Those two don’t match yet.');
    setError(null);
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: (to) => void navigate({ to, search: to === '/' || to === '/onboarding' ? {} : undefined, replace: true }),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) return void navigate({ to: '/login', replace: true });
          if (err instanceof ApiError && err.fields?.currentPassword) return showError('current', err.message);
          if (err instanceof ApiError && err.fields?.newPassword) return showError('next', err.message);
          showError('form', authErrorMessage(err));
        },
      },
    );
  };

  const errorFor = (f: Field) => (error?.field === f ? error.message : null);

  return (
    <AuthLayout
      footer={
        <>
          <Button type="submit" form="change-form" size="lg" block loading={change.isPending}>
            Save and continue
          </Button>
          <Button variant="ghost" size="sm" onClick={() => signOut.mutate(undefined, { onSettled: () => void navigate({ to: '/login', replace: true }) })}>
            Not you? Sign out
          </Button>
        </>
      }
    >
      <AuthSection className="mt-4 flex flex-col gap-2.5">
        <div className="eyebrow">One quick thing</div>
        <h1 className="font-heading text-[36px] leading-[1.05]">Make it yours</h1>
        <p className="m-0 text-[15px] text-neutral-700">Swap the temporary password for one only you know.</p>
      </AuthSection>
      <AuthSection>
        <motion.form id="change-form" onSubmit={submit} animate={controls} noValidate className="flex flex-col gap-3.5">
          <input type="text" name="username" autoComplete="username" hidden readOnly />
          <PasswordField label="Temporary password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errorFor('current')} />
          <PasswordField label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errorFor('next')} />
          <PasswordField label="Type it again" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errorFor('confirm')} />
          <PasswordStrength value={next} confirm={confirm} />
          <AnimatePresence>
            {error?.field === 'form' && (
              <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="m-0 overflow-hidden rounded-[22px] bg-band-red-bg px-4 py-3 text-[14px] font-semibold text-band-red-fg">
                {error.message}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.form>
      </AuthSection>
    </AuthLayout>
  );
}
