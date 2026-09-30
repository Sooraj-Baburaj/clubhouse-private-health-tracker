import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CopyPlus, LayoutTemplate, Send, Trash2 } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import {
  PublishPlanRequest,
  UpdatePlanRequest,
  type AdminDietPlan,
  type MealSlot,
} from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import {
  useCreateDraft,
  useDeletePlan,
  useDietPlan,
  usePublishPlan,
  useReviewSlot,
  useSaveAsTemplate,
  useUpdatePlan,
} from '@/features/diets';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, fmtInt, plural } from '@/lib/format';
import {
  AiChip,
  Button,
  Card,
  confirmAction,
  EmptyState,
  ErrorState,
  Field,
  FormGrid,
  Input,
  Inset,
  KeyValues,
  Modal,
  PageHeader,
  PersonCell,
  SkeletonCard,
  StatusPill,
  TabPanel,
  Tabs,
  Textarea,
} from '@/ui';
import {
  DayTotalsCard,
  FeedbackPanel,
  PhonePreview,
  ReviewChecklist,
  SlotSection,
  VersionsPanel,
} from './BuilderParts';
import { OptionEditor, parseOptionTarget } from './OptionEditor';
import { macroText, MEAL_SLOTS, useSlotLabels, zodErrors } from './shared';

type Tab = 'builder' | 'versions' | 'feedback';

/** Diet builder: plan header, five slots of options, option editor drawer, review, publish, versions and feedback. */
export function DietBuilderPage() {
  const { planId } = useParams({ from: '/shell/diets/$planId' });
  const search = useSearch({ from: '/shell/diets/$planId' });
  const navigate = useNavigate({ from: '/diets/$planId' });
  const q = useDietPlan(planId);
  const plan = q.data;
  const labels = useSlotLabels();
  const review = useReviewSlot(planId);
  const reduce = useReducedMotion();

  const editable = !!plan && (plan.status === 'draft' || plan.isTemplate);
  const needsReview = !!plan && plan.aiGenerated && !plan.reviewComplete && plan.status === 'draft';
  const tab: Tab =
    search.tab === 'versions'
      ? 'versions'
      : search.tab === 'feedback' && plan?.userId
        ? 'feedback'
        : 'builder';

  const setOption = (option: string | undefined) =>
    void navigate({ search: (s) => ({ ...s, option }) });
  const setTab = (t: Tab) =>
    void navigate({
      search: (s) => ({ ...s, tab: t === 'builder' ? undefined : t }),
      replace: true,
    });

  // Opening an option (or adding one) in a slot of an AI draft counts as reviewing that slot.
  const requested = useRef(new Set<string>());
  const target = parseOptionTarget(plan, search.option);
  const targetSlot = target?.slot;
  useEffect(() => {
    if (!plan || !targetSlot || !needsReview || plan.reviewChecklist[targetSlot]) return;
    const k = `${plan.id}:${targetSlot}`;
    if (requested.current.has(k)) return;
    requested.current.add(k);
    review.mutate(targetSlot, { onError: () => requested.current.delete(k) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, targetSlot, needsReview]);

  const goToSlot = (slot: MealSlot) => {
    if (tab !== 'builder') setTab('builder');
    requestAnimationFrame(() =>
      document
        .getElementById(`slot-${slot}`)
        ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
    );
  };

  if (q.isPending)
    return (
      <>
        <div className="flex flex-col gap-2">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-9 w-72" />
        </div>
        <SkeletonCard lines={3} />
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-3">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
          <SkeletonCard lines={8} />
        </div>
      </>
    );
  if (q.isError || !plan)
    return (
      <>
        <BackLink />
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </>
    );

  const unreviewedDone = MEAL_SLOTS.filter((s) => plan.reviewChecklist[s]).length;

  return (
    <>
      <BackLink template={plan.isTemplate} />
      <BuilderHeader
        plan={plan}
        editable={editable}
        needsReview={needsReview}
        reviewedCount={unreviewedDone}
      />
      <PlanMeta plan={plan} editable={editable} />
      {search.option && !target && (
        <Card>
          <EmptyState
            compact
            title="That option isn’t in this plan"
            body="It may have been deleted or belong to another version."
            action={
              <Button size="sm" variant="secondary" onClick={() => setOption(undefined)}>
                Dismiss
              </Button>
            }
          />
        </Card>
      )}
      <Tabs<Tab>
        label="Plan views"
        value={tab}
        onChange={setTab}
        className="self-start"
        tabs={[
          { value: 'builder', label: 'Builder' },
          {
            value: 'versions',
            label: 'Versions',
            count: plan.versions.length,
            hidden: plan.isTemplate,
          },
          { value: 'feedback', label: 'Feedback', hidden: !plan.userId },
        ]}
      />
      {tab === 'builder' && (
        <TabPanel k="builder">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-4">
              {plan.slotWarnings.length > 0 && (
                <Inset className="border border-[#f0d9a8] bg-under-bg text-under-fg">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <AlertTriangle aria-hidden className="h-4 w-4" /> Worth a look
                  </span>
                  <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[13px]">
                    {plan.slotWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Inset>
              )}
              {needsReview && <ReviewChecklist plan={plan} labels={labels} onGo={goToSlot} />}
              {!editable && (
                <Inset className="text-[13px]">
                  <span>
                    This version is <b>{plan.status}</b> and read-only. Use “New draft from this” to
                    make changes
                    {plan.status === 'published'
                      ? '; the member keeps seeing this one until you publish the new draft.'
                      : '.'}
                  </span>
                </Inset>
              )}
              {MEAL_SLOTS.map((s) => (
                <SlotSection
                  key={s}
                  slot={s}
                  label={labels[s]}
                  plan={plan}
                  options={plan.options.filter((o) => o.mealSlot === s)}
                  editable={editable}
                  onOpen={(id) => setOption(id)}
                  onAdd={(slot) => setOption(`new:${slot}`)}
                  review={
                    plan.aiGenerated && plan.status === 'draft'
                      ? {
                          reviewed: !!plan.reviewChecklist[s],
                          pending: review.isPending && review.variables === s,
                          onMark: () =>
                            review.mutate(s, {
                              onSuccess: () => toast.success(`${labels[s]} reviewed`),
                            }),
                        }
                      : null
                  }
                />
              ))}
            </div>
            <aside
              aria-label="Totals and member preview"
              className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4"
            >
              <DayTotalsCard plan={plan} />
              <PhonePreview plan={plan} labels={labels} />
            </aside>
          </div>
        </TabPanel>
      )}
      {tab === 'versions' && (
        <TabPanel k="versions">
          <VersionsPanel plan={plan} labels={labels} />
        </TabPanel>
      )}
      {tab === 'feedback' && (
        <TabPanel k="feedback">
          <FeedbackPanel plan={plan} labels={labels} />
        </TabPanel>
      )}
      <OptionEditor
        plan={plan}
        target={search.option}
        readOnly={!editable}
        onClose={() => setOption(undefined)}
      />
    </>
  );
}

function BackLink({ template }: { template?: boolean }) {
  return (
    <Link
      to="/diets"
      search={template ? { tab: 'templates' } : {}}
      className="-mb-2 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" /> {template ? 'Templates' : 'Diet plans'}
    </Link>
  );
}

/* ───────── Header (inline name, status, actions) ───────── */

function BuilderHeader({
  plan,
  editable,
  needsReview,
  reviewedCount,
}: {
  plan: AdminDietPlan;
  editable: boolean;
  needsReview: boolean;
  reviewedCount: number;
}) {
  const navigate = useNavigate();
  const update = useUpdatePlan(plan.id);
  const del = useDeletePlan();
  const createDraft = useCreateDraft();
  const [publishOpen, setPublishOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);

  const canPublish = !plan.isTemplate && plan.status === 'draft';
  const publishBlock = !canPublish
    ? null
    : plan.options.length === 0
      ? 'Add some options before publishing.'
      : needsReview
        ? `Review every AI-drafted slot first (${reviewedCount} of ${MEAL_SLOTS.length} done).`
        : null;

  const onDelete = async () => {
    const est = plan.options.reduce((a, o) => a + o.aiEstimateItems, 0);
    const ok = await confirmAction({
      title: plan.isTemplate ? 'Delete this template?' : 'Delete this draft?',
      body: plan.isTemplate ? (
        <>
          <b className="text-ink">{plan.name}</b> and its options are removed. Plans already
          assigned from it stay as they are.
        </>
      ) : (
        <>
          <b className="text-ink">{plan.name}</b> and its options are removed.{' '}
          {plan.person?.name ?? 'The member'}’s published plan, if any, isn’t touched.
        </>
      ),
      impact: [
        plural(plan.options.length, 'option'),
        ...(est ? [plural(est, 'AI-estimate item')] : []),
        ...(plan.note ? ['The plan note'] : []),
      ],
      confirmLabel: plan.isTemplate ? 'Delete template' : 'Delete draft',
      onConfirm: () => del.mutateAsync(plan.id),
    });
    if (ok !== null)
      void navigate({ to: '/diets', search: plan.isTemplate ? { tab: 'templates' } : {} });
  };

  const newDraftFromThis = () =>
    createDraft.mutate(
      { userId: plan.userId, startFrom: 'copy', sourcePlanId: plan.id },
      { onSuccess: (p) => void navigate({ to: '/diets/$planId', params: { planId: p.id } }) },
    );

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex flex-wrap items-center gap-2">
            {plan.isTemplate ? 'Template' : (plan.person?.name ?? 'Member plan')} · v{plan.version}
            {plan.aiGenerated && <AiChip feature="diet.draft" />}
          </span>
        }
        title={editable ? <NameInput key={plan.name} plan={plan} update={update} /> : plan.name}
        actions={
          <>
            <StatusPill
              status={plan.isTemplate ? 'template' : plan.status}
              label={plan.isTemplate ? 'Template' : undefined}
            />
            {!plan.isTemplate && (
              <Button
                variant="outline"
                icon={<LayoutTemplate className="h-4 w-4" />}
                onClick={() => setTplOpen(true)}
              >
                Save as template
              </Button>
            )}
            {editable && (
              <Button
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => void onDelete()}
              >
                {plan.isTemplate ? 'Delete' : 'Delete draft'}
              </Button>
            )}
            {!editable && !plan.isTemplate && (
              <Button
                icon={<CopyPlus className="h-4 w-4" />}
                loading={createDraft.isPending}
                onClick={newDraftFromThis}
              >
                New draft from this
              </Button>
            )}
            {canPublish && (
              <span title={publishBlock ?? undefined} className="inline-flex">
                <Button
                  icon={<Send className="h-4 w-4" />}
                  disabled={!!publishBlock}
                  onClick={() => setPublishOpen(true)}
                  aria-describedby={publishBlock ? 'publish-block' : undefined}
                >
                  Publish
                </Button>
              </span>
            )}
          </>
        }
      />
      {publishBlock && (
        <p id="publish-block" className="-mt-2 text-[12px] text-muted sm:self-end sm:text-right">
          {publishBlock}
        </p>
      )}
      <PublishModal plan={plan} open={publishOpen} onClose={() => setPublishOpen(false)} />
      <SaveTemplateModal plan={plan} open={tplOpen} onClose={() => setTplOpen(false)} />
    </>
  );
}

/** Inline plan name: saves on blur or Enter, Escape reverts. Remounts (key) when the saved name changes. */
function NameInput({
  plan,
  update,
}: {
  plan: AdminDietPlan;
  update: ReturnType<typeof useUpdatePlan>;
}) {
  const [name, setName] = useState(plan.name);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const saveName = () => {
    const v = name.trim();
    if (v === plan.name) return;
    const parsed = UpdatePlanRequest.safeParse({ name: v });
    if (!parsed.success) {
      setNameErr(v ? 'Keep it under 80 characters.' : 'Give the plan a name.');
      return;
    }
    setNameErr(null);
    update.mutate({ name: v }, { onError: () => setName(plan.name) });
  };
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <input
        aria-label="Plan name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setName(plan.name);
            setNameErr(null);
          }
        }}
        aria-invalid={!!nameErr || undefined}
        className={cn(
          'display-1 -mx-2 w-full min-w-0 max-w-[640px] rounded-[12px] border border-transparent bg-transparent px-2 py-0.5 outline-none transition-colors hover:border-border focus:border-accent focus:bg-white',
          nameErr && 'border-accent-dark',
        )}
        style={{ width: `min(100%, ${Math.max(8, name.length + 2)}ch)` }}
      />
      {nameErr && (
        <span role="alert" className="text-[12px] font-semibold tracking-normal text-accent-dark">
          {nameErr}
        </span>
      )}
    </span>
  );
}

/* ───────── Meta card: person, targets, AI rationale, effective date, note ───────── */

function PlanMeta({ plan, editable }: { plan: AdminDietPlan; editable: boolean }) {
  const update = useUpdatePlan(plan.id);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = (patch: { effectiveFrom?: string | null; note?: string | null }) => {
    const parsed = UpdatePlanRequest.safeParse(patch);
    if (!parsed.success) {
      setErrors(zodErrors(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(patch);
  };

  const published = plan.versions.find((v) => v.status === 'published' && v.id !== plan.id);

  return (
    <Card>
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}
      >
        <div className="flex min-w-0 flex-col gap-3">
          {plan.person ? (
            <PersonCell
              person={plan.person}
              size={40}
              sub={plan.targets ? `Target ${fmtInt(plan.targets.kcal)} kcal` : 'No targets yet'}
            />
          ) : (
            <span className="text-[13px] text-muted">
              Template: not tied to a member. Assign it from Diet plans › Templates; portions scale
              to each member’s targets.
            </span>
          )}
          <KeyValues
            items={[
              ...(plan.targets
                ? ([
                    [
                      'Targets',
                      <span className="font-mono text-[12px]">
                        {fmtInt(plan.targets.kcal)} kcal · {macroText(plan.targets, true)}
                      </span>,
                    ],
                  ] as [React.ReactNode, React.ReactNode][])
                : []),
              [
                'Status',
                plan.isTemplate
                  ? 'Template'
                  : plan.status === 'published'
                    ? `Published ${fmtDateTime(plan.publishedAt)}`
                    : plan.status === 'draft'
                      ? 'Draft (members don’t see it yet)'
                      : 'Archived',
              ],
              ...(published && plan.status === 'draft'
                ? ([
                    [
                      'Live now',
                      `v${published.version}, published ${fmtDate(published.publishedAt)}`,
                    ],
                  ] as [React.ReactNode, React.ReactNode][])
                : []),
              ...(plan.reviewedBy
                ? ([['Reviewed by', plan.reviewedBy.name]] as [React.ReactNode, React.ReactNode][])
                : []),
            ]}
          />
          {plan.aiGenerated && (
            <Inset className="bg-ai-bg/60">
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <AiChip feature="diet.draft" /> Why the AI drafted it this way
              </span>
              <span className="text-[13px] leading-relaxed">
                {plan.aiRationale || 'No rationale was returned for this draft.'}
              </span>
            </Inset>
          )}
        </div>
        <FormGrid min={200} className="content-start">
          {!plan.isTemplate && (
            <EffectiveField
              key={plan.effectiveFrom ?? ''}
              plan={plan}
              editable={editable}
              error={errors.effectiveFrom}
              onSave={save}
            />
          )}
          <NoteField
            key={plan.note ?? ''}
            plan={plan}
            editable={editable}
            error={errors.note}
            onSave={save}
          />
          {update.isPending && <span className="text-[12px] text-muted">Saving…</span>}
        </FormGrid>
      </div>
    </Card>
  );
}

type SavePatch = { effectiveFrom?: string | null; note?: string | null };

function EffectiveField({
  plan,
  editable,
  error,
  onSave,
}: {
  plan: AdminDietPlan;
  editable: boolean;
  error?: string;
  onSave: (p: SavePatch) => void;
}) {
  const [effective, setEffective] = useState(plan.effectiveFrom ?? '');
  return (
    <Field
      label="Effective from"
      hint="Leave empty to start as soon as it’s published."
      error={error}
    >
      <Input
        type="date"
        value={effective}
        disabled={!editable}
        onChange={(e) => setEffective(e.target.value)}
        onBlur={() => {
          if ((effective || null) !== plan.effectiveFrom)
            onSave({ effectiveFrom: effective || null });
        }}
      />
    </Field>
  );
}

function NoteField({
  plan,
  editable,
  error,
  onSave,
}: {
  plan: AdminDietPlan;
  editable: boolean;
  error?: string;
  onSave: (p: SavePatch) => void;
}) {
  const [note, setNote] = useState(plan.note ?? '');
  return (
    <Field
      label={plan.isTemplate ? 'Template note' : 'Note to member'}
      hint={`${note.length}/500 · ${plan.isTemplate ? 'Copied to plans made from it.' : 'Shown with the plan. Saves when you leave the field.'}`}
      error={error}
      className={plan.isTemplate ? undefined : 'col-span-full'}
    >
      <Textarea
        rows={2}
        maxLength={500}
        value={note}
        disabled={!editable}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => {
          if ((note.trim() || null) !== (plan.note || null)) onSave({ note: note.trim() || null });
        }}
        placeholder="More protein at breakfast this month."
      />
    </Field>
  );
}

/* ───────── Publish / Save as template ───────── */

function PublishModal({
  plan,
  open,
  onClose,
}: {
  plan: AdminDietPlan;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={plan.person?.name ?? 'Publish'}
      title="Publish this plan?"
      width={500}
    >
      <PublishForm plan={plan} onClose={onClose} />
    </Modal>
  );
}

function PublishForm({ plan, onClose }: { plan: AdminDietPlan; onClose: () => void }) {
  const publish = usePublishPlan(plan.id);
  const labels = useSlotLabels();
  const [note, setNote] = useState(plan.note ?? '');
  const [err, setErr] = useState<string | null>(null);
  const thin = MEAL_SLOTS.filter((s) => plan.options.filter((o) => o.mealSlot === s).length < 2);
  const live = plan.versions.find((v) => v.status === 'published' && v.id !== plan.id);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = PublishPlanRequest.safeParse({ note: note.trim() || null });
    if (!parsed.success) return setErr(zodErrors(parsed.error).note ?? 'Check the note.');
    publish.mutate(parsed.data.note, { onSuccess: onClose });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <ul className="m-0 flex list-none flex-col gap-1 rounded-[12px] bg-bg p-3 text-[13px]">
        <li>
          <b>{plan.person?.name ?? 'The member'}</b> gets a notification and sees it on their Diet
          tab
          {plan.effectiveFrom
            ? ` from ${fmtDate(plan.effectiveFrom, { weekday: true })}`
            : ' right away'}
          .
        </li>
        <li>
          {plural(plan.options.length, 'option')} across{' '}
          {MEAL_SLOTS.filter((s) => plan.options.some((o) => o.mealSlot === s)).length} slots.
        </li>
        {live && (
          <li>
            Replaces v{live.version} (published {fmtDate(live.publishedAt)}). They can still view it
            for 30 days.
          </li>
        )}
        {plan.aiGenerated && (
          <li className="flex items-center gap-1.5">
            <AiChip feature="diet.draft" /> Shown as AI-drafted, reviewed by you.
          </li>
        )}
      </ul>
      {(thin.length > 0 || plan.slotWarnings.length > 0) && (
        <div className="flex flex-col gap-1 rounded-[12px] bg-under-bg p-3 text-[12px] text-under-fg">
          {thin.length > 0 && (
            <span className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle aria-hidden className="h-3.5 w-3.5" /> Fewer than 2 options:{' '}
              {thin.map((s) => labels[s]).join(', ')}
            </span>
          )}
          {plan.slotWarnings.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
      )}
      <Field
        label="Note to the member"
        hint={`${note.length}/500 · Optional. Shown in the update banner.`}
        error={err}
      >
        <Textarea
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Swapped in more protein at breakfast. Shout if anything doesn’t work for you."
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" icon={<Send className="h-4 w-4" />} loading={publish.isPending}>
          Publish
        </Button>
      </div>
    </form>
  );
}

function SaveTemplateModal({
  plan,
  open,
  onClose,
}: {
  plan: AdminDietPlan;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} eyebrow="Templates" title="Save as template" width={440}>
      <SaveTemplateForm plan={plan} onClose={onClose} />
    </Modal>
  );
}

function SaveTemplateForm({ plan, onClose }: { plan: AdminDietPlan; onClose: () => void }) {
  const save = useSaveAsTemplate(plan.id);
  const [name, setName] = useState(`${plan.name} (template)`.slice(0, 80));
  const [err, setErr] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!v) return setErr('Give the template a name.');
    if (v.length > 80) return setErr('Keep it under 80 characters.');
    save.mutate(v, { onSuccess: onClose });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="m-0 text-[13px] leading-relaxed text-muted">
        Copies all {plural(plan.options.length, 'option')} into a reusable template. Nothing changes
        for {plan.person?.name ?? 'this member'}.
      </p>
      <Field label="Template name" required error={err}>
        <Input
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={save.isPending}
          icon={<LayoutTemplate className="h-4 w-4" />}
        >
          Save template
        </Button>
      </div>
    </form>
  );
}
