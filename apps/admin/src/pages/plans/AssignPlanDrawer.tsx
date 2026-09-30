import { useState } from 'react';
import type { AdminPlanRow } from '@clubhouse/contracts';
import { AssignPlanTemplateRequest } from '@clubhouse/contracts';
import { useActivityTypes, useMembers } from '@/features/directory';
import { useAssignPlan } from '@/features/plans';
import { Button, confirmAction, DrawerPanel, Field, MemberMultiSelect, Textarea } from '@/ui';
import {
  blankItem,
  itemErrorsFrom,
  itemSummary,
  PlanItemsEditor,
  toInput,
  type ItemDraft,
  type ItemErrors,
} from './PlanItemsEditor';

/** "Assign plan": one set of items for many members at once (replaces their current plans). */
export function AssignPlanDrawer({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: AdminPlanRow[] | undefined;
}) {
  const members = useMembers();
  const types = useActivityTypes();
  const assign = useAssignPlan();
  const [userIds, setUserIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemDraft[]>(() => [blankItem()]);
  const [errors, setErrors] = useState<ItemErrors>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUserIds([]);
      setNote('');
      setItems([blankItem()]);
      setErrors({});
      setOther({});
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = AssignPlanTemplateRequest.safeParse({
      userIds,
      items: items.map(toInput),
      note: note.trim() || null,
    });
    if (!parsed.success) {
      const r = itemErrorsFrom(parsed.error.issues);
      setErrors(r.items);
      setOther({
        ...r.other,
        ...(r.other.userIds ? { userIds: 'Pick at least one member' } : {}),
        ...(r.other.note ? { note: 'Keep the note under 300 characters' } : {}),
      });
      return;
    }
    setErrors({});
    setOther({});
    const names = userIds.map(
      (id) => members.data?.find((m) => m.id === id)?.person.name ?? 'Member',
    );
    const withPlan = (rows ?? []).filter(
      (r) => userIds.includes(r.userId) && r.items.length > 0,
    ).length;
    const typeName = (id: string) => types.data?.find((t) => t.id === id)?.name ?? 'Activity';
    const n = userIds.length;
    const ok = await confirmAction({
      title: 'Assign this plan?',
      eyebrow: 'Activity plans',
      body: `Replaces the current plan for ${n} ${n === 1 ? 'member' : 'members'}. Days they already picked for matching activities may need picking again.`,
      impact: [
        `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}`,
        withPlan
          ? `${withPlan} of them already have a plan that will be replaced`
          : 'None of them has a plan today',
        items
          .map((i) =>
            itemSummary({
              typeName: typeName(i.typeId),
              perWeek: i.cadence === 'week' ? i.count : null,
              perMonth: i.cadence === 'month' ? i.count : null,
            }),
          )
          .join(' · '),
      ],
      confirmLabel: `Assign to ${n}`,
      tone: withPlan ? 'danger' : 'default',
      onConfirm: () => assign.mutateAsync(parsed.data),
    });
    if (ok !== null) onClose();
  };

  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Activity plans"
      title="Assign plan"
      subtitle="Set the same expected activities for several members. Each member still picks their own days."
      footer={
        <>
          <span className="text-[12px] text-muted">
            {userIds.length ? `${userIds.length} selected` : 'No members selected'}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="assign-plan-form" loading={assign.isPending}>
              Assign plan
            </Button>
          </div>
        </>
      }
    >
      <form id="assign-plan-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field as="div" label="Members" required error={other.userIds}>
          <MemberMultiSelect label="Members to assign" value={userIds} onChange={setUserIds} />
        </Field>
        <Field label="Note to the members" hint={`Optional. ${note.length}/300`} error={other.note}>
          <Textarea
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. October block: three sessions a week, any mix."
          />
        </Field>
        <Field as="div" label="Expected activities" required error={other.items}>
          <PlanItemsEditor
            items={items}
            onChange={setItems}
            errors={errors}
            disabled={assign.isPending}
          />
        </Field>
      </form>
    </DrawerPanel>
  );
}
