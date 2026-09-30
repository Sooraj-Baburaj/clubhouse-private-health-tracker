import { CheckCircle2, FileUp, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useMemo, useState } from 'react';
import { useImportFoods } from '@/features/foods';
import { fmtBytes, fmtInt, plural } from '@/lib/format';
import { Button, Field, Inset, KpiCard, KpiGrid, Modal, Pill, Textarea } from '@/ui';

const REQUIRED = ['name', 'kcal', 'protein', 'carbs', 'fat', 'fibre'] as const;
const OPTIONAL = [
  'external_id',
  'brand',
  'aliases',
  'category',
  'tags',
  'veg',
  'serving_options',
  'default_serving',
] as const;
const MAX_CHARS = 5_000_000;

type Result = { total: number; inserted: number; updated: number; errors: string[] };

/** CSV import: paste or choose a file → local check (papaparse) → server import → counts + errors. */
export function ImportFoodsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = useImportFoods();
  return (
    <Modal
      open={open}
      onClose={() => !run.isPending && onClose()}
      eyebrow="Foods"
      title="Import foods from CSV"
      width={620}
      dismissible={!run.isPending}
    >
      <ImportBody run={run} onClose={onClose} />
    </Modal>
  );
}

function ImportBody({
  run,
  onClose,
}: {
  run: ReturnType<typeof useImportFoods>;
  onClose: () => void;
}) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const check = useMemo(() => {
    if (!csv.trim()) return null;
    const parsed = Papa.parse<Record<string, string>>(csv, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    const headers = parsed.meta.fields ?? [];
    const missing = REQUIRED.filter((h) => !headers.includes(h));
    const unknown = headers.filter(
      (h) =>
        !(REQUIRED as readonly string[]).includes(h) &&
        !(OPTIONAL as readonly string[]).includes(h),
    );
    const rows = parsed.data;
    const noName = rows.filter((r) => !r.name?.trim()).length;
    return {
      headers,
      missing,
      unknown,
      rows: rows.length,
      sample: rows.slice(0, 3),
      parseErrors: parsed.errors.length,
      noName,
    };
  }, [csv]);

  const tooBig = csv.length > MAX_CHARS;
  const ok = !!check && check.missing.length === 0 && check.rows > 0 && !tooBig;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(`${f.name} · ${fmtBytes(f.size)}`);
    setCsv(await f.text());
  };

  return (
    <>
      {result ? (
        <div className="flex flex-col gap-4" aria-live="polite">
          <span className="flex items-center gap-1.5 text-[15px] font-semibold">
            Import finished
          </span>
          <KpiGrid>
            <KpiCard index={0} label="Rows read" value={result.total} />
            <KpiCard index={1} label="New foods" value={result.inserted} />
            <KpiCard index={2} label="Updated" value={result.updated} />
          </KpiGrid>
          {result.errors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">
                {plural(result.errors.length, 'row')} skipped
              </span>
              <ul className="m-0 flex max-h-[220px] list-none flex-col gap-1 overflow-y-auto rounded-[12px] bg-bg p-3 font-mono text-[12px]">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-accent-dark">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-in-fg">
              <CheckCircle2 aria-hidden className="h-4 w-4" /> Every row went in.
            </span>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return;
            run.mutate(csv, { onSuccess: setResult });
          }}
        >
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            Same format as the seed files: nutrition is per 100 g. Rows with a known{' '}
            <span className="font-mono">external_id</span> update the existing food (admin edits are
            kept); the rest are added as team foods.
          </p>
          <Inset className="text-[12px]">
            <span>
              <b>Required:</b> <span className="font-mono">{REQUIRED.join(', ')}</span>
            </span>
            <span className="text-muted">
              <b className="text-ink">Optional:</b>{' '}
              <span className="font-mono">{OPTIONAL.join(', ')}</span>. Tags separated by{' '}
              <span className="font-mono">|</span>; serving_options as JSON.
            </span>
          </Inset>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-[rgba(182,49,108,0.25)] bg-white px-4 text-[14px] font-semibold hover:border-accent focus-within:outline-2 focus-within:outline-accent">
              <FileUp aria-hidden className="h-4 w-4" /> Choose file
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <span className="text-[12px] text-muted">{fileName ?? 'or paste below'}</span>
          </div>
          <Field
            label="CSV"
            hint={csv ? `${fmtInt(csv.length)} characters` : undefined}
            error={tooBig ? 'That’s over 5 MB. Split the file and import it in parts.' : undefined}
          >
            <Textarea
              rows={7}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setFileName(null);
              }}
              placeholder={
                'external_id,name,category,tags,kcal,protein,carbs,fat,fibre,serving_options,default_serving\nmy-dal,Moong dal,legume,legume|high_protein,104,7,18,0.4,2,"[{""label"":""1 katori"",""grams"":150}]",1 katori'
              }
              className="font-mono text-[12px]"
              spellCheck={false}
            />
          </Field>
          {check && (
            <div
              className="flex flex-col gap-2 rounded-[12px] border border-hairline p-3 text-[13px]"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={check.rows ? 'in' : 'under'}>{plural(check.rows, 'row')}</Pill>
                {check.missing.length ? (
                  <Pill tone="over">Missing: {check.missing.join(', ')}</Pill>
                ) : (
                  <Pill tone="in">Headers look right</Pill>
                )}
                {check.unknown.length > 0 && (
                  <Pill tone="muted" title={check.unknown.join(', ')}>
                    {plural(check.unknown.length, 'extra column')} ignored
                  </Pill>
                )}
                {check.parseErrors > 0 && (
                  <Pill tone="under">{plural(check.parseErrors, 'parse warning')}</Pill>
                )}
                {check.noName > 0 && (
                  <Pill tone="under">{plural(check.noName, 'row')} without a name</Pill>
                )}
              </div>
              {check.sample.length > 0 && check.missing.length === 0 && (
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-[12px] text-muted">
                  {check.sample.map((r, i) => (
                    <li key={i} className="truncate">
                      <span className="text-ink">{r.name}</span> · {r.kcal} kcal · P {r.protein} · C{' '}
                      {r.carbs} · F {r.fat} · Fb {r.fibre}
                    </li>
                  ))}
                  {check.rows > check.sample.length && (
                    <li>… and {fmtInt(check.rows - check.sample.length)} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={run.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!ok}
              loading={run.isPending}
              icon={<Upload className="h-4 w-4" />}
            >
              Import{check?.rows ? ` ${fmtInt(check.rows)} rows` : ''}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
