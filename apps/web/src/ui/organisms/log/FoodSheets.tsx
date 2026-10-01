import { Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@clubhouse/client';
import { CreateFoodRequest, type FoodSearchResult, type Nutrients, type RecipeDto } from '@clubhouse/contracts';
import { toast } from '@clubhouse/ui';
import { useCreateFood, useMyFoods, ZERO } from '@/features/food';
import { fmt } from '@/features/format';
import { Button } from '@/ui/atoms/Button';
import { TextField } from '@/ui/atoms/Field';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { MemberSheet } from '@/ui/molecules/MemberSheet';
import { useListMotion } from '@/ui/organisms/today/motion';
import { SearchPanel, type SearchPanelProps } from './SearchPanel';

const numOrNull = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Quick add: calories required, macros optional (saved as a food-less item, source "quick_add"). */
export function QuickAddSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (name: string, n: Nutrients) => void }) {
  const [f, setF] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState<string | null>(null);
  // Fresh form each time it opens (adjust state during render on the open transition).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setF({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
      setError(null);
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const kcal = numOrNull(f.kcal);
    if (kcal == null || kcal <= 0 || kcal > 10000) return setError('Add the calories — anything from 1 to 10,000.');
    onAdd(f.name, { ...ZERO, kcal, protein: numOrNull(f.protein) ?? 0, carbs: numOrNull(f.carbs) ?? 0, fat: numOrNull(f.fat) ?? 0 });
    onClose();
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setError(null);
  };
  return (
    <MemberSheet open={open} onClose={onClose} title="Quick add">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField label="What was it? (optional)" value={f.name} onChange={set('name')} placeholder="Wedding buffet, office cake…" maxLength={120} />
        <TextField label="Calories" inputMode="decimal" value={f.kcal} onChange={set('kcal')} suffix={<span className="text-neutral-700">kcal</span>} error={error} autoFocus />
        <div className="grid grid-cols-3 gap-2">
          <TextField label="Protein" inputMode="decimal" value={f.protein} onChange={set('protein')} suffix={<span className="text-neutral-700">g</span>} />
          <TextField label="Carbs" inputMode="decimal" value={f.carbs} onChange={set('carbs')} suffix={<span className="text-neutral-700">g</span>} />
          <TextField label="Fat" inputMode="decimal" value={f.fat} onChange={set('fat')} suffix={<span className="text-neutral-700">g</span>} />
        </div>
        <Button type="submit" size="lg" block>
          Add it
        </Button>
      </form>
    </MemberSheet>
  );
}

const blankFood = (name: string) => ({ name, servingLabel: '1 serving', servingGrams: '', kcal: '', protein: '', carbs: '', fat: '', fibre: '' });

/** "Create a food": saved to My foods and added to this log. */
export function CreateFoodSheet({ open, onClose, onCreated, initialName = '' }: { open: boolean; onClose: () => void; onCreated: (f: FoodSearchResult) => void; initialName?: string }) {
  const create = useCreateFood();
  const [f, setF] = useState(() => blankFood(initialName));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Fresh form on open, or when the prefilled name changes while open (adjust state during render).
  const resetKey = open ? initialName : null;
  const [resetFor, setResetFor] = useState<string | null>(null);
  if (resetKey !== resetFor) {
    setResetFor(resetKey);
    if (open) {
      setF(blankFood(initialName));
      setErrors({});
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = CreateFoodRequest.safeParse({
      name: f.name,
      servingLabel: f.servingLabel,
      servingGrams: numOrNull(f.servingGrams) ?? 0,
      perServing: { kcal: numOrNull(f.kcal) ?? -1, protein: numOrNull(f.protein) ?? 0, carbs: numOrNull(f.carbs) ?? 0, fat: numOrNull(f.fat) ?? 0, fibre: numOrNull(f.fibre) ?? 0 },
    });
    if (!body.success) {
      const errs: Record<string, string> = {};
      for (const i of body.error.issues) {
        const key = String(i.path[i.path.length - 1] ?? 'name');
        errs[key] ??= key === 'kcal' ? 'Add the calories for one serving.' : key === 'servingGrams' ? 'How many grams is one serving?' : key === 'name' ? 'Give it a name (2+ letters).' : i.message;
      }
      setErrors(errs);
      return;
    }
    create.mutate(body.data, {
      onSuccess: (food) => {
        toast.success(`${food.name} saved to My foods`);
        onCreated(food);
        onClose();
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Couldn’t save that food.'),
    });
  };
  return (
    <MemberSheet open={open} onClose={onClose} title="Create a food">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField label="Name" value={f.name} onChange={set('name')} error={errors.name} maxLength={80} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Serving" value={f.servingLabel} onChange={set('servingLabel')} placeholder="1 bowl" error={errors.servingLabel} maxLength={40} />
          <TextField label="Weighs" inputMode="decimal" value={f.servingGrams} onChange={set('servingGrams')} suffix={<span className="text-neutral-700">g</span>} error={errors.servingGrams} />
        </div>
        <TextField label="Calories per serving" inputMode="decimal" value={f.kcal} onChange={set('kcal')} suffix={<span className="text-neutral-700">kcal</span>} error={errors.kcal} />
        <div className="grid grid-cols-4 gap-2">
          <TextField label="Protein" inputMode="decimal" value={f.protein} onChange={set('protein')} />
          <TextField label="Carbs" inputMode="decimal" value={f.carbs} onChange={set('carbs')} />
          <TextField label="Fat" inputMode="decimal" value={f.fat} onChange={set('fat')} />
          <TextField label="Fibre" inputMode="decimal" value={f.fibre} onChange={set('fibre')} />
        </div>
        <span className="px-2 text-[12px] text-neutral-700">Grams per serving. Your admin may check new foods before the whole team sees them.</span>
        <Button type="submit" size="lg" block loading={create.isPending}>
          Save and add
        </Button>
      </form>
    </MemberSheet>
  );
}

/** My foods & recipes, each added with one tap. */
export function MyFoodsSheet({ open, onClose, onAddFood, onAddRecipe, onCreate }: { open: boolean; onClose: () => void; onAddFood: (f: FoodSearchResult) => void; onAddRecipe: (r: RecipeDto) => void; onCreate: () => void }) {
  const mine = useMyFoods(open);
  const m = useListMotion(0.03);
  const foods = mine.data?.foods ?? [];
  const recipes = mine.data?.recipes ?? [];
  const Row = ({ name, sub, kcal, onAdd }: { name: string; sub: string; kcal: number; onAdd: () => void }) => (
    <motion.li variants={m.item} className="flex items-center gap-2.5 border-b border-divider py-2 last:border-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-bold">{name}</span>
        <span className="text-[12px] text-neutral-700">{sub}</span>
      </span>
      <span className="text-[14px] font-extrabold tabular">{fmt(kcal)}</span>
      <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={onAdd} aria-label={`Add ${name}`} className="grid h-11 w-11 place-items-center rounded-full bg-accent text-on-accent-fill">
        <Plus className="h-4 w-4" strokeWidth={2.75} aria-hidden />
      </motion.button>
    </motion.li>
  );
  return (
    <MemberSheet open={open} onClose={onClose} title="My foods & recipes">
      {mine.isPending ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={44} r={14} />
          ))}
        </div>
      ) : mine.isError ? (
        <EmptyState title="Couldn’t load your foods" body="Check your connection and try again." action={<Button variant="dark" onClick={() => void mine.refetch()}>Try again</Button>} />
      ) : !foods.length && !recipes.length ? (
        <EmptyState title="Nothing saved yet" body="Create a food once and it’s here every time." action={<Button onClick={onCreate}>Create a food</Button>} />
      ) : (
        <motion.ul variants={m.container} initial="hidden" animate="show" className="m-0 flex list-none flex-col p-0">
          {recipes.map((r) => (
            <Row key={r.id} name={r.name} sub={`Recipe · 1 of ${r.servings} servings`} kcal={r.perServing.kcal} onAdd={() => onAddRecipe(r)} />
          ))}
          {foods.map((f) => (
            <Row key={f.id} name={f.name} sub={f.servingLabel} kcal={f.perServing.kcal} onAdd={() => onAddFood(f)} />
          ))}
        </motion.ul>
      )}
    </MemberSheet>
  );
}

/** Search in a sheet, for "Add more" and "Swap" on the results screen. */
export function FoodSearchSheet({ open, title, onClose, ...panel }: { open: boolean; title: string; onClose: () => void } & Omit<SearchPanelProps, 'autoFocus'>) {
  return (
    <MemberSheet open={open} onClose={onClose} title={title}>
      <div className="min-h-[50dvh]">
        <SearchPanel {...panel} autoFocus />
      </div>
    </MemberSheet>
  );
}
