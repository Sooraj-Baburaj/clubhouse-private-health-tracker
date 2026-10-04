import { AlertTriangle, GitMerge, Trash2, Users } from 'lucide-react';
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
  Input,
  Inset,
  KeyValues,
  NumberInput,
  PersonCell,
  Pill,
  ToggleRow,
} from '@/ui';
import { zodErrors } from '../diets/shared';
import { portionRowsOf, PortionsEditor, toServingOptions, type PortionRow } from './PortionsEditor';

const NUTRIENTS = [
  { key: 'kcal', label: 'Energy (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Carbs (g)' },
  { key: 'fat', label: 'Fat (g)' },
  { key: 'fibre', label: 'Fibre (g)' },
] as const;

type NutrientDraft = Record<keyof Nutrients, number | null>;

export function SourcePill({ food }: { food: Pick<AdminFoodRow, 'source' | 'confidence'> & Partial<Pick<AdminFoodRow, 'recipe'>> }) {
  if (food.recipe) return <Pill tone="recipe">Recipe</Pill>;
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
        food
          ? food.recipe
            ? 'Member recipe'
            : food.team
              ? 'Team food'
              : food.owner
                ? 'Member food'
                : 'Database food'
          : 'Food'
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
  const [portions, setPortions] = useState<PortionRow[]>(() => portionRowsOf(food));
  // A recipe's numbers come from its ingredients; the member edits it in the app.
  const recipe = food.recipe;
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
    const built = recipe ? null : toServingOptions(portions);
    const body = {
      name: name.trim(),
      brand: brand.trim() || null,
      category: category.trim() || null,
      ...(built ? { per100g: n, servingOptions: built.options, defaultServing: built.defaultServing } : {}),
      tags,
      verified,
    };
    const parsed = AdminFoodUpdate.safeParse(body);
    const errs: Record<string, string> = { ...(built?.errors ?? {}) };
    if (!parsed.success) {
      Object.assign(errs, zodErrors(parsed.error));
      if (errs.name) errs.name = 'Enter a name.';
      for (const k of Object.keys(errs)) if (k.startsWith('per100g.')) errs[k] = 'Enter a number, 0 or more.';
    }
    if (!parsed.success || Object.keys(errs).length) {
      setErrors(errs);
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
          {recipe && <span className="ml-2 text-[12px] font-normal text-muted">From the ingredients</span>}
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
                readOnly={!!recipe}
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

      {recipe && <RecipeIngredients recipe={recipe} />}

      <PortionsEditor
        rows={portions}
        onChange={setPortions}
        errors={errors}
        readOnly={!!recipe}
        hint={
          recipe
            ? 'A recipe is logged by the serving; the member changes it in the app.'
            : food.source === 'member' && food.owner
              ? `These are the portions ${food.owner.name.split(' ')[0]} entered. Without a weight, members log by that unit only.`
              : 'Weight in g, or ml for volume units. ★ is the portion members see first.'
        }
      />

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

/** A member recipe's ingredients and what the batch makes, read-only (admin design: Foods drawer). */
function RecipeIngredients({ recipe }: { recipe: NonNullable<AdminFoodRow['recipe']> }) {
  const total = recipe.ingredients.reduce((t, g) => t + g.kcal, 0);
  return (
    <section aria-labelledby="ingr-h" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="ingr-h" className="h3">
          Ingredients
        </h3>
        <span className="text-[12px] text-muted">Read-only · edited by the member</span>
      </div>
      <div className="overflow-hidden rounded-md border border-hairline bg-white">
        <ul className="m-0 list-none p-0">
          {recipe.ingredients.map((g, i) => (
            <li key={`${g.name}-${i}`} className="grid gap-2.5 border-b border-hairline px-3.5 py-2 text-[13px] [grid-template-columns:minmax(0,1fr)_110px_60px_70px]">
              <span className="truncate font-medium">{g.name}</span>
              <span className="truncate">{g.portion}</span>
              <span className="font-mono text-[12px] text-muted">{fmtInt(g.grams)} g</span>
              <span className="text-right font-mono text-[12px]">{fmtInt(g.kcal)} kcal</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between bg-bg px-3.5 py-2 text-[13px] font-semibold">
          <span>
            {plural(recipe.ingredients.length, 'ingredient')} · makes {plural(recipe.makes, 'serving')}
          </span>
          <span className="font-mono text-[12px]">{fmtInt(total)} kcal total</span>
        </div>
      </div>
    </section>
  );
}
