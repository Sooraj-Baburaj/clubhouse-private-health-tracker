import { useNavigate, useRouter, useSearch } from '@tanstack/react-router';
import { AnimatePresence } from 'motion/react';
import type { z } from 'zod';
import type { FoodLogDto } from '@clubhouse/contracts';
import type { logFoodSearch } from '@/app/routes';
import { useFoodLogById } from '@/features/food';
import { useMeData, type Me } from '@/features/me';
import { Button } from '@/ui/atoms/Button';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { CreateFoodView } from '@/ui/organisms/food/CreateFoodView';
import { DishView } from '@/ui/organisms/food/DishView';
import { FoodDetailView } from '@/ui/organisms/food/FoodDetailView';
import { MealScreen } from '@/ui/organisms/meal/MealScreen';
import { ReadView } from '@/ui/organisms/meal/ReadView';
import { SnapCamera } from '@/ui/organisms/meal/SnapCamera';
import { MealFlowContext } from './mealFlow';
import { useMealController } from './useMealController';

type Search = z.infer<typeof logFoodSearch>;

/**
 * Logging a meal (APP-HOME-20…27, design 2c/6/7/8): the Meal screen, with Snap, the AI read, Food, Dish and Create a
 * food as full-screen views over it. Editing loads the saved log first.
 */
export function LogFoodPage() {
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const search = useSearch({ from: '/shell/log/food' });
  const editing = useFoodLogById(search.edit);
  const back = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: '/', search: {} }));

  if (search.edit && editing.isPending) {
    return (
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2" aria-busy aria-label="Loading your meal">
        <StackHeader title="Meal" onBack={back} />
        <Skeleton h={40} r={999} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} h={64} r={24} />
        ))}
      </div>
    );
  }
  if (search.edit && (editing.isError || editing.data?.deleted)) {
    return (
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader title="Meal" onBack={back} />
        <EmptyState
          title="Couldn’t open that meal"
          body={editing.data?.deleted ? 'It was deleted.' : 'It may have been deleted, or you’re offline.'}
          action={
            editing.data?.deleted ? undefined : (
              <Button variant="dark" onClick={() => void editing.refetch()}>
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }
  return <MealFlowHost key={search.edit ?? 'new'} me={me} search={search} log={editing.data ?? null} />;
}

function MealFlowHost({ me, search, log }: { me: Me; search: Search; log: FoodLogDto | null }) {
  const flow = useMealController(me, search, log);
  if (!flow) return null;
  const { view } = flow;
  return (
    <MealFlowContext.Provider value={flow}>
      <div inert={!!view || undefined}>
        <MealScreen initialQuery={search.q} autoFocus={search.mode === 'search' && !log && !search.view} />
      </div>
      <AnimatePresence>
        {view === 'snap' && (
          <SnapCamera
            key="snap"
            photoAi={flow.photoAi}
            onPhoto={(b) => void flow.takePhoto(b)}
            onClose={flow.closeCamera}
            onSearch={() => {
              flow.closeView();
              flow.focusSearch();
            }}
          />
        )}
        {view === 'read' && <ReadView key="read" />}
        {view === 'item' && <FoodDetailView key={`item:${search.row ?? search.food ?? ''}`} />}
        {view === 'dish' && <DishView key="dish" />}
        {view === 'create' && <CreateFoodView key={`create:${search.food ?? ''}:${search.name ?? ''}`} />}
      </AnimatePresence>
    </MealFlowContext.Provider>
  );
}
