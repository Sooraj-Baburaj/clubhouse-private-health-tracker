import { Monitor, Send, Smartphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DEFAULT_QUIET_HOURS, type DeviceDto, type NotificationPrefDto, type NotificationType } from '@clubhouse/contracts';
import { relativeTime } from '@/features/format';
import { useNotificationPrefs, useUpdateNotificationPref } from '@/features/inbox';
import { useMeData } from '@/features/me';
import { useDevices, useRemoveDevice, useTestPush } from '@/features/push';
import { useUpdatePreferences } from '@/features/settings';
import { Tag } from '@/ui/atoms/Badges';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { Segmented } from '@/ui/atoms/Segmented';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ConfirmDialog } from '@/ui/molecules/ConfirmDialog';
import { ListGroup, ListRow } from '@/ui/molecules/ListGroup';
import { PushCard } from '@/ui/organisms/inbox/PushCard';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { cn } from '@/lib/cn';
import { Divider, TimeInput, ToggleRow, WeekdayChips } from './Kit';

const GROUP_TITLES: Record<NotificationPrefDto['group'], string> = { meals: 'Meals', activity: 'Activity', momentum: 'Momentum', chat: 'Chat', team: 'Team', system: 'From the Clubhouse' };
const GROUP_ORDER: NotificationPrefDto['group'][] = ['meals', 'activity', 'momentum', 'chat', 'team', 'system'];
type Mute = 'off' | '1h' | '8h' | '1w';

/** Which mute option matches the time left until `until` (reads the clock, like `relativeTime`). */
function muteBucket(until: string | null | undefined): Mute {
  const left = until ? Date.parse(until) - Date.now() : 0;
  return left <= 0 ? 'off' : left <= 3600_000 ? '1h' : left <= 8 * 3600_000 ? '8h' : '1w';
}

export function NotificationsSection() {
  const me = useMeData();
  const p = me.profile;
  const prefs = useNotificationPrefs();
  const updatePref = useUpdateNotificationPref();
  const updatePrefs = useUpdatePreferences({ quiet: true });
  const master = p.notificationsMaster;
  const mute = muteBucket(p.chatMutedUntil);

  const change = (type: string, patch: Partial<Pick<NotificationPrefDto, 'enabled' | 'time' | 'days' | 'smartTime'>>) => updatePref.mutate({ type: type as NotificationType, ...patch });

  return (
    <div className="flex flex-col gap-3.5">
      <PushCard showWhenOn />
      <ListGroup>
        <ToggleRow title="All notifications" sub={master ? 'Reminders and pings follow the settings below' : 'Everything is paused — your inbox still fills up'} checked={master} onChange={(v) => updatePrefs.mutate({ notificationsMaster: v })} />
      </ListGroup>

      {!prefs.data ? (
        prefs.isError ? (
          <ErrorCard error={prefs.error} onRetry={() => void prefs.refetch()} what="your reminders" />
        ) : (
          <>
            <Skeleton h={180} r={28} />
            <Skeleton h={120} r={28} />
          </>
        )
      ) : (
        <div className={cn('flex flex-col gap-3.5 transition-opacity', !master && 'pointer-events-none opacity-50')} aria-disabled={!master}>
          {GROUP_ORDER.map((g) => {
            const rows = prefs.data.filter((x) => x.group === g);
            if (!rows.length) return null;
            return (
              <ListGroup key={g} title={GROUP_TITLES[g]}>
                {rows.map((r, i) => (
                  <div key={r.type}>
                    {i > 0 && <Divider />}
                    <PrefRow r={r} onChange={(patch) => change(r.type, patch)} disabled={!master} />
                  </div>
                ))}
              </ListGroup>
            );
          })}
        </div>
      )}

      <ListGroup title="Quiet hours" footer="Nothing buzzes in quiet hours — not even admin announcements. It all waits in your inbox.">
        <ToggleRow
          title={p.quietHours ? `Quiet ${p.quietHours.start} – ${p.quietHours.end}` : 'Quiet hours'}
          sub={p.quietHours ? 'Nothing delivered, even from admins' : 'Off — notifications can arrive any time'}
          checked={!!p.quietHours}
          onChange={(v) => updatePrefs.mutate({ quietHours: v ? (p.quietHours ?? DEFAULT_QUIET_HOURS) : null })}
        >
          {p.quietHours && (
            <div className="flex items-center gap-2 text-[13px] font-bold">
              From
              <TimeInput label="Quiet hours start" value={p.quietHours.start} onChange={(start) => updatePrefs.mutate({ quietHours: { ...p.quietHours!, start } })} />
              to
              <TimeInput label="Quiet hours end" value={p.quietHours.end} onChange={(end) => updatePrefs.mutate({ quietHours: { ...p.quietHours!, end } })} />
            </div>
          )}
        </ToggleRow>
      </ListGroup>

      <ListGroup title="Mute team chat" footer={mute !== 'off' && p.chatMutedUntil ? `Muted until ${new Date(p.chatMutedUntil).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Mentions still reach you.` : 'Mentions still reach you when chat is muted.'}>
        <div className="px-3 py-3">
          <Segmented<Mute>
            label="Mute chat for"
            size="sm"
            value={mute}
            onChange={(v) => updatePrefs.mutate({ chatMute: v })}
            options={[
              { value: 'off', label: 'Off' },
              { value: '1h', label: '1 hour' },
              { value: '8h', label: '8 hours' },
              { value: '1w', label: '1 week' },
            ]}
          />
        </div>
      </ListGroup>

      <DevicesGroup />
    </div>
  );
}

function PrefRow({ r, onChange, disabled }: { r: NotificationPrefDto; onChange: (p: Partial<Pick<NotificationPrefDto, 'enabled' | 'time' | 'days' | 'smartTime'>>) => void; disabled: boolean }) {
  const hasDetail = (r.supportsTime || r.supportsDays || r.supportsSmartTime) && !r.locked;
  const sub = r.locked ? 'Always on' : r.enabled && r.supportsTime ? (r.smartTime && r.smartTimeValue ? `Smart time · around ${r.smartTimeValue}` : r.time ? `${r.hint} · ${r.time}` : r.hint) : r.hint;
  return (
    <ToggleRow title={r.label} sub={sub} checked={r.locked ? true : r.enabled} locked={r.locked} disabled={disabled} onChange={(enabled) => onChange({ enabled })}>
      {hasDetail ? (
        <>
          {r.supportsSmartTime && (
            <div className="flex items-center justify-between gap-3 rounded-[20px] bg-bg px-3.5 py-2.5">
              <span className="flex flex-col">
                <span className="text-[13px] font-bold">Smart time</span>
                <span className="text-[12px] text-neutral-700">{r.smartTimeValue ? `Learns when you usually log — now around ${r.smartTimeValue}` : 'Learns when you usually log this meal'}</span>
              </span>
              <SmallSwitch label={`Smart time for ${r.label}`} checked={r.smartTime} onChange={(smartTime) => onChange({ smartTime })} />
            </div>
          )}
          {r.supportsTime && !r.smartTime && (
            <div className="flex items-center gap-2 text-[13px] font-bold">
              At
              <TimeInput label={`Time for ${r.label}`} value={r.time ?? '09:00'} onChange={(time) => onChange({ time })} />
            </div>
          )}
          {r.supportsDays && <WeekdayChips label={`Days for ${r.label}`} value={r.days} onChange={(days) => onChange({ days })} />}
        </>
      ) : null}
    </ToggleRow>
  );
}

function SmallSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-[30px] w-[50px] shrink-0 rounded-full p-[3px] transition-colors', checked ? 'bg-accent' : 'bg-neutral-400')}>
      <span className={cn('block h-6 w-6 rounded-full bg-neutral-100 shadow-sm transition-transform duration-200', checked && 'translate-x-5')} />
    </button>
  );
}

function DevicesGroup() {
  const devices = useDevices();
  const remove = useRemoveDevice();
  const test = useTestPush();
  const [confirm, setConfirm] = useState<DeviceDto | null>(null);
  const label = (d: DeviceDto) => d.platform ?? (d.userAgent ? d.userAgent.split(/[()]/)[1]?.split(';')[0] ?? 'Browser' : 'Browser');
  return (
    <>
      <ListGroup title="Devices with push">
        {!devices.data ? (
          <div className="px-4 py-3">{devices.isError ? <span className="text-[13px] text-neutral-700">Couldn’t load your devices.</span> : <Skeleton h={40} r={16} />}</div>
        ) : !devices.data.length ? (
          <ListRow title="No devices yet" sub="Turn on notifications above to add this one" />
        ) : (
          devices.data.map((d) => (
            <ListRow
              key={d.id}
              title={
                <span className="flex items-center gap-2">
                  {/Android|iOS/.test(d.platform ?? '') ? <Smartphone aria-hidden className="h-4 w-4" strokeWidth={2.75} /> : <Monitor aria-hidden className="h-4 w-4" strokeWidth={2.75} />}
                  {label(d)}
                  {d.thisDevice && <Tag tone="accent2">This device</Tag>}
                  {d.failing && <Tag tone="outline">Not reaching it</Tag>}
                </span>
              }
              sub={d.lastUsedAt ? `Last push ${relativeTime(d.lastUsedAt)}` : `Added ${relativeTime(d.createdAt)}`}
              right={
                <IconButton label={`Remove ${label(d)}`} tone="ghost" onClick={() => setConfirm(d)}>
                  <Trash2 className="h-[18px] w-[18px] text-neutral-700" strokeWidth={2.75} />
                </IconButton>
              }
            />
          ))
        )}
      </ListGroup>
      <Button variant="secondary" icon={<Send className="h-4 w-4" strokeWidth={2.75} />} loading={test.isPending} onClick={() => test.mutate()}>
        Send a test
      </Button>
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Remove this device?"
        body="It stops getting push notifications. You can turn them on again from that device."
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => confirm && remove.mutate(confirm.id, { onSettled: () => setConfirm(null) })}
      />
    </>
  );
}
