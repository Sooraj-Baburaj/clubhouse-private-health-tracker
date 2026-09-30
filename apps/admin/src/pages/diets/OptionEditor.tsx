import {
  AlertTriangle,
  BadgeCheck,
  ImagePlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  UpsertOptionRequest,
  type AdminDietOption,
  type AdminDietPlan,
  type DayType,
  type FoodSearchResult,
  type MealSlot,
  type Nutrients,
} from '@clubhouse/contracts';
import { allBands, nutritionFor, SLOT_WEIGHTS, sumTotals } from '@clubhouse/domain';
import { useDebounced } from '@clubhouse/ui';
import {
  useDeleteOption,
  useFoodSearch,
  useSaveOption,
  useUploadFoodImage,
} from '@/features/diets';
import { cn } from '@/lib/cn';
import { fmtInt, fmtNum, fmtPct, plural } from '@/lib/format';
import {
  AiChip,
  Button,
  confirmAction,
  DrawerPanel,
  Field,
  FormGrid,
  IconButton,
  Input,
  Inset,
  NumberInput,
  Pill,
  Segmented,
  Select,
  Textarea,
} from '@/ui';
import {
  DAY_TYPE_OPTIONS,
  MacroLine,
  MEAL_SLOTS,
  NUTRIENT_KEYS,
  NutrientBand,
  scaleNutrients,
  useSlotLabels,
  useThresholds,
  zodErrors,
} from './shared';

const MAX_ITEMS = 12;

interface EditItem {
  key: string;
  foodId: string | null;
  name: string;
  servingLabel: string | null;
  /** Grams in one serving. Total grams = unitGrams × servings. */
  unitGrams: number;
  servings: number;
  per100g: Nutrients;
  aiEstimate: boolean;
  servingOptions: { label: string; grams: number }[];
}

let seq = 0;
const newKey = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

function fromOptionItem(i: AdminDietOption['items'][number]): EditItem {
  const servings = i.servings > 0 ? i.servings : 1;
  const grams = i.grams > 0 ? i.grams : 100;
  return {
    key: newKey(),
    foodId: i.foodId,
    name: i.name,
    servingLabel: i.servingLabel,
    unitGrams: grams / servings,
    servings: i.servings,
    per100g: scaleNutrients(i.nutrition, 100 / grams),
    aiEstimate: i.aiEstimate,
    servingOptions: [],
  };
}

function fromSearch(r: FoodSearchResult): EditItem {
  return {
    key: newKey(),
    foodId: r.id,
    name: r.brand ? `${r.name} (${r.brand})` : r.name,
    servingLabel: r.servingLabel,
    unitGrams: r.servingGrams,
    servings: 1,
    per100g: r.per100g,
    aiEstimate: r.aiEstimate,
    servingOptions: r.servingOptions,
  };
}

const totalGrams = (i: EditItem) => Math.round(i.unitGrams * i.servings * 10) / 10;
const itemNutrition = (i: EditItem): Nutrients => nutritionFor(i.per100g, totalGrams(i));

/** Parses `?option=` → existing option id or `new:<slot>`. */
export function parseOptionTarget(
  plan: AdminDietPlan | undefined,
  target: string | undefined,
): { slot: MealSlot; option: AdminDietOption | null } | null {
  if (!plan || !target) return null;
  if (target.startsWith('new:')) {
    const slot = target.slice(4) as MealSlot;
    return MEAL_SLOTS.includes(slot) ? { slot, option: null } : null;
  }
  const option = plan.options.find((o) => o.id === target);
  return option ? { slot: option.mealSlot, option } : null;
}

/** Option editor drawer (xl). Opened via `?option=<id>` or `?option=new:<slot>`. */
export function OptionEditor({
  plan,
  target,
  readOnly,
  onClose,
}: {
  plan: AdminDietPlan | undefined;
  target: string | undefined;
  readOnly: boolean;
  onClose: () => void;
}) {
  const parsed = parseOptionTarget(plan, target);
  const labels = useSlotLabels();
  const open = !!parsed && !!plan;
  return (
    <DrawerPanel
      open={open}
      onClose={onClose}
      size="xl"
      eyebrow={
        parsed
          ? `${labels[parsed.slot]} · ${parsed.option ? 'Edit option' : 'New option'}`
          : 'Option'
      }
      title={
        parsed?.option?.name ?? (parsed ? `New ${labels[parsed.slot].toLowerCase()} option` : '')
      }
      subtitle={
        readOnly
          ? 'Published plans are read-only. Start a new draft to change them.'
          : 'Totals update as you edit. Nothing is saved until you press Save.'
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div>
            {parsed?.option && !readOnly && plan && (
              <DeleteOptionButton plan={plan} option={parsed.option} onDone={onClose} />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button type="submit" form="option-editor-form">
                Save option
              </Button>
            )}
          </div>
        </div>
      }
    >
      {parsed && plan && (
        <EditorBody
          key={target}
          plan={plan}
          slot={parsed.slot}
          option={parsed.option}
          readOnly={readOnly}
          onSaved={onClose}
        />
      )}
    </DrawerPanel>
  );
}

function DeleteOptionButton({
  plan,
  option,
  onDone,
}: {
  plan: AdminDietPlan;
  option: AdminDietOption;
  onDone: () => void;
}) {
  const del = useDeleteOption(plan.id);
  const labels = useSlotLabels();
  const left = plan.options.filter((o) => o.mealSlot === option.mealSlot).length - 1;
  return (
    <Button
      variant="danger"
      size="md"
      icon={<Trash2 className="h-4 w-4" />}
      onClick={async () => {
        const ok = await confirmAction({
          title: 'Delete this option?',
          body: (
            <>
              <b className="text-ink">{option.name}</b> is removed from {labels[option.mealSlot]} in
              this {plan.isTemplate ? 'template' : 'draft'}.
            </>
          ),
          impact: [
            plural(option.items.length, 'item'),
            ...(left < 2
              ? [
                  `${labels[option.mealSlot]} would have ${plural(left, 'option')} left (aim for at least 2)`,
                ]
              : []),
            ...(option.timesLogged > 0
              ? [`Logged ${plural(option.timesLogged, 'time')} (past logs keep their numbers)`]
              : []),
            ...(option.favourites > 0 ? [`${plural(option.favourites, 'favourite')}`] : []),
          ],
          confirmLabel: 'Delete option',
          onConfirm: () => del.mutateAsync(option.id),
        });
        if (ok !== null) onDone();
      }}
    >
      Delete
    </Button>
  );
}

function EditorBody({
  plan,
  slot: initialSlot,
  option,
  readOnly,
  onSaved,
}: {
  plan: AdminDietPlan;
  slot: MealSlot;
  option: AdminDietOption | null;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const labels = useSlotLabels();
  const thresholds = useThresholds();
  const save = useSaveOption(plan.id);
  const upload = useUploadFoodImage();

  const [name, setName] = useState(option?.name ?? '');
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [dayType, setDayType] = useState<DayType>(option?.dayType ?? 'any');
  const [items, setItems] = useState<EditItem[]>(() => (option?.items ?? []).map(fromOptionItem));
  const [prepNote, setPrepNote] = useState(option?.prepNote ?? '');
  /** undefined = unchanged, null = removed, string = new upload. */
  const [imageId, setImageId] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(option?.imageUrl ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const localUrl = useRef<string | null>(null);
  useEffect(() => () => void (localUrl.current && URL.revokeObjectURL(localUrl.current)), []);

  const totals = useMemo(() => sumTotals(items.map(itemNutrition)), [items]);
  const slotShare = SLOT_WEIGHTS[slot];
  const slotTarget = plan.targets ? scaleNutrients(plan.targets, slotShare) : null;
  const bands = slotTarget ? allBands(totals, slotTarget, thresholds, true) : null;
  const aiItems = items.filter((i) => i.aiEstimate).length;

  const update = (key: string, patch: Partial<EditItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const add = (i: EditItem) => {
    setItems((list) => (list.length >= MAX_ITEMS ? list : [...list, i]));
    setErrors((e) => ({ ...e, items: '' }));
  };

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = URL.createObjectURL(file);
    const prev = preview;
    setPreview(localUrl.current);
    try {
      const res = await upload.mutateAsync(file);
      setImageId(res.id);
      if (res.thumbUrl || res.url) setPreview(res.thumbUrl ?? res.url);
    } catch {
      setPreview(prev);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const inSlot = plan.options.filter((o) => o.mealSlot === slot && o.id !== option?.id).length;
    const body = {
      mealSlot: slot,
      dayType,
      name: name.trim(),
      items: items.map((i) => ({
        foodId: i.foodId,
        name: i.name.trim(),
        grams: totalGrams(i),
        servings: i.servings,
        servingLabel: i.servingLabel,
        nutrition: itemNutrition(i),
        aiEstimate: i.aiEstimate,
      })),
      prepNote: prepNote.trim() || null,
      ...(imageId !== undefined ? { imageId } : {}),
      ...(option && option.mealSlot === slot ? {} : { sortOrder: Math.min(100, inSlot) }),
    };
    const parsedBody = UpsertOptionRequest.safeParse(body);
    if (!parsedBody.success) {
      const errs = zodErrors(parsedBody.error);
      if (errs.name) errs.name = 'Give the option a name.';
      if (errs.items)
        errs.items = items.length ? 'Up to 12 items per option.' : 'Add at least one item.';
      if (errs.prepNote) errs.prepNote = 'Keep the prep note under 300 characters.';
      for (const k of Object.keys(errs)) {
        if (/^items\.\d+\.grams$/.test(k)) errs[k] = 'Grams must be above 0 (max 3,000).';
        else if (/^items\.\d+\.name$/.test(k)) errs[k] = 'Name this item.';
        else if (/^items\.\d+\.servings$/.test(k)) errs[k] = 'Servings between 0 and 50.';
      }
      if (Object.keys(errs).some((k) => k.startsWith('items.')))
        errs._ = 'Some items need a fix (see the highlighted fields).';
      setErrors(errs);
      return;
    }
    if (!option && inSlot >= 5) {
      setErrors({ _: `${labels[slot]} already has 5 options. Remove one first.` });
      return;
    }
    setErrors({});
    save.mutate({ optionId: option?.id ?? null, body }, { onSuccess: onSaved });
  };

  return (
    <form id="option-editor-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
      <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <FormGrid min={220}>
          <Field label="Option name" required error={errors.name}>
            <Input
              data-autofocus
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Poha with peanuts + curd"
              invalid={!!errors.name}
            />
          </Field>
          <Field
            label="Meal slot"
            hint={
              option && slot !== option.mealSlot ? 'Moves this option to another slot.' : undefined
            }
          >
            <Select value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)}>
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field
          as="div"
          label="Day type"
          hint="Training/rest options only show on those days; “Any day” always shows."
        >
          <Segmented
            label="Day type"
            options={DAY_TYPE_OPTIONS}
            value={dayType}
            onChange={setDayType}
          />
        </Field>

        <section aria-labelledby="items-h" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="items-h" className="h3">
              Items
            </h3>
            <span className="text-[12px] text-muted">
              {items.length}/{MAX_ITEMS}
              {aiItems > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-ai-fg">
                  <AiChip feature="diet.draft" /> {plural(aiItems, 'estimate')} to check
                </span>
              )}
            </span>
          </div>
          {!readOnly && (
            <FoodSearch
              slot={slot}
              disabled={items.length >= MAX_ITEMS}
              onPick={(r) => add(fromSearch(r))}
            />
          )}
          {errors.items && (
            <p role="alert" className="m-0 text-[12px] font-semibold text-accent-dark">
              {errors.items}
            </p>
          )}
          {items.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">
              Search the food database above, or add a custom item below.
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {items.map((i, idx) => (
                <ItemRow
                  key={i.key}
                  item={i}
                  index={idx}
                  errors={errors}
                  readOnly={readOnly}
                  onChange={(p) => update(i.key, p)}
                  onRemove={() => setItems((l) => l.filter((x) => x.key !== i.key))}
                />
              ))}
            </ul>
          )}
          {!readOnly && <CustomItem disabled={items.length >= MAX_ITEMS} onAdd={add} />}
        </section>

        <Inset className="gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[13px] font-semibold">Option totals</span>
            <MacroLine n={totals} withFibre />
          </div>
          {bands && slotTarget ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {NUTRIENT_KEYS.map((k) => (
                  <NutrientBand key={k} nutrient={k} band={bands[k]} pct={bands[k].pct} />
                ))}
              </div>
              <span className="text-[12px] text-muted">
                Compared with a typical {labels[slot].toLowerCase()} share (
                {fmtPct(slotShare, true)} of the day’s targets: {fmtInt(slotTarget.kcal)} kcal, P{' '}
                {fmtNum(slotTarget.protein, 0)} g). This option is{' '}
                {plan.targets && plan.targets.kcal > 0
                  ? fmtPct(totals.kcal / plan.targets.kcal, true)
                  : '—'}{' '}
                of the daily calories.
              </span>
            </>
          ) : (
            <span className="text-[12px] text-muted">
              {plan.isTemplate
                ? 'Templates have no targets; portions are scaled to each member when assigned.'
                : 'This member has no targets yet, so there are no bands to compare against.'}
            </span>
          )}
        </Inset>

        <FormGrid min={260}>
          <Field
            label="Prep note"
            hint={`${prepNote.length}/300 · Optional tip shown under the option.`}
            error={errors.prepNote}
          >
            <Textarea
              rows={3}
              maxLength={300}
              value={prepNote}
              onChange={(e) => setPrepNote(e.target.value)}
              placeholder="Soak poha 2 min; add peanuts at the end."
            />
          </Field>
          <Field as="div" label="Photo" hint="Optional. JPEG, PNG, WebP or HEIC.">
            <div className="flex items-center gap-3">
              <div className="relative grid h-[84px] w-[84px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-border bg-bg">
                {preview ? (
                  <img
                    src={preview}
                    alt="Option photo preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImagePlus aria-hidden className="h-6 w-6 text-muted" />
                )}
                {upload.isPending && (
                  <span className="absolute inset-0 grid place-items-center bg-white/60">
                    <Loader2 aria-label="Uploading" className="h-5 w-5 animate-spin" />
                  </span>
                )}
              </div>
              {!readOnly && (
                <div className="flex flex-col gap-1.5">
                  <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[rgba(182,49,108,0.25)] bg-white px-3 text-[13px] font-semibold hover:border-accent focus-within:outline-2 focus-within:outline-accent">
                    <ImagePlus aria-hidden className="h-3.5 w-3.5" />
                    {preview ? 'Replace photo' : 'Upload photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        void onPhoto(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {preview && (
                    <Button
                      variant="link"
                      size="sm"
                      className="self-start text-[12px]"
                      onClick={() => {
                        setPreview(null);
                        setImageId(null);
                      }}
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Field>
        </FormGrid>
        {errors._ && (
          <p role="alert" className="m-0 text-[13px] font-semibold text-accent-dark">
            {errors._}
          </p>
        )}
        {save.isPending && <span className="text-[12px] text-muted">Saving…</span>}
      </fieldset>
    </form>
  );
}

function ItemRow({
  item,
  index,
  errors,
  readOnly,
  onChange,
  onRemove,
}: {
  item: EditItem;
  index: number;
  errors: Record<string, string>;
  readOnly: boolean;
  onChange: (p: Partial<EditItem>) => void;
  onRemove: () => void;
}) {
  const n = itemNutrition(item);
  const gramsErr = errors[`items.${index}.grams`];
  const nameErr = errors[`items.${index}.name`];
  const servErr = errors[`items.${index}.servings`];
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-[14px] border bg-white p-3',
        item.aiEstimate ? 'border-[rgba(182,49,108,0.25)]' : 'border-hairline',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[14px] font-semibold">
            {item.foodId ? (
              <span className="truncate">{item.name}</span>
            ) : (
              <Input
                aria-label="Item name"
                value={item.name}
                maxLength={120}
                onChange={(e) => onChange({ name: e.target.value })}
                className="h-8 text-[13px]"
                invalid={!!nameErr}
              />
            )}
            {item.aiEstimate && <AiChip feature="diet.draft" label="AI estimate" />}
            {!item.foodId && !item.aiEstimate && <Pill tone="muted">Custom</Pill>}
          </span>
          <MacroLine n={n} />
          {item.aiEstimate && (
            <span className="text-[12px] text-ai-fg">
              Not matched to the food database. Check the numbers or swap for a database food.
            </span>
          )}
        </div>
        {!readOnly && (
          <IconButton label={`Remove ${item.name || 'item'}`} size={32} onClick={onRemove}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(130px, 100%), 1fr))' }}
      >
        <Field label="Servings" error={servErr}>
          <NumberInput
            value={item.servings}
            min={0}
            max={50}
            step={0.25}
            onValue={(v) => onChange({ servings: v ?? 0 })}
            className="h-9"
            invalid={!!servErr}
          />
        </Field>
        {item.servingOptions.length > 1 ? (
          <Field label="Serving">
            <Select
              value={item.servingLabel ?? ''}
              onChange={(e) => {
                const so = item.servingOptions.find((o) => o.label === e.target.value);
                if (so) onChange({ servingLabel: so.label, unitGrams: so.grams });
              }}
            >
              {item.servingOptions.map((o) => (
                <option key={o.label} value={o.label}>
                  {o.label} ({fmtNum(o.grams, 0)} g)
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Serving label">
            <Input
              value={item.servingLabel ?? ''}
              maxLength={40}
              onChange={(e) => onChange({ servingLabel: e.target.value || null })}
              placeholder="1 bowl"
              className="h-9 text-[13px]"
            />
          </Field>
        )}
        <Field label="Total grams" error={gramsErr}>
          <NumberInput
            value={totalGrams(item)}
            min={0}
            max={3000}
            step={5}
            onValue={(v) => {
              const g = v ?? 0;
              onChange({
                unitGrams: item.servings > 0 ? g / item.servings : g,
                servings: item.servings > 0 ? item.servings : 1,
              });
            }}
            className="h-9"
            invalid={!!gramsErr}
          />
        </Field>
      </div>
    </li>
  );
}

/** Debounced member food search (AbortSignal via the query). */
function FoodSearch({
  slot,
  disabled,
  onPick,
}: {
  slot: MealSlot;
  disabled: boolean;
  onPick: (r: FoodSearchResult) => void;
}) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q, 250);
  const res = useFoodSearch(debounced, slot);
  const results = debounced.trim().length >= 2 ? (res.data?.results ?? []).slice(0, 8) : [];
  const pick = (r: FoodSearchResult) => {
    onPick(r);
    setQ('');
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          aria-label="Search foods to add"
          placeholder={
            disabled ? `${MAX_ITEMS} items max` : 'Search foods to add (e.g. paneer, idli)'
          }
          disabled={disabled}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const first = results[0];
              if (first) pick(first);
            } else if (e.key === 'Escape' && q) {
              e.stopPropagation();
              setQ('');
            }
          }}
          className="h-[42px] w-full rounded-full border border-border bg-white pl-10 pr-10 text-[14px] outline-none transition-colors placeholder:text-[#9b9ba4] focus:border-accent disabled:bg-bg [&::-webkit-search-cancel-button]:hidden"
        />
        {res.isFetching && (
          <Loader2
            aria-label="Searching"
            className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted"
          />
        )}
      </div>
      {debounced.trim().length >= 2 && (
        <div
          role="list"
          aria-label="Food search results"
          className="flex max-h-[280px] flex-col overflow-y-auto rounded-[14px] border border-border bg-white"
        >
          {res.isError ? (
            <span className="px-4 py-3 text-[13px] text-accent-dark">
              Search isn’t available right now. Add a custom item instead.
            </span>
          ) : results.length === 0 && !res.isFetching ? (
            <span className="px-4 py-3 text-[13px] text-muted">
              Nothing matches “{debounced}”. Try another spelling or add a custom item.
            </span>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                role="listitem"
                type="button"
                onClick={() => pick(r)}
                className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5 text-left last:border-b-0 hover:bg-bg focus-visible:bg-accent-tint/40 focus-visible:outline-none"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold">
                    <span className="truncate">{r.name}</span>
                    {r.brand && (
                      <span className="truncate text-[12px] font-normal text-muted">{r.brand}</span>
                    )}
                    {r.verified && (
                      <BadgeCheck
                        aria-label="Verified"
                        className="h-3.5 w-3.5 shrink-0 text-accent"
                      />
                    )}
                    {r.aiEstimate && <AiChip feature="food.photo" label="Estimate" />}
                  </span>
                  <span className="truncate text-[12px] text-muted">
                    {r.servingLabel} · {fmtNum(r.servingGrams, 0)} g · P{' '}
                    {fmtNum(r.perServing.protein, 0)} · C {fmtNum(r.perServing.carbs, 0)} · F{' '}
                    {fmtNum(r.perServing.fat, 0)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[12px] font-semibold">
                    {fmtInt(r.perServing.kcal)} kcal
                  </span>
                  <Plus aria-hidden className="h-4 w-4 text-accent" />
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Custom item: name + grams + nutrition for those grams. */
function CustomItem({ disabled, onAdd }: { disabled: boolean; onAdd: (i: EditItem) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [grams, setGrams] = useState<number | null>(100);
  const [n, setN] = useState<Record<(typeof NUTRIENT_KEYS)[number], number | null>>({
    kcal: null,
    protein: null,
    carbs: null,
    fat: null,
    fibre: null,
  });
  const [err, setErr] = useState<string | null>(null);
  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        icon={<Plus className="h-3.5 w-3.5" />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Add a custom item
      </Button>
    );
  const addIt = () => {
    if (!name.trim()) return setErr('Give the item a name.');
    if (!grams || grams <= 0) return setErr('Grams must be more than 0.');
    if (n.kcal == null) return setErr('Enter the calories for these grams.');
    const total: Nutrients = {
      kcal: n.kcal,
      protein: n.protein ?? 0,
      carbs: n.carbs ?? 0,
      fat: n.fat ?? 0,
      fibre: n.fibre ?? 0,
    };
    onAdd({
      key: newKey(),
      foodId: null,
      name: name.trim(),
      servingLabel: null,
      unitGrams: grams,
      servings: 1,
      per100g: scaleNutrients(total, 100 / grams),
      aiEstimate: false,
      servingOptions: [],
    });
    setName('');
    setGrams(100);
    setN({ kcal: null, protein: null, carbs: null, fat: null, fibre: null });
    setErr(null);
    setOpen(false);
  };
  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addIt();
    }
  };
  return (
    <Inset className="gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">Custom item</span>
        <Button variant="link" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <div
        className="grid gap-2"
        onKeyDown={onEnter}
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(96px, 100%), 1fr))' }}
      >
        <Field label="Name" className="col-span-2">
          <Input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="Homemade chutney"
            className="h-9 text-[13px]"
          />
        </Field>
        <Field label="Grams">
          <NumberInput value={grams} min={1} max={3000} onValue={setGrams} className="h-9" />
        </Field>
        {NUTRIENT_KEYS.map((k) => (
          <Field key={k} label={k === 'kcal' ? 'kcal' : `${k[0]!.toUpperCase()}${k.slice(1)} g`}>
            <NumberInput
              value={n[k]}
              min={0}
              onValue={(v) => setN((s) => ({ ...s, [k]: v }))}
              className="h-9"
            />
          </Field>
        ))}
      </div>
      {err && (
        <p
          role="alert"
          className="m-0 flex items-center gap-1.5 text-[12px] font-semibold text-accent-dark"
        >
          <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
          {err}
        </p>
      )}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        icon={<Plus className="h-3.5 w-3.5" />}
        onClick={addIt}
      >
        Add item
      </Button>
    </Inset>
  );
}
