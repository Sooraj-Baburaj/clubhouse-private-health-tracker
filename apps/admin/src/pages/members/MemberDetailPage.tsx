import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ArrowLeft, KeyRound, LogOut, Pencil, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@clubhouse/client';
import type { AdminMemberDetail } from '@clubhouse/contracts';
import { useRole } from '@/features/me';
import { useMember } from '@/features/members';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { Avatar, Button, Card, EmptyState, ErrorState, Grid, IconButton, PageHeader, Pill, RolePill, SecretBox, Skeleton, SkeletonCard, StatusPill, TabPanel, Tabs, type TabDef } from '@/ui';
import { ActivityTab, AiTab, AuditTab, DaysTab, DietTab, MomentumTab, NotificationsTab, SessionsTab } from './DetailTabs';
import { MemberEditDrawer } from './MemberEditDrawer';
import { ProfileTab } from './ProfileTab';
import { tempPasswordText } from './shared';
import { useMemberActions } from './useMemberActions';

const TAB_VALUES = ['profile', 'diet', 'activity', 'momentum', 'notifications', 'ai', 'days', 'audit', 'sessions'] as const;
type Tab = (typeof TAB_VALUES)[number];

function asTab(v: string | undefined): Tab {
  return (TAB_VALUES as readonly string[]).includes(v ?? '') ? (v as Tab) : 'profile';
}

/** Member detail (/members/$id): header with actions, tabbed sections kept in the URL `tab` param. */
export function MemberDetailPage() {
  const { id } = useParams({ from: '/shell/members/$id' });
  const search = useSearch({ from: '/shell/members/$id' });
  const navigate = useNavigate({ from: '/members/$id' });
  const q = useMember(id);
  const tab = asTab(search.tab);
  const setTab = (t: Tab) => void navigate({ search: (s) => ({ ...s, tab: t === 'profile' ? undefined : t }), replace: true });

  if (q.isPending) return <DetailSkeleton />;
  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <>
        <BackLink />
        <Card>
          {notFound ? (
            <EmptyState
              icon={<UserX className="h-5 w-5" />}
              title="Member not found"
              body="They may have been removed, or the link is out of date."
              action={
                <Link to="/members" className="text-[13px] font-semibold">
                  Back to members
                </Link>
              }
            />
          ) : (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </>
    );
  }
  return <Detail data={q.data} tab={tab} setTab={setTab} />;
}

function BackLink() {
  return (
    <Link to="/members" className="-mb-2 inline-flex items-center gap-1 self-start text-[13px] font-semibold text-muted hover:text-ink">
      <ArrowLeft aria-hidden className="h-3.5 w-3.5" /> Members
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading member" className="flex flex-col gap-5">
      <Skeleton className="h-3 w-24" />
      <div className="flex items-center gap-4">
        <div className="skeleton h-14 w-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-[640px] rounded-full" />
      <Grid>
        <SkeletonCard lines={8} />
        <SkeletonCard lines={6} />
      </Grid>
    </div>
  );
}

function Detail({ data, tab, setTab }: { data: AdminMemberDetail; tab: Tab; setTab: (t: Tab) => void }) {
  const m = data.member;
  const { userId } = useRole();
  const actions = useMemberActions();
  const [temp, setTemp] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const isSelf = m.id === userId;
  const tempInfo = tempPasswordText(m.tempPasswordExpiresAt);
  const onRevokeAll = () => void actions.revokeSessions(m, data.sessions.length);

  const tabs: TabDef<Tab>[] = [
    { value: 'profile', label: 'Profile & targets' },
    { value: 'diet', label: 'Diet' },
    { value: 'activity', label: 'Activity & adherence' },
    { value: 'momentum', label: 'Momentum', count: data.streaks.filter((s) => s.atRisk).length || null },
    { value: 'notifications', label: 'Notifications' },
    { value: 'ai', label: 'AI usage' },
    { value: 'days', label: 'Recent days' },
    { value: 'audit', label: 'Audit trail' },
    { value: 'sessions', label: 'Sessions', count: data.sessions.length || null },
  ];

  return (
    <>
      <BackLink />
      <PageHeader
        eyebrow={`@${m.username} · ${m.lastActiveAt ? `Last active ${fmtRelative(m.lastActiveAt).toLowerCase()}` : 'Not active yet'}`}
        title={
          <>
            <Avatar person={m.person} size={52} className={m.status === 'deactivated' ? 'opacity-55' : undefined} />
            <span className="min-w-0 break-words">{m.person.name}</span>
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RolePill role={m.role} />
            <StatusPill status={m.status} />
            {m.totpEnabled && <Pill tone="outline">Two-step on</Pill>}
            {tempInfo && <Pill tone={tempInfo.expired ? 'over' : 'under'} title={fmtDateTime(m.tempPasswordExpiresAt)}>{tempInfo.text}</Pill>}
            {isSelf && <Pill tone="muted">You</Pill>}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={() => void actions.resetPassword(m).then((p) => p && setTemp(p))}>
              Reset password
            </Button>
            <Button variant="outline" icon={<LogOut className="h-4 w-4" />} onClick={onRevokeAll}>
              Revoke all sessions
            </Button>
            {m.status === 'deactivated' ? (
              <Button variant="secondary" onClick={() => void actions.reactivate(m)}>
                Reactivate
              </Button>
            ) : (
              <Button variant="danger" disabled={isSelf} title={isSelf ? 'You can’t deactivate yourself' : undefined} onClick={() => void actions.deactivate(m)}>
                Deactivate
              </Button>
            )}
          </>
        }
      />

      {temp && (
        <Card className="border-accent-border">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[14px] font-semibold">Password reset for {m.person.name}</span>
            <IconButton label="Hide temporary password" size={30} onClick={() => setTemp(null)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <SecretBox secret={temp} note="Shown once. Share it privately. They must change it on first sign-in; it expires in 7 days if unused." />
        </Card>
      )}

      <Tabs label="Member sections" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel k={tab}>
        {tab === 'profile' && <ProfileTab data={data} />}
        {tab === 'diet' && <DietTab data={data} />}
        {tab === 'activity' && <ActivityTab data={data} />}
        {tab === 'momentum' && <MomentumTab data={data} />}
        {tab === 'notifications' && <NotificationsTab data={data} />}
        {tab === 'ai' && <AiTab data={data} />}
        {tab === 'days' && <DaysTab data={data} />}
        {tab === 'audit' && <AuditTab data={data} />}
        {tab === 'sessions' && <SessionsTab data={data} onRevokeAll={onRevokeAll} />}
      </TabPanel>

      <MemberEditDrawer member={m} open={editOpen} onClose={() => setEditOpen(false)} hideProfileLink />
    </>
  );
}
