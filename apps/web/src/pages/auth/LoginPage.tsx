import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type FormEvent } from 'react';
import { authErrorMessage, useLogin } from '@/features/auth';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { AuthLayout, AuthSection } from '@/ui/organisms/auth/AuthLayout';
import { PasswordField } from '@/ui/organisms/auth/PasswordField';
import { useShake } from '@/ui/organisms/auth/useShake';

/** APP-NAV-01: invite-only sign-in with username or email. */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState<{ field: 'login' | 'password' | 'form'; message: string } | null>(null);
  const { controls, shake } = useShake();
  const passRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<HTMLInputElement>(null);

  const showError = (field: 'login' | 'password' | 'form', message: string) => {
    setError({ field, message });
    shake();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user.trim()) {
      showError('login', 'Enter your username or email to continue.');
      userRef.current?.focus();
      return;
    }
    if (!pass) {
      showError('password', 'Enter your password to continue.');
      passRef.current?.focus();
      return;
    }
    setError(null);
    login.mutate(
      { login: user.trim(), password: pass, deviceLabel: navigator.userAgent.slice(0, 80) },
      {
        onSuccess: (to) => void navigate({ to, search: to === '/' || to === '/onboarding' ? {} : undefined, replace: true }),
        onError: (err) => {
          showError('form', authErrorMessage(err));
          setPass('');
          passRef.current?.focus();
        },
      },
    );
  };

  return (
    <AuthLayout
      footer={
        <>
          <Button type="submit" form="login-form" size="lg" block loading={login.isPending}>
            Let’s go
          </Button>
          <p className="m-0 text-center text-[13px] text-neutral-700">Locked out? Ask your admin to reset it.</p>
        </>
      }
    >
      <AuthSection className="mt-6 flex flex-col gap-2.5 sm:mt-10">
        <h1 className="font-heading text-[46px] leading-[1.02]">
          Fuel up.
          <br />
          Move more.
          <br />
          <span className="text-accent-600">Together.</span>
        </h1>
        <p className="m-0 text-[15px] leading-normal text-neutral-700">Invite-only. Your admin sent your username and a temporary password.</p>
      </AuthSection>
      <AuthSection>
        <motion.form id="login-form" onSubmit={submit} animate={controls} noValidate className="flex flex-col gap-3.5">
          <TextField
            ref={userRef}
            label="Username or email"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
              if (error?.field === 'login') setError(null);
            }}
            error={error?.field === 'login' ? error.message : null}
          />
          <PasswordField
            ref={passRef}
            label="Password"
            name="password"
            autoComplete="current-password"
            placeholder="12-character temp password"
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              if (error?.field === 'password') setError(null);
            }}
            error={error?.field === 'password' ? error.message : null}
          />
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
