import { useNavigate } from '@tanstack/react-router';
import { api } from '@clubhouse/client';
import { queryClient } from '@/app/queryClient';
import { Button } from '@/ui';
import { AuthLayout } from './AuthLayout';

/** Shown to members who open /admin. Friendly, with a way back to the member app. */
export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <AuthLayout label="Admins only">
      <div className="eyebrow">Clubhouse Admin</div>
      <h1 className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.045em]">This area is for admins.</h1>
      <p className="m-0 text-[14px] leading-relaxed text-muted">You’re signed in as a member, so there’s nothing to manage here. Your logs, plan and team chat are all in the Clubhouse app.</p>
      <a href="/" className="inline-flex h-[46px] items-center justify-center rounded-full bg-ink px-5 text-[14px] font-semibold text-white hover:bg-[#2a2a31] hover:text-white">
        Open Clubhouse
      </a>
      <Button
        variant="secondary"
        size="lg"
        onClick={async () => {
          await api.auth.logout().catch(() => undefined);
          queryClient.clear();
          void navigate({ to: '/login' });
        }}
      >
        Sign in as someone else
      </Button>
    </AuthLayout>
  );
}
