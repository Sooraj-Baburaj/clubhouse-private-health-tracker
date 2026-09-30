import { AlertTriangle, GitMerge, Plus, Trash2, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AdminFoodUpdate,
  FOOD_TAGS,
  type AdminFoodRow,
  type FoodTag,
  type Nutrients,
} from '@clubhouse/contracts';
import { energyMismatch } from '@clubhouse/domain';
import { useDeleteFood, usePromoteFood, useUpdateFood } from '@/features/foods';
import { fmtDateTime, fmtInt, fmtPct, humanize, plural } from '@/lib/format';
import {
  AiChip,
  Button,
  ChipToggleGroup,
  confirmAction,
  DrawerPanel,
  Field,
  FormGrid,
  IconButton,
  Input,
  Inset,
  KeyValues,
  NumberInput,
  PersonCell,
  Pill,
  Select,
  ToggleRow,
} from '@/ui';
import { zodErrors } from '../diets/shared';

const NUTRIENTS = [
  { key: 'kcal', label: 'Energy (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'fibre', label: 'Fibre (g)' },
] as const;

type NutrientDraft = Record<keyof Nutrients, number | null>;

export function SourcePill({ food }: { food: Pick<AdminFoodRow, 'source' | 'confidence'> }) {
  if (food.source === 'ai')
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={
          food.confidence != null
            ? `AI estimate · confidence ${fmtPct(food.confidence, true)}`
            : 'AI estimate'
        }
      >
        <AiChip feature="food.photo" />
        <span className="text-[12px] font-semibold text-ai-fg">Estimate</span>
      </span>
    );
  const label = food.source === 'usda' ? 'USDA' : humanize(food.source);
  return (
    <Pill tone={food.source === 'member' ? 'under' : food.source === 'admin' ? 'accent' : 'muted'}>
      {label}
    </Pill>
  );
}

/** Food edit drawer: details, nutrition per 100 g, servings, tags, verified; promote / merge / delete. */
export function FoodDrawer({
  food,
  onClose,
  onMerge,
}: {
  food: AdminFoodRow | null;
  onClose: () => void;
  onMerge: (f: AdminFoodRow) => void;
}) {
  return (
    <DrawerPanel
      open={!!food}
      onClose={onClose}
      size="lg"
      eyebrow={
        food ? (food.team ? 'Team food' : food.owner ? 'Member food' : 'Database food') : 'Food'
      }
      title={food?.name}
      subtitle={food?.brand ?? undefined}
      footer={
        food && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <DeleteFoodButton food={food} onDone={onClose} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button type="submit" form="food-form">
                Save changes
              </Button>
            </div>
          </div>
        )
      }
    >
      {food && <FoodForm key={food.id} food={food} onMerge={() => onMerge(food)} />}
    </DrawerPanel>
  );
}

function DeleteFoodButton({ food, onDone }: { food: AdminFoodRow; onDone: () => void }) {
  const del = useDeleteFood();
  return (
    <Button
      variant="danger"
      icon={<Trash2 className="h-4 w-4" />}
      onClick={async () => {
        const ok = await confirmAction({
          title: `Delete “${food.name}”?`,
          body:
            food.uses > 0
              ? 'It disappears from search and favourites. If it’s a duplicate, merging keeps the history tidier.'
              : 'It disappears from search. Nobody has logged it yet.',
          impact: [
            food.uses > 0
              ? `Used ${plural(food.uses, 'time')} (past logs keep their saved numbers)`
              : 'Not used in any log',
            ...(food.team ? ['Team food: everyone loses it from search'] : []),
            ...(food.owner ? [`Created by ${food.owner.name}`] : []),
          ],
          confirmLabel: 'Delete food',
          onConfirm: () => del.mutateAsync(food.id),
        });
        if (ok !== null) onDone();
      }}
    >
      Delete
    </Button>
  );
}

function FoodForm({ food, onMerge }: { food: AdminFoodRow; onMerge: () => void }) {
  const update = useUpdateFood();
  const promote = usePromoteFood();
  const [name, setName] = useState(food.name);
  const [brand, setBrand] = useState(food.brand ?? '');
  const [category, setCategory] = useState(food.category ?? '');
  const [n, setN] = useState<NutrientDraft>({ ...food.per100g });
  const [servings, setServings] = useState(() =>
    food.servingOptions.map((s) => ({ ...s, grams: s.grams as number | null })),
  );
  const [defaultServing, setDefaultServing] = useState(food.defaultServing ?? '');
  const [tags, setTags] = useState<FoodTag[]>(() =>
    food.tags.filter((t): t is FoodTag => (FOOD_TAGS as readonly string[]).includes(t)),
  );
  const [verified, setVerified] = useState(food.verified);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const complete = NUTRIENTS.every((x) => n[x.key] != null);
  const mismatch = useMemo(() => (complete ? energyMismatch(n as Nutrients) : 0), [n, complete]);
  const computedKcal = complete
    ? Math.round(4 * n.protein! + 4 * Math.max(0, n.carbs! - n.fibre!) + 2 * n.fibre! + 9 * n.fat!)
    : null;
  const unknownTags = food.tags.filter((t) => !(FOOD_TAGS as readonly string[]).includes(t));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      name: name.trim(),
      brand: brand.trim() || null,
      category: category.trim() || null,
      per100g: n,
      servingOptions: servings.map((s) => ({ label: s.label.trim(), grams: s.grams })),
      defaultServing: defaultServing || null,
      tags,
      verified,
    };
    const parsed = AdminFoodUpdate.safeParse(body);
    if (!parsed.success) {
      const errs = zodErrors(parsed.error);
      if (errs.name) errs.name = 'Enter a name.';
      for (const k of Object.keys(errs)) {
        if (k.startsWith('per100g.')) errs[k] = 'Enter a number, 0 or more.';
        else if (/^servingOptions\.\d+\.label$/.test(k)) errs[k] = 'Add a label.';
        else if (/^servingOptions\.\d+\.grams$/.test(k)) errs[k] = 'Grams above 0.';
      }
      setErrors(errs);
      return;
    }
    if (defaultServing && !servings.some((s) => s.label.trim() === defaultServing)) {
      setErrors({ defaultServing: 'Pick one of the serving options.' });
      return;
    }
    setErrors({});
    update.mutate({ id: food.id, body: parsed.data });
  };

  return (
    <form id="food-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Inset>
        <KeyValues
          items={[
            ['Source', <SourcePill food={food} />],
            ['Owner', food.owner ? <PersonCell person={food.owner} size={22} /> : 'Database'],
            [
              'Visibility',
              food.team
                ? 'Whole team'
                : food.owner
                  ? `Only ${food.owner.name}`
                  : 'Everyone (global)',
            ],
            ['Uses', `${fmtInt(food.uses)} logs`],
            ['Added', fmtDateTime(food.createdAt)],
            ...(food.confidence != null
              ? ([['AI confidence', fmtPct(food.confidence, true)]] as [
                  React.ReactNode,
                  React.ReactNode,
                ][])
              : []),
          ]}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {!food.team && (
            <Button
              size="sm"
              variant="outline"
              icon={<Users className="h-3.5 w-3.5" />}
              loading={promote.isPending}
              onClick={() => promote.mutate(food.id)}
            >
              Promote to team
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            icon={<GitMerge className="h-3.5 w-3.5" />}
            onClick={onMerge}
          >
            Merge into another food…
          </Button>
        </div>
      </Inset>

      <FormGrid min={200}>
        <Field label="Name" required error={errors.name}>
          <Input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            invalid={!!errors.name}
          />
        </Field>
        <Field label="Brand" error={errors.brand}>
          <Input
            value={brand}
            maxLength={60}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Category" error={errors.category}>
          <Input
            value={category}
            maxLength={40}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. legume, beverage"
          />
        </Field>
      </FormGrid>

      <section aria-labelledby="n100-h" className="flex flex-col gap-3">
        <h3 id="n100-h" className="h3">
          Nutrition per 100 g
        </h3>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(96px, 100%), 1fr))' }}
        >
          {NUTRIENTS.map((x) => (
            <Field key={x.key} label={x.label} error={errors[`per100g.${x.key}`]}>
              <NumberInput
                value={n[x.key]}
                min={0}
                step={0.1}
                onValue={(v) => setN((s) => ({ ...s, [x.key]: v }))}
                invalid={!!errors[`per100g.${x.key}`]}
              />
            </Field>
          ))}
        </div>
        {complete && mismatch > 0.15 && (
          <p
            role="status"
            className="m-0 flex items-start gap-1.5 rounded-[10px] bg-under-bg px-3 py-2 text-[12px] text-under-fg"
          >
            <AlertTriangle aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0" />
            <span>
              Energy doesn’t add up: the macros give about{' '}
              <b className="font-mono">{fmtInt(computedKcal)} kcal</b>, but {fmtInt(n.kcal)} kcal is
              entered ({fmtPct(mismatch, true)} off). Worth a double-check.
            </span>
          </p>
        )}
      </section>

      <section aria-labelledby="serv-h" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="serv-h" className="h3">
            Serving options
          </h3>
          <span className="text-[12px] text-muted">{servings.length}/12</span>
        </div>
        {errors.servingOptions && (
          <p role="alert" className="m-0 text-[12px] font-semibold text-accent-dark">
            {servings.length === 0 ? 'Add at least one serving.' : errors.servingOptions}
          </p>
        )}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {servings.map((s, i) => (
            <li
              key={i}
              className="grid items-end gap-2"
              style={{ gridTemplateColumns: 'minmax(0,1fr) 110px 32px' }}
            >
              <Field
                label={i === 0 ? 'Label' : <span className="sr-only">Label</span>}
                error={errors[`servingOptions.${i}.label`]}
              >
                <Input
                  value={s.label}
                  maxLength={40}
                  placeholder="1 katori"
                  onChange={(e) =>
                    setServings((l) =>
                      l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                  className="h-9 text-[13px]"
                />
              </Field>
              <Field
                label={i === 0 ? 'Grams' : <span className="sr-only">Grams</span>}
                error={errors[`servingOptions.${i}.grams`]}
              >
                <NumberInput
                  value={s.grams}
                  min={1}
                  max={5000}
                  onValue={(v) =>
                    setServings((l) => l.map((x, j) => (j === i ? { ...x, grams: v } : x)))
                  }
                  className="h-9"
                />
              </Field>
              <IconButton
                label={`Remove serving ${s.label || i + 1}`}
                size={32}
                className="mb-[2px]"
                onClick={() => setServings((l) => l.filter((_, j) => j !== i))}
                disabled={servings.length <= 1}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-3">
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus className="h-3.5 w-3.5" />}
            disabled={servings.length >= 12}
            onClick={() => setServings((l) => [...l, { label: '', grams: null }])}
          >
            Add serving
          </Button>
          <Field
            label="Default serving"
            error={errors.defaultServing}
            className="min-w-[200px] flex-1"
          >
            <Select value={defaultServing} onChange={(e) => setDefaultServing(e.target.value)}>
              <option value="">None (100 g)</option>
              {servings
                .filter((s) => s.label.trim())
                .map((s, i) => (
                  <option key={`${s.label}-${i}`} value={s.label.trim()}>
                    {s.label.trim()}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </section>

      <Field
        as="div"
        label="Tags"
        hint={`${tags.length}/10 · Tags drive meme triggers and search.`}
        error={errors.tags}
      >
        <ChipToggleGroup
          label="Food tags"
          options={FOOD_TAGS.map((t) => ({ value: t, label: humanize(t) }))}
          value={tags}
          onChange={(v) => setTags(v.slice(0, 10))}
        />
        {unknownTags.length > 0 && (
          <span className="text-[12px] text-muted">
            Other tags on this food (kept only if the server keeps them): {unknownTags.join(', ')}
          </span>
        )}
      </Field>

      <ToggleRow
        label="Verified"
        hint="Verified foods rank higher in search and show a check mark."
        checked={verified}
        onChange={setVerified}
        className="border-t border-hairline"
      />
      {update.isPending && <span className="text-[12px] text-muted">Saving…</span>}
    </form>
  );
}
