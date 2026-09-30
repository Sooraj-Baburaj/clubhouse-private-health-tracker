import { useNavigate, useRouter } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import { fadeUp, stagger } from '@clubhouse/ui';
import { useMeData } from '@/features/me';
import { useLogout } from '@/features/settings';
import { Avatar } from '@/ui/atoms/Avatar';
import { Button } from '@/ui/atoms/Button';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { initials } from '@/ui/organisms/settings/Kit';
import { GROUPS, SECTIONS } from '@/ui/organisms/settings/sections';

/** Settings hub (APP-SET-*): profile header, grouped rows to each section, log out. */
export function SettingsPage() {
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const logout = useLogout();
  const [confirmAll, setConfirmAll] = useState(false);
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/', search: {} }));
  return (
    <MotionConfig reducedMotion="user">
      <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader title="Settings" onBack={back} />
        <motion.button
          variants={fadeUp}
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => void navigate({ to: '/settings/$section', params: { section: 'profile' } })}
          className="flex items-center gap-4 rounded-[32px] border-0 bg-surface p-4 text-left"
          aria-label="Edit your profile"
        >
          <Avatar name={me.user.displayName} initials={initials(me.user.displayName)} url={me.user.avatarUrl} size={64} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-heading text-[24px] leading-tight">{me.user.displayName}</span>
            <span className="text-[13px] text-neutral-700">@{me.user.username}</span>
            <span className="text-[12px] text-neutral-700">{me.team.name}</span>
          </span>
        </motion.button>
        {GROUPS.map((g) => (
          <motion.div variants={fadeUp} key={g.title}>
            <ListGroup title={g.title}>
              {g.keys.map((k) => {
                const s = SECTIONS[k];
                const Icon = s.icon;
                return (
                  <ListRow
                    key={k}
                    chevron
                    onClick={() => void navigate({ to: '/settings/$section', params: { section: k } })}
                    title={
                      <span className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-bg text-accent-700">
                          <Icon aria-hidden className="h-4 w-4" strokeWidth={2.75} />
                        </span>
                        {s.title}
                      </span>
                    }
                    sub={<span className="pl-[42px]">{s.sub}</span>}
                  />
                );
              })}
            </ListGroup>
          </motion.div>
        ))}
        <motion.div variants={fadeUp} className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </Button>
          <Button variant="dark" className="flex-1" icon={<LogOut className="h-4 w-4" strokeWidth={2.75} />} loading={logout.isPending && logout.variables === false} onClick={() => logout.mutate(false)}>
            Log out
          </Button>
        </motion.div>
        <p className="m-0 text-center text-[12px] text-neutral-600">Clubhouse {me.version}</p>
      </motion.div>
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Sign out of all devices?"
        body="Every phone and browser signed in to your account will need your password again, including this one."
        confirmLabel="Sign out everywhere"
        danger
        loading={logout.isPending}
        onConfirm={() => logout.mutate(true)}
      />
    </MotionConfig>
  );
}

