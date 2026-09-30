import { useNavigate } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  BulkAssignRequest,
  CreateDraftRequest,
  DraftWithAiRequest,
  type AdminDietListRow,
  type AdminDietPlan,
} from '@clubhouse/contracts';
import { useBulkAssign, useCreateDraft, useDraftWithAi } from '@/features/diets';
import { useMembers } from '@/features/directory';
import { fmtDate, fmtInt, fmtKcal, plural } from '@/lib/format';
import {
  AiChip,
  Button,
  Checkbox,
  confirmAction,
  Field,
  FormGrid,
  Input,
  Inset,
  MemberMultiSelect,
  MemberSelect,
  Modal,
  Segmented,
  Select,
  Textarea,
} from '@/ui';
import { zodErrors } from './shared';

type StartFrom = 'blank' | 'current' | 'copy' | 'template';

function templateKcal(t: AdminDietPlan): number | null {
  const any = t.dayTotals.find((d) => d.dayType === 'any') ?? t.dayTotals[0];
  return any ? any.totals.kcal : null;
}

/** Start a draft for a member (or a new template) from blank, their current plan, another member's plan, or a template. */
type StartDraftProps = {
  onClose: () => void;
  rows: AdminDietListRow[];
  templates: AdminDietPlan[];
  initialUserId?: string;
  asTemplate?: boolean;
};

export function StartDraftModal({ open, ...props }: StartDraftProps & { open: boolean }) {
  return (
    <Modal
      open={open}
      onClose={props.onClose}
      eyebrow={props.asTemplate ? 'New template' : 'New draft'}
      title={props.asTemplate ? 'Start a template' : 'Start a draft'}
      width={520}
    >
      <StartDraftForm {...props} />
    </Modal>
  );
}

/** Mounted fresh each time the modal opens, so state starts from the props. */
function StartDraftForm({
  onClose,
  rows,
  templates,
  initialUserId,
  asTemplate = false,
}: StartDraftProps) {
  const navigate = useNavigate();
  const create = useCreateDraft();
  const [forWho, setForWho] = useState<'member' | 'template'>(asTemplate ? 'template' : 'member');
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [startFrom, setStartFrom] = useState<StartFrom>('blank');
  const [copyFrom, setCopyFrom] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const row = rows.find((r) => r.userId === userId);
  const withPlans = rows.filter((r) => r.published);
  const startOptions: { value: StartFrom; label: string }[] = [
    { value: 'blank', label: 'Blank' },
    ...(forWho === 'member' ? [{ value: 'current' as const, label: 'Current plan' }] : []),
    { value: 'copy', label: 'Copy a plan' },
    { value: 'template', label: 'Template' },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (forWho === 'member' && !userId) errs.userId = 'Choose a member.';
    if (startFrom === 'current' && row && !row.published)
      errs.startFrom = `${row.person.name} has no published plan yet. Start blank or copy one instead.`;
    if (startFrom === 'copy' && !copyFrom) errs.sourcePlanId = 'Pick whose plan to copy.';
    if (startFrom === 'template' && !templateId) errs.sourcePlanId = 'Pick a template.';
    const body = {
      userId: forWho === 'member' ? userId : null,
      name: name.trim() || undefined,
      startFrom,
      sourcePlanId:
        startFrom === 'copy'
          ? copyFrom
          : startFrom === 'template'
            ? templateId
            : startFrom === 'current'
              ? row?.published?.id
              : undefined,
    };
    const parsed = CreateDraftRequest.safeParse(body);
    if (!parsed.success)
      Object.assign(
        errs,
        Object.fromEntries(Object.entries(zodErrors(parsed.error)).filter(([k]) => !errs[k])),
      );
    setErrors(errs);
    if (Object.keys(errs).length) return;
    create.mutate(body, {
      onSuccess: (p) => {
        onClose();
        void navigate({ to: '/diets/$planId', params: { planId: p.id } });
      },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {!asTemplate && (
        <Field as="div" label="For">
          <Segmented
            label="Draft for"
            options={[
              { value: 'member', label: 'A member' },
              { value: 'template', label: 'Template (no member)' },
            ]}
            value={forWho}
            onChange={(v) => {
              setForWho(v);
              if (v === 'template' && startFrom === 'current') setStartFrom('blank');
            }}
          />
        </Field>
      )}
      {forWho === 'member' && (
        <Field label="Member" required error={errors.userId}>
          <MemberSelect value={userId} onChange={(id) => setUserId(id)} aria-label="Member" />
        </Field>
      )}
      {row?.draft && (
        <Inset className="text-[13px]">
          <span>
            {row.person.name} already has a draft, <b>{row.draft.name}</b>, updated{' '}
            {fmtDate(row.draft.updatedAt)}.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => {
              onClose();
              void navigate({ to: '/diets/$planId', params: { planId: row.draft!.id } });
            }}
          >
            Open that draft
          </Button>
        </Inset>
      )}
      <Field as="div" label="Start from" error={errors.startFrom}>
        <Segmented
          label="Start from"
          options={startOptions}
          value={startFrom}
          onChange={setStartFrom}
        />
      </Field>
      {startFrom === 'current' && row && (
        <p className="m-0 text-[13px] text-muted">
          {row.published ? (
            <>
              Copies <b className="text-ink">{row.published.name}</b> (v{row.published.version},{' '}
              {fmtKcal(row.published.kcal)}) into a new draft. The published plan stays live until
              you publish the draft.
            </>
          ) : (
            `${row.person.name} has no published plan yet.`
          )}
        </p>
      )}
      {startFrom === 'copy' && (
        <Field
          label="Copy whose plan"
          required
          error={errors.sourcePlanId}
          hint="Options are copied as they are. Adjust portions for the new member’s targets after."
        >
          <Select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">
              {withPlans.length ? 'Choose a published plan' : 'No published plans yet'}
            </option>
            {withPlans.map((r) => (
              <option key={r.published!.id} value={r.published!.id}>
                {r.person.name} · {r.published!.name} (v{r.published!.version},{' '}
                {fmtInt(r.published!.kcal)} kcal)
              </option>
            ))}
          </Select>
        </Field>
      )}
      {startFrom === 'template' && (
        <Field label="Template" required error={errors.sourcePlanId}>
          <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{templates.length ? 'Choose a template' : 'No templates yet'}</option>
            {templates.map((t) => {
              const k = templateKcal(t);
              return (
                <option key={t.id} value={t.id}>
                  {t.name} · {plural(t.options.length, 'option')}
                  {k != null ? ` · ~${fmtInt(k)} kcal` : ''}
                </option>
              );
            })}
          </Select>
        </Field>
      )}
      <Field
        label="Name"
        hint="Optional. Members see this at the top of their Diet tab."
        error={errors.name}
      >
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            forWho === 'template'
              ? 'e.g. Vegetarian 1,600'
              : row
                ? `${row.person.name.split(' ')[0]}’s plan`
                : 'e.g. Vegetarian, 1,650 kcal'
          }
        />
      </Field>
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          {forWho === 'template' ? 'Create template' : 'Start draft'}
        </Button>
      </div>
    </form>
  );
}

/** Ask the AI for a first draft (diet.draft). Every slot needs a human review before publishing. */
export function DraftWithAiModal({
  open,
  onClose,
  initialUserId,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  initialUserId?: string;
  rows: AdminDietListRow[];
}) {
  const draft = useDraftWithAi();
  return (
    <Modal
      open={open}
      onClose={() => !draft.isPending && onClose()}
      eyebrow={
        <span className="inline-flex items-center gap-2">
          Draft with AI <AiChip feature="diet.draft" />
        </span>
      }
      title="Draft a plan with AI"
      width={540}
      dismissible={!draft.isPending}
    >
      <DraftWithAiForm draft={draft} onClose={onClose} initialUserId={initialUserId} rows={rows} />
    </Modal>
  );
}

function DraftWithAiForm({
  draft,
  onClose,
  initialUserId,
  rows,
}: {
  draft: ReturnType<typeof useDraftWithAi>;
  onClose: () => void;
  initialUserId?: string;
  rows: AdminDietListRow[];
}) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [brief, setBrief] = useState('');
  const [perSlot, setPerSlot] = useState<'2' | '3' | '4' | '5'>('3');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const row = rows.find((r) => r.userId === userId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { userId, brief: brief.trim(), optionsPerSlot: Number(perSlot) };
    const parsed = DraftWithAiRequest.safeParse(body);
    if (!parsed.success) {
      const errs = zodErrors(parsed.error);
      if (errs.userId) errs.userId = 'Choose a member.';
      setErrors(errs);
      return;
    }
    setErrors({});
    draft.mutate(body, {
      onSuccess: (p) => {
        onClose();
        void navigate({ to: '/diets/$planId', params: { planId: p.id } });
      },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Member" required error={errors.userId}>
        <MemberSelect value={userId} onChange={(id) => setUserId(id)} aria-label="Member" />
      </Field>
      {row && (
        <Inset className="text-[13px]">
          <span>
            Target{' '}
            <b className="font-mono">
              {row.targetKcal != null ? fmtKcal(row.targetKcal) : 'not set'}
            </b>
            {row.dietPrefs ? (
              <>
                {' '}
                · Preferences: <b>{row.dietPrefs}</b>
              </>
            ) : (
              ' · No diet preferences saved'
            )}
          </span>
          <span className="text-[12px] text-muted">
            The AI sees these targets and preferences, plus your brief. It doesn’t see names or
            logs.
          </span>
        </Inset>
      )}
      <Field
        label="Brief"
        hint={`${brief.length}/600 · Cuisine, budget, what to lean on or avoid.`}
        error={errors.brief}
      >
        <Textarea
          rows={4}
          maxLength={600}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="South Indian breakfasts, paneer or dal at lunch, light dinners. No mushrooms."
        />
      </Field>
      <Field as="div" label="Options per meal slot" error={errors.optionsPerSlot}>
        <Segmented
          label="Options per meal slot"
          options={(['2', '3', '4', '5'] as const).map((v) => ({ value: v, label: v }))}
          value={perSlot}
          onChange={setPerSlot}
        />
      </Field>
      <p className="m-0 text-[12px] leading-relaxed text-muted">
        Foods the AI can’t match to the database are flagged as estimates. You’ll open every slot to
        review before you can publish. This can take up to half a minute.
      </p>
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={draft.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={draft.isPending} icon={<Sparkles className="h-4 w-4" />}>
          {draft.isPending ? 'Drafting…' : 'Draft plan'}
        </Button>
      </div>
    </form>
  );
}

/** Assign a template to several members at once (scaled to each member's targets). */
type BulkProps = {
  onClose: () => void;
  templates: AdminDietPlan[];
  rows: AdminDietListRow[];
  initialTemplateId?: string;
};

export function BulkAssignModal({ open, ...props }: BulkProps & { open: boolean }) {
  return (
    <Modal
      open={open}
      onClose={props.onClose}
      eyebrow="Templates"
      title="Bulk assign a template"
      width={560}
    >
      <BulkAssignForm {...props} />
    </Modal>
  );
}

function BulkAssignForm({ onClose, templates, rows, initialTemplateId }: BulkProps) {
  const assign = useBulkAssign();
  const members = useMembers();
  const [templateId, setTemplateId] = useState(initialTemplateId ?? '');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [publish, setPublish] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const template = templates.find((t) => t.id === templateId);
  const selectedRows = useMemo(
    () => rows.filter((r) => userIds.includes(r.userId)),
    [rows, userIds],
  );
  const withDraft = selectedRows.filter((r) => r.draft).length;
  const withPublished = selectedRows.filter((r) => r.published).length;
  const noTarget = selectedRows.filter((r) => r.targetKcal == null).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { templateId, userIds, note: note.trim() || null, publish };
    const parsed = BulkAssignRequest.safeParse(body);
    if (!parsed.success) {
      const errs = zodErrors(parsed.error);
      if (errs.templateId) errs.templateId = 'Choose a template.';
      if (errs.userIds) errs.userIds = 'Pick at least one member.';
      setErrors(errs);
      return;
    }
    setErrors({});
    const n = userIds.length;
    const names = userIds
      .map((id) => members.data?.find((m) => m.id === id)?.person.name)
      .filter(Boolean) as string[];
    const kind = publish ? 'published' : 'draft';
    await confirmAction({
      eyebrow: 'Bulk assign',
      title: publish ? `Publish to ${plural(n, 'member')}?` : `Create ${plural(n, 'draft')}?`,
      tone: 'default',
      body: (
        <>
          {plural(n, 'member')} {n === 1 ? 'gets' : 'get'} a new {kind} plan from{' '}
          <b className="text-ink">{template?.name}</b>, scaled to their own calorie targets.{' '}
          {publish
            ? 'It replaces their current published plan and they get a notification.'
            : 'Nothing changes for them until you publish each draft.'}
        </>
      ),
      impact: [
        `${plural(n, 'new plan')} (${kind})`,
        ...(names.length
          ? [
              names.slice(0, 6).join(', ') +
                (names.length > 6 ? ` and ${names.length - 6} more` : ''),
            ]
          : []),
        ...(publish && withPublished
          ? [`${plural(withPublished, 'published plan')} replaced`]
          : []),
        ...(withDraft
          ? [
              `${plural(withDraft, 'member')} already ${withDraft === 1 ? 'has' : 'have'} a draft in progress`,
            ]
          : []),
        ...(noTarget
          ? [`${plural(noTarget, 'member')} without a calorie target (kept at template portions)`]
          : []),
      ],
      confirmLabel: publish ? 'Publish' : 'Create drafts',
      onConfirm: async () => {
        await assign.mutateAsync(body);
        onClose();
      },
    });
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      <Field label="Template" required error={errors.templateId}>
        <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">{templates.length ? 'Choose a template' : 'No templates yet'}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {plural(t.options.length, 'option')}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        as="div"
        label="Members"
        required
        error={errors.userIds}
        hint="Portions are scaled to each member’s calorie target."
      >
        <MemberMultiSelect label="Members" value={userIds} onChange={setUserIds} />
      </Field>
      <FormGrid min={200}>
        <Field label="Note to members" hint="Optional. Shown with the update." error={errors.note}>
          <Textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="New plan for the month, more protein at breakfast."
          />
        </Field>
        <div className="flex flex-col justify-center gap-1">
          <Checkbox
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            label="Publish now"
            hint="Off: creates drafts you can tweak and publish one by one."
          />
        </div>
      </FormGrid>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={assign.isPending}>
          {publish ? 'Publish' : 'Create drafts'}
          {userIds.length > 0 && ` (${userIds.length})`}
        </Button>
      </div>
    </form>
  );
}
