import { Megaphone, Send } from 'lucide-react';
import { useState } from 'react';
import type { AnnouncementDto } from '@clubhouse/contracts';
import { AnnouncementRequest } from '@clubhouse/contracts';
import { useAnnounce, useAnnouncements } from '@/features/chat';
import { fmtDateTime, fmtInt, fmtRelative, fromDateTimeLocal, toDateTimeLocal } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  Field,
  Input,
  Mono,
  Pill,
  Segmented,
  Textarea,
  type Column,
} from '@/ui';

type When = 'now' | 'later';

/** Announcement composer (title, body, link, pin, push, now/schedule) + history with delivery stats. */
export function AnnouncementsPanel() {
  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Composer />
      <History />
    </div>
  );
}

function Composer() {
  const announce = useAnnounce();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [pin, setPin] = useState(true);
  const [push, setPush] = useState(true);
  const [when, setWhen] = useState<When>('now');
  const [at, setAt] = useState(() =>
    toDateTimeLocal(new Date(Date.now() + 60 * 60_000).toISOString()),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const scheduledFor = when === 'later' ? fromDateTimeLocal(at) : null;
    const errs: Record<string, string> = {};
    if (
      when === 'later' &&
      (!scheduledFor || new Date(scheduledFor).getTime() <= Date.now() + 60_000)
    )
      errs.scheduledFor = 'Pick a time in the future';
    const parsed = AnnouncementRequest.safeParse({
      title,
      body,
      link: link.trim() || null,
      pin,
      push,
      scheduledFor,
    });
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = String(i.path[0] ?? 'form');
        errs[k] ??=
          k === 'title'
            ? 'Add a title (up to 80 characters)'
            : k === 'body'
              ? 'Write the announcement (up to 1,000 characters)'
              : k === 'link'
                ? 'Use a full link, starting with https://'
                : i.message;
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) return;
    announce.mutate(parsed.data, {
      onSuccess: () => {
        setTitle('');
        setBody('');
        setLink('');
        setWhen('now');
      },
    });
  };

  return (
    <Card>
      <CardHeader title="Post announcement" />
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Field label="Title" required hint={`${title.length}/80`} error={errors.title}>
          <Input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diwali week"
            invalid={!!errors.title}
          />
        </Field>
        <Field label="Message" required hint={`${body.length}/1000`} error={errors.body}>
          <Textarea
            rows={4}
            maxLength={1000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Diwali week: log what you eat, no judgement. Streaks get 2 grace days."
            invalid={!!errors.body}
          />
        </Field>
        <Field label="Link" hint="Optional" error={errors.link}>
          <Input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
            invalid={!!errors.link}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Checkbox
            checked={pin}
            onChange={(e) => setPin(e.target.checked)}
            label="Pin to top of chat"
          />
          <Checkbox
            checked={push}
            onChange={(e) => setPush(e.target.checked)}
            label="Send push to all members"
            hint="Members with push turned off still see it in chat and their inbox."
          />
        </div>
        <Field as="div" label="When" error={errors.scheduledFor}>
          <Segmented
            label="When to post"
            value={when}
            onChange={setWhen}
            options={[
              { value: 'now', label: 'Post now' },
              { value: 'later', label: 'Schedule' },
            ]}
            className="self-start"
          />
          {when === 'later' && (
            <Input
              type="datetime-local"
              aria-label="Post at"
              value={at}
              min={toDateTimeLocal(new Date().toISOString())}
              onChange={(e) => setAt(e.target.value)}
              invalid={!!errors.scheduledFor}
            />
          )}
        </Field>
        <Button
          type="submit"
          block
          loading={announce.isPending}
          icon={<Send className="h-4 w-4" />}
        >
          {when === 'now' ? 'Post' : 'Schedule'}
        </Button>
      </form>
    </Card>
  );
}

function state(a: AnnouncementDto): 'sent' | 'scheduled' | 'draft' {
  return a.sentAt ? 'sent' : a.scheduledFor ? 'scheduled' : 'draft';
}

function History() {
  const q = useAnnouncements();
  const columns: Column<AnnouncementDto>[] = [
    {
      id: 'title',
      header: 'Announcement',
      width: 'minmax(220px,2fr)',
      sortValue: (a) => a.title,
      cell: (a) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{a.title}</span>
            {a.pinned && <Pill tone="accent">Pinned</Pill>}
          </span>
          <span className="line-clamp-2 text-[12px] text-muted">{a.body}</span>
        </div>
      ),
    },
    {
      id: 'when',
      header: 'When',
      width: '150px',
      sortValue: (a) => a.sentAt ?? a.scheduledFor ?? '',
      cell: (a) =>
        state(a) === 'sent' ? (
          <div className="flex flex-col gap-0.5">
            <Pill tone="in">Sent</Pill>
            <span className="text-[12px] text-muted" title={fmtDateTime(a.sentAt)}>
              {fmtRelative(a.sentAt)}
            </span>
          </div>
        ) : state(a) === 'scheduled' ? (
          <div className="flex flex-col gap-0.5">
            <Pill tone="under">Scheduled</Pill>
            <span className="text-[12px] text-muted">{fmtDateTime(a.scheduledFor)}</span>
          </div>
        ) : (
          <Pill tone="muted">Not sent</Pill>
        ),
    },
    {
      id: 'stats',
      header: 'Delivery',
      width: 'minmax(200px,1.2fr)',
      sortValue: (a) => a.stats.recipients,
      cell: (a) => (
        <Mono muted className="flex flex-wrap gap-x-2">
          <span>{fmtInt(a.stats.recipients)} recipients</span>
          {a.push && <span>· {fmtInt(a.stats.pushed)} pushed</span>}
          {a.stats.failed > 0 && (
            <span className="text-accent-dark">· {fmtInt(a.stats.failed)} not delivered</span>
          )}
          <span>· {fmtInt(a.stats.opened)} opened</span>
        </Mono>
      ),
    },
    {
      id: 'by',
      header: 'By',
      width: '120px',
      sortValue: (a) => a.createdBy?.name ?? '',
      cell: (a) => (
        <span className="truncate text-[13px] text-muted">{a.createdBy?.name ?? '—'}</span>
      ),
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="h3 m-0">History</h3>
      <DataTable
        label="Announcement history"
        columns={columns}
        rows={q.data}
        loading={q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(a) => a.id}
        initialSort={{ id: 'when', dir: 'desc' }}
        minWidth={640}
        pageSize={25}
        search={{ placeholder: 'Search announcements', text: (a) => `${a.title} ${a.body}` }}
        filters={[
          {
            id: 'state',
            label: 'State',
            options: [
              { value: '', label: 'All' },
              { value: 'sent', label: 'Sent' },
              { value: 'scheduled', label: 'Scheduled' },
            ],
            predicate: (a, v) => state(a) === v,
          },
        ]}
        empty={
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="No announcements yet"
            body="Post one to reach everyone in chat, with an optional push."
          />
        }
      />
    </div>
  );
}
