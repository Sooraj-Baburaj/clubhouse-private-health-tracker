import { Check, FlaskConical, Minus, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DryRunRequest, type AdminMemberRow, type DryRunResult } from '@clubhouse/contracts';
import { useDryRun, useMemes, useTriggers } from '@/features/memes';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { fmtDate, fmtInt, plural, todayLocal } from '@/lib/format';
import { Button, Card, CardHeader, EmptyState, Field, FormGrid, Input, MemberSelect, Pill, Segmented, Select } from '@/ui';
import { actionLabel, eventLabel, MemeImage } from './shared';

/** Dry run: replay a member's past day against the triggers and show every decision with its reasons. */
export function DryRunPanel({ onOpenTrigger }: { onOpenTrigger: (id: string) => void }) {
  const triggersQ = useTriggers();
  const memesQ = useMemes();
  const run = useDryRun();
  const today = todayLocal();

  const [memberId, setMemberId] = useState('');
  const [member, setMember] = useState<AdminMemberRow | undefined>();
  const [date, setDate] = useState(today);
  const [triggerId, setTriggerId] = useState('all');
  const [submitted, setSubmitted] = useState(false);
  const [ran, setRan] = useState<{ member: AdminMemberRow | undefined; date: string; trigger: string } | null>(null);
  const [only, setOnly] = useState<'all' | 'fire'>('all');

  const parsed = DryRunRequest.safeParse({ memberId, date });
  const memberErr = submitted && !memberId ? 'Choose a member.' : undefined;
  const dateErr = submitted ? (!/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Pick a valid date.' : date > today ? 'Pick today or an earlier day.' : undefined) : undefined;

  const triggers = useMemo(() => [...(triggersQ.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [triggersQ.data]);
  const memeById = useMemo(() => new Map((memesQ.data ?? []).map((m) => [m.id, m])), [memesQ.data]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!parsed.success || date > today) return;
    try {
      await run.mutateAsync({ triggerId, ...parsed.data });
      setRan({ member, date, trigger: triggerId === 'all' ? 'All triggers' : (triggers.find((t) => t.id === triggerId)?.name ?? 'One trigger') });
      setOnly('all');
    } catch {
      /* toast shown by useAction */
    }
  };

  const results: DryRunResult[] | undefined = ran ? run.data : undefined;
  const fires = results?.reduce((n, r) => n + r.decisions.filter((d) => d.fire).length, 0) ?? 0;
  const decisions = results?.reduce((n, r) => n + r.decisions.length, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Dry run" eyebrow="Nothing is sent" aside="Replays a member’s day against the triggers and explains every decision." />
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormGrid min={200}>
            <Field label="Member" required error={memberErr}>
              <MemberSelect
                value={memberId}
                onChange={(id, m) => {
                  setMemberId(id);
                  setMember(m);
                }}
              />
            </Field>
            <Field label="Day" required error={dateErr} hint="Today or any earlier day.">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} invalid={!!dateErr} className="font-mono text-[13px]" />
            </Field>
            <Field label="Triggers">
              <Select value={triggerId} onChange={(e) => setTriggerId(e.target.value)} disabled={triggersQ.isPending}>
                <option value="all">All triggers (on and off)</option>
                {triggers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.enabled ? '' : ' · off'}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {run.isError && (
              <span role="alert" className="mr-auto text-[13px] font-semibold text-accent-dark">
                {errorMessage(run.error)}
              </span>
            )}
            <Button type="submit" icon={<Play className="h-4 w-4" />} loading={run.isPending}>
              Run dry run
            </Button>
          </div>
        </form>
      </Card>

      {run.isPending && (
        <Card>
          <div role="status" aria-label="Running" className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-3.5 w-4/5" />
                <div className="skeleton h-3.5 w-3/5" />
              </div>
            ))}
          </div>
        </Card>
      )}

      {!run.isPending && ran && results && (
        <Card>
          <CardHeader
            title={`${ran.member?.person.name ?? 'Member'} · ${fmtDate(ran.date, { weekday: true })}`}
            eyebrow={ran.trigger}
            aside={results.length ? `${plural(results.length, 'event')} · ${plural(decisions, 'decision')} · ${fmtInt(fires)} would fire` : undefined}
            actions={
              results.length > 0 ? (
                <Segmented
                  size="sm"
                  label="Show"
                  value={only}
                  onChange={setOnly}
                  options={[
                    { value: 'all', label: 'Everything' },
                    { value: 'fire', label: 'Fires only' },
                  ]}
                />
              ) : undefined
            }
          />
          {results.length === 0 ? (
            <EmptyState compact icon={<FlaskConical className="h-5 w-5" />} title="No events that day" body="This member didn’t log anything or post in chat that day, so no triggers ran." />
          ) : (
            <>
              {fires === 0 && <EmptyState compact icon={<FlaskConical className="h-5 w-5" />} title="Nothing would fire" body="No trigger matched this member on that day. The reasons below show why each one skipped." />}
              <ol className="m-0 ml-1.5 flex list-none flex-col border-l-2 border-hairline p-0">
                {results.map((r, i) => {
                  const list = only === 'fire' ? r.decisions.filter((d) => d.fire) : r.decisions;
                  const anyFire = r.decisions.some((d) => d.fire);
                  if (only === 'fire' && list.length === 0) return null;
                  return (
                    <li key={`${r.event}-${i}`} className="relative flex flex-col gap-2.5 pb-5 pl-5 last:pb-1">
                      <span aria-hidden className={cn('absolute -left-[7px] top-[5px] h-3 w-3 rounded-full border-2 border-white', anyFire ? 'bg-accent' : 'bg-border')} />
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-[14px] font-semibold">{r.label}</span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{eventLabel(r.event)}</span>
                      </div>
                      {list.length === 0 ? (
                        <span className="text-[12px] text-muted">No triggers listen to this event.</span>
                      ) : (
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                          {list.map((d) => {
                            const meme = d.memeId ? memeById.get(d.memeId) : undefined;
                            return (
                              <li key={d.triggerId} className={cn('grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 rounded-[12px] border px-3 py-2.5', d.fire ? 'border-in-bg bg-in-bg/30' : 'border-hairline bg-white')}>
                                <span className={cn('grid h-6 w-6 place-items-center rounded-full', d.fire ? 'bg-in-bg text-in-fg' : 'bg-none-bg text-none-fg')} aria-label={d.fire ? 'Would fire' : 'Would skip'} role="img">
                                  {d.fire ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
                                </span>
                                <div className="flex min-w-0 flex-col gap-1">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => onOpenTrigger(d.triggerId)} className="text-left text-[13px] font-semibold text-ink hover:text-accent">
                                      {d.triggerName}
                                    </button>
                                    <Pill tone={d.fire ? 'in' : 'muted'}>{d.fire ? actionLabel(d.action) : 'Skipped'}</Pill>
                                  </span>
                                  {d.reasons.length > 0 && (
                                    <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-[12px] leading-snug text-muted">
                                      {d.reasons.map((why, k) => (
                                        <li key={k}>{why}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                {d.fire && d.memeId && (
                                  <div className="w-[52px]" title={meme?.caption}>
                                    <MemeImage url={meme ? (meme.thumbUrl ?? meme.url) : null} alt={meme?.caption ?? 'Meme'} rounded />
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </Card>
      )}

      {!ran && !run.isPending && (
        <Card padded={false}>
          <EmptyState icon={<FlaskConical className="h-5 w-5" />} title="Try a day" body="Pick a member and a day, then run. You’ll see each event from that day and whether each trigger would fire or skip, with the reasons." />
        </Card>
      )}
    </div>
  );
}
