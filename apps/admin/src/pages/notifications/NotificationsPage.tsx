import { Lock } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { NotificationDefault, NotificationType } from '@clubhouse/contracts';
import {
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_QUIET_HOURS,
  NOTIFICATION_TYPES,
  NotificationDefaultsUpdate,
} from '@clubhouse/contracts';
import {
  useNotifDefaults,
  useUpdateNotifDefaults,
  type NotifDefaultsResponse,
} from '@/features/notifications';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  DayPicker,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Pill,
  SkeletonCard,
  Toggle,
} from '@/ui';
import { CopyPoolCard } from './CopyPoolCard';
import { PushHealthCard } from './PushHealthCard';

type Defaults = Record<NotificationType, NotificationDefault>;
type Quiet = { start: string; end: string } | null;

const GROUP_ORDER = ['Meals', 'Reminders', 'Activity', 'Progress', 'Chat', 'Team', 'System'];

function fullDefaults(d: NotifDefaultsResponse['defaults']): Defaults {
  return Object.fromEntries(
    NOTIFICATION_TYPES.map((t) => [t, d[t] ?? DEFAULT_NOTIFICATION_PREFS[t]]),
  ) as Defaults;
}

/** Notifications: team defaults per type, default quiet hours, reminder copy pool and push health. */
export function NotificationsPage() {
  const q = useNotifDefaults();
  return (
    <>
      <PageHeader
        eyebrow="Team defaults"
        title="Notifications"
        description="What new members start with. Members can change their own settings afterwards, except the locked ones."
      />
      {q.isPending ? (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-3">
            <SkeletonCard lines={6} />
            <SkeletonCard lines={4} />
          </div>
          <SkeletonCard lines={6} />
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : (
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            <DefaultsEditor key={JSON.stringify([q.data.defaults, q.data.defaultQuietHours])} data={q.data} />
            <CopyPoolCard key={JSON.stringify(q.data.copyPool)} data={q.data} />
          </div>
          <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6">
            <PushHealthCard />
          </div>
        </div>
      )}
    </>
  );
}

function DefaultsEditor({ data }: { data: NotifDefaultsResponse }) {
  const reduce = useReducedMotion();
  const save = useUpdateNotifDefaults('Notification defaults saved');
  const initial = useMemo(
    () => ({ defaults: fullDefaults(data.defaults), quiet: data.defaultQuietHours }),
    [data],
  );
  const [defaults, setDefaults] = useState<Defaults>(initial.defaults);
  const [quiet, setQuiet] = useState<Quiet>(initial.quiet);
  const [lastQuiet, setLastQuiet] = useState<{ start: string; end: string }>(
    data.defaultQuietHours ?? DEFAULT_QUIET_HOURS,
  );
  const [error, setError] = useState<string | null>(null);
  const dirty =
    JSON.stringify(defaults) !== JSON.stringify(initial.defaults) ||
    JSON.stringify(quiet) !== JSON.stringify(initial.quiet);

  const groups = useMemo(() => {
    const types = NOTIFICATION_TYPES.filter((t) => data.defaults[t] || data.labels[t]);
    const map = new Map<string, NotificationType[]>();
    for (const t of types) {
      const g = data.labels[t]?.group ?? 'Other';
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return [...map.entries()].sort(
      ([a], [b]) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99),
    );
  }, [data]);

  const patch = (t: NotificationType, p: Partial<NotificationDefault>) =>
    setDefaults((d) => ({ ...d, [t]: { ...d[t], ...p } }));

  const reset = () => {
    setDefaults(initial.defaults);
    setQuiet(initial.quiet);
    setError(null);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const parsed = NotificationDefaultsUpdate.safeParse({ defaults, defaultQuietHours: quiet });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const t = issue?.path[1];
      setError(
        issue?.path[0] === 'defaultQuietHours'
          ? 'Quiet hours need a start and an end time.'
          : typeof t === 'string'
            ? `Check ${data.labels[t]?.label ?? humanize(t)}: times use HH:mm.`
            : 'Some settings need another look.',
      );
      return;
    }
    const noDays = NOTIFICATION_TYPES.find(
      (t) => defaults[t].enabled && defaults[t].days.length === 0,
    );
    if (noDays) {
      setError(`${data.labels[noDays]?.label ?? humanize(noDays)} is on but has no days picked.`);
      return;
    }
    setError(null);
    save.mutate({
      defaults: parsed.data.defaults,
      defaultQuietHours: parsed.data.defaultQuietHours,
    });
  };

  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-4" noValidate>
      {groups.map(([group, types]) => (
        <Card key={group} padded={false}>
          <div className="px-5 pb-1 pt-5">
            <CardHeader title={group} />
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {types.map((t) => (
              <TypeRow
                key={t}
                type={t}
                value={defaults[t]}
                meta={data.labels[t]}
                onChange={(p) => patch(t, p)}
              />
            ))}
          </ul>
        </Card>
      ))}

      <Card>
        <CardHeader title="Quiet hours" aside="Default for new members" />
        <p className="m-0 text-[13px] leading-relaxed text-muted">
          No pushes during these hours; they wait in the inbox. Announcements and system messages
          still arrive quietly.
        </p>
        <Checkbox
          checked={quiet == null}
          onChange={(e) => {
            if (e.target.checked) {
              if (quiet) setLastQuiet(quiet);
              setQuiet(null);
            } else setQuiet(lastQuiet);
          }}
          label="No quiet hours"
        />
        {quiet && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From" className="w-[140px]">
              <Input
                type="time"
                value={quiet.start}
                onChange={(e) => setQuiet({ ...quiet, start: e.target.value })}
              />
            </Field>
            <Field label="Until" className="w-[140px]">
              <Input
                type="time"
                value={quiet.end}
                onChange={(e) => setQuiet({ ...quiet, end: e.target.value })}
              />
            </Field>
            {quiet.start > quiet.end && (
              <span className="pb-3 text-[12px] text-muted">Runs overnight</span>
            )}
          </div>
        )}
      </Card>

      {error && !dirty && (
        <div role="alert" className="text-[13px] font-semibold text-accent-dark">
          {error}
        </div>
      )}

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="glass sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-border px-4 py-3 shadow-[0_20px_60px_rgba(23,23,28,0.12)]"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-[14px] font-semibold">Unsaved changes</span>
              {error ? (
                <span role="alert" className="text-[12px] font-semibold text-accent-dark">
                  {error}
                </span>
              ) : (
                <span className="text-[12px] text-muted">
                  Applies to new members and anyone still on the team defaults.
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reset} disabled={save.isPending}>
                Discard
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save defaults
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

function TypeRow({
  type,
  value,
  meta,
  onChange,
}: {
  type: NotificationType;
  value: NotificationDefault;
  meta: NotifDefaultsResponse['labels'][string] | undefined;
  onChange: (p: Partial<NotificationDefault>) => void;
}) {
  const label = meta?.label ?? humanize(type);
  const locked = !!meta?.locked;
  const off = !value.enabled;
  return (
    <li className="flex flex-col gap-3 border-t border-hairline px-5 py-3.5 first:border-t-0 lg:flex-row lg:items-center lg:gap-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Toggle
          checked={value.enabled}
          onChange={(v) => onChange({ enabled: v })}
          label={label}
          disabled={locked}
          title={locked ? `${label} is always on` : undefined}
          className="mt-0.5"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            {label}
            {locked && (
              <Pill tone="muted" icon={<Lock aria-hidden className="h-3 w-3" />}>
                Always on
              </Pill>
            )}
          </span>
          {meta?.hint && <span className="text-[12px] leading-snug text-muted">{meta.hint}</span>}
        </div>
      </div>
      <div
        className={cn('flex flex-wrap items-center gap-3 pl-[52px] lg:pl-0', off && 'opacity-50')}
      >
        {value.time != null && (
          <Input
            type="time"
            aria-label={`${label} time`}
            value={value.time}
            disabled={off}
            onChange={(e) => onChange({ time: e.target.value })}
            className="!h-9 !w-[120px] font-mono !text-[13px]"
          />
        )}
        <DayPicker
          label={`${label} days`}
          value={value.days}
          onChange={(days) => onChange({ days })}
          disabled={off}
        />
        {value.time != null && (
          <Checkbox
            checked={value.smartTime}
            disabled={off}
            onChange={(e) => onChange({ smartTime: e.target.checked })}
            label="Smart time"
            hint="Learns when they usually log"
            className="min-w-[150px]"
          />
        )}
      </div>
    </li>
  );
}
