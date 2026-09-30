import { Link } from '@tanstack/react-router';
import { BellRing } from 'lucide-react';
import { toast } from '@clubhouse/ui';
import { usePushHealth, useTestToMe } from '@/features/notifications';
import { fmtInt, humanize } from '@/lib/format';
import { Button, Card, CardHeader, ErrorState, MeterList, PersonCell, SkeletonCard } from '@/ui';

const PLATFORM: Record<string, string> = {
  ios: 'iPhone / iPad',
  android: 'Android',
  desktop: 'Desktop browser',
  web: 'Web',
  macos: 'Mac',
  windows: 'Windows',
};

/** "Send a test to me" with an explanation when nothing can receive it. */
export function TestToMeButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const test = useTestToMe();
  return (
    <Button
      variant="secondary"
      size={size}
      icon={<BellRing className="h-4 w-4" />}
      loading={test.isPending}
      onClick={() =>
        test.mutate(undefined, {
          onSuccess: (r) => {
            if (r.devices === 0)
              toast.error(
                'You have no devices with push turned on. Open the Clubhouse app on your phone, allow notifications in Settings › Notifications, then try again.',
                { duration: 6000 },
              );
            else if (r.delivered === 0)
              toast.error(
                `Couldn’t deliver to any of your ${r.devices} ${r.devices === 1 ? 'device' : 'devices'}. The subscription may have expired; turning push off and on again on the device usually fixes it.`,
                { duration: 6000 },
              );
            else
              toast.success(
                `Delivered to ${r.delivered} of ${r.devices} ${r.devices === 1 ? 'device' : 'devices'}`,
              );
          },
        })
      }
    >
      Send a test to me
    </Button>
  );
}

/** Push health: subscriptions per platform, failures/revocations in 7 days, members without push. */
export function PushHealthCard() {
  const q = usePushHealth();
  if (q.isPending) return <SkeletonCard lines={6} />;
  if (q.isError)
    return (
      <Card>
        <CardHeader title="Push health" />
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      </Card>
    );
  const d = q.data;
  const subs = [...d.subscriptions].sort((a, b) => b.count - a.count);
  return (
    <Card>
      <CardHeader
        title="Push health"
        aside={<span className="font-mono text-[12px]">last 7 days</span>}
      />
      <dl className="m-0 grid grid-cols-3 gap-2">
        <Stat label="Devices" value={d.total} />
        <Stat label="Not delivered" value={d.failures7d} warn={d.failures7d > 0} />
        <Stat label="Revoked" value={d.revoked7d} />
      </dl>
      {subs.length > 0 ? (
        <MeterList
          label="Push subscriptions by platform"
          items={subs.map((s) => ({
            key: s.platform,
            label: PLATFORM[s.platform] ?? humanize(s.platform),
            value: s.count,
          }))}
          format={(n) => fmtInt(n)}
        />
      ) : (
        <p className="m-0 text-[13px] text-muted">No devices have push turned on yet.</p>
      )}
      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <span className="text-[13px] font-semibold">
          Without push{' '}
          {d.membersWithoutPush.length > 0 && (
            <span className="font-mono text-[12px] font-normal text-muted">
              · {d.membersWithoutPush.length}
            </span>
          )}
        </span>
        {d.membersWithoutPush.length === 0 ? (
          <span className="text-[13px] text-muted">Everyone can get reminders. Nice.</span>
        ) : (
          <>
            <span className="text-[12px] leading-snug text-muted">
              They still see everything in their in-app inbox. iPhone users need the app on their
              Home Screen before push works.
            </span>
            <ul className="m-0 flex max-h-[280px] list-none flex-col gap-1 overflow-y-auto p-0">
              {d.membersWithoutPush.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/members/$id"
                    params={{ id: p.id }}
                    search={{ tab: 'notifications' }}
                    className="-mx-2 flex rounded-[10px] px-2 py-1.5 hover:bg-bg"
                  >
                    <PersonCell person={p} size={26} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <TestToMeButton size="sm" />
    </Card>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[12px] bg-bg px-3 py-2.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`m-0 font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] ${warn ? 'text-accent-dark' : ''}`}
      >
        {fmtInt(value)}
      </dd>
    </div>
  );
}
