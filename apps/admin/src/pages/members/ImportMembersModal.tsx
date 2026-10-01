import { AlertTriangle, Download, FileUp } from 'lucide-react';
import Papa from 'papaparse';
import { useMemo, useRef, useState } from 'react';
import type { ImportMembersResult } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { useImportMembers } from '@/features/members';
import { copyText, downloadText, toCsv } from '@/lib/download';
import { errorMessage } from '@/lib/errors';
import { plural, todayLocal } from '@/lib/format';
import { Button, DataTable, Field, Mono, Modal, Pill, RolePill, Textarea, type Column } from '@/ui';

type Row = ImportMembersResult['rows'][number];
type Step = 'input' | 'preview' | 'done';

const REQUIRED = ['displayName', 'username'] as const;
const KNOWN = ['displayName', 'username', 'email', 'role'];
const TEMPLATE = 'displayName,username,email,role\nNikhil Menon,nikhil,nikhil@example.com,member\n';

interface LocalCheck {
  rows: number;
  missing: string[];
  unknown: string[];
  parseErrors: number;
}

function checkLocally(text: string): LocalCheck | null {
  if (!text.trim()) return null;
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
  const fields = res.meta.fields ?? [];
  return {
    rows: res.data.length,
    missing: REQUIRED.filter((f) => !fields.includes(f)),
    unknown: fields.filter((f) => f && !KNOWN.includes(f)),
    parseErrors: res.errors.length,
  };
}

/** Import members from CSV: local check (papaparse) → server dry run with per-row status → create → one-time temp passwords. */
export function ImportMembersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useImportMembers();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('input');
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportMembersResult | null>(null);
  const [result, setResult] = useState<ImportMembersResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset each time the modal opens (adjust state during render on the open transition).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep('input');
      setCsv('');
      setFileName(null);
      setPreview(null);
      setResult(null);
      setError(null);
    }
  }

  const local = useMemo(() => checkLocally(csv), [csv]);
  const okCount = preview ? preview.rows.filter((r) => r.status === 'ok').length : 0;
  const errCount = preview ? preview.rows.filter((r) => r.status === 'error').length : 0;
  const created = result ? result.rows.filter((r) => r.status === 'created' && r.tempPassword) : [];

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 1_000_000) {
      setError('That file is over 1 MB. Split it into smaller files.');
      return;
    }
    setError(null);
    setFileName(f.name);
    setCsv(await f.text());
  };

  const dryRun = async () => {
    setError(null);
    try {
      setPreview(await run.mutateAsync({ csv, dryRun: true }));
      setStep('preview');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const commit = async () => {
    setError(null);
    try {
      const r = await run.mutateAsync({ csv, dryRun: false });
      setResult(r);
      setStep('done');
      toast.success(r.created === 1 ? '1 member created' : `${r.created} members created`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const passwordsCsv = () => toCsv([['displayName', 'username', 'tempPassword'], ...created.map((r) => [r.displayName, r.username, r.tempPassword])]);

  const previewCols: Column<Row>[] = [
    { id: 'line', header: 'Line', width: '56px', sortValue: (r) => r.line, cell: (r) => <Mono muted>{r.line}</Mono> },
    { id: 'name', header: 'Name', width: 'minmax(140px,1.2fr)', sortValue: (r) => r.displayName, cell: (r) => <span className="font-semibold">{r.displayName || '—'}</span> },
    { id: 'user', header: 'Username', width: 'minmax(110px,1fr)', sortValue: (r) => r.username, cell: (r) => <Mono>{r.username ? `@${r.username}` : '—'}</Mono> },
    { id: 'role', header: 'Role', width: '110px', sortValue: (r) => r.role, cell: (r) => (r.role ? <RolePill role={r.role} /> : <span className="text-muted">—</span>) },
    {
      id: 'status',
      header: 'Status',
      width: 'minmax(170px,1.6fr)',
      sortValue: (r) => r.status,
      cell: (r) =>
        r.status === 'error' ? (
          <span className="flex flex-col items-start gap-0.5">
            <Pill tone="over" icon={<AlertTriangle aria-hidden className="h-3 w-3" />}>
              Needs a fix
            </Pill>
            <span className="text-[12px] leading-snug text-accent-dark">{r.error}</span>
          </span>
        ) : (
          <Pill tone="in">Ready</Pill>
        ),
    },
  ];

  const doneCols: Column<Row>[] = [
    { id: 'name', header: 'Name', width: 'minmax(140px,1.2fr)', sortValue: (r) => r.displayName, cell: (r) => <span className="font-semibold">{r.displayName}</span> },
    { id: 'user', header: 'Username', width: 'minmax(110px,1fr)', sortValue: (r) => r.username, cell: (r) => <Mono>@{r.username}</Mono> },
    { id: 'pw', header: 'Temporary password', width: 'minmax(160px,1.2fr)', cell: (r) => <code className="select-all font-mono text-[13px] tracking-[0.04em]">{r.tempPassword}</code> },
  ];

  const footer =
    step === 'input' ? (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void dryRun()} loading={run.isPending} disabled={!local || local.rows === 0 || local.missing.length > 0}>
          {local && local.rows > 0 ? `Check ${plural(local.rows, 'row')}` : 'Check file'}
        </Button>
      </>
    ) : step === 'preview' ? (
      <>
        <Button variant="secondary" onClick={() => setStep('input')} disabled={run.isPending}>
          Back
        </Button>
        <Button onClick={() => void commit()} loading={run.isPending} disabled={okCount === 0}>
          {okCount === 0 ? 'Nothing to create' : `Create ${plural(okCount, 'member')}`}
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="outline"
          disabled={!created.length}
          onClick={async () => {
            const ok = await copyText(created.map((r) => `${r.displayName}\t@${r.username}\t${r.tempPassword}`).join('\n'));
            if (ok) toast.success('Copied all passwords');
            else toast.error('Couldn’t copy. Download the CSV instead.');
          }}
        >
          Copy all
        </Button>
        <Button variant="outline" icon={<Download className="h-4 w-4" />} disabled={!created.length} onClick={() => downloadText(`clubhouse-temp-passwords-${todayLocal()}.csv`, passwordsCsv())}>
          Download CSV
        </Button>
        <Button onClick={onClose}>I’ve saved them</Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={step !== 'done'}
      eyebrow={step === 'done' ? 'Shown once' : 'Invite-only'}
      title={step === 'input' ? 'Import members' : step === 'preview' ? 'Check the import' : 'Members created'}
      width={step === 'input' ? 560 : 760}
      footer={footer}
    >
      {step === 'input' && (
        <div className="flex flex-col gap-3.5">
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            One member per row with a header row: <Mono>displayName,username,email,role</Mono>. Email is optional; role is <Mono>member</Mono> or <Mono>admin</Mono>. Nothing is created until you check it and confirm.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
            <Button variant="outline" icon={<FileUp className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Choose a .csv file
            </Button>
            {fileName && <Mono muted>{fileName}</Mono>}
            <Button variant="link" size="sm" className="ml-auto" onClick={() => downloadText('clubhouse-members-template.csv', TEMPLATE)}>
              Download template
            </Button>
          </div>
          <Field label="Or paste CSV" hint={local ? undefined : 'Paste rows including the header line.'}>
            <Textarea
              rows={7}
              value={csv}
              spellCheck={false}
              className="font-mono text-[12px]"
              placeholder={TEMPLATE}
              onChange={(e) => {
                setFileName(null);
                setCsv(e.target.value);
              }}
            />
          </Field>
          {local && (
            <div className="flex flex-col gap-1 rounded-[12px] bg-bg px-3.5 py-3 text-[13px]" aria-live="polite">
              <span className="font-semibold">{plural(local.rows, 'row')} found</span>
              {local.missing.length > 0 && <span className="font-semibold text-accent-dark">Missing column{local.missing.length > 1 ? 's' : ''}: {local.missing.join(', ')}</span>}
              {local.unknown.length > 0 && <span className="text-muted">Ignored column{local.unknown.length > 1 ? 's' : ''}: {local.unknown.join(', ')}</span>}
              {local.parseErrors > 0 && <span className="text-muted">{plural(local.parseErrors, 'line')} couldn’t be read cleanly; the check will point them out.</span>}
            </div>
          )}
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Pill tone="in">{okCount} ready</Pill>
            {errCount > 0 && <Pill tone="over">{errCount} need a fix</Pill>}
            <span className="text-muted">{errCount > 0 ? 'Rows that need a fix won’t be created. Fix them in the file and check again to include them.' : 'Everything looks good.'}</span>
          </div>
          <DataTable
            label="Import preview"
            columns={previewCols}
            rows={preview.rows}
            rowKey={(r) => String(r.line)}
            minWidth={620}
            initialSort={{ id: 'status', dir: 'asc' }}
            search={{ placeholder: 'Search rows', text: (r) => `${r.displayName} ${r.username} ${r.email ?? ''} ${r.error ?? ''}` }}
            filters={[{ id: 'status', label: 'Status', options: [{ value: '', label: 'All rows' }, { value: 'ok', label: 'Ready' }, { value: 'error', label: 'Needs a fix' }], predicate: (r, v) => r.status === v }]}
          />
        </div>
      )}

      {step === 'done' && result && (
        <div className="flex flex-col gap-3">
          <div role="alert" className="flex items-start gap-2 rounded-[12px] bg-under-bg px-3.5 py-3 text-[13px] leading-snug text-under-fg">
            <AlertTriangle aria-hidden className="mt-[1px] h-4 w-4 shrink-0" />
            <span>
              These temporary passwords are shown <b>only once</b>. Copy or download them now and share each one privately. They must be changed on first login and expire in 7 days.
            </span>
          </div>
          <DataTable label="Created members and temporary passwords" columns={doneCols} rows={created} rowKey={(r) => String(r.line)} minWidth={520} search={{ placeholder: 'Search', text: (r) => `${r.displayName} ${r.username}` }} />
          {result.errors > 0 && <span className="text-[12px] text-muted">{result.errors === 1 ? '1 row wasn’t' : `${result.errors} rows weren’t`} created because {result.errors === 1 ? 'it needs' : 'they need'} a fix.</span>}
        </div>
      )}

      {error && (
        <div role="alert" className="text-[13px] font-semibold text-accent-dark">
          {error}
        </div>
      )}
    </Modal>
  );
}
