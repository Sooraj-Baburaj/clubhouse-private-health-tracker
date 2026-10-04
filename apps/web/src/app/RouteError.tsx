import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useOnline } from '@clubhouse/ui';
import { Button } from '@/ui/atoms/Button';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';

/**
 * A stack screen that couldn't open — most often its code didn't load (offline before it was cached, or a new version
 * went live meanwhile). Retry loads it again; a reload picks up the new version.
 */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  const online = useOnline();
  const back = () => (router.history.canGoBack() ? router.history.back() : void router.navigate({ to: '/', search: {} }));
  return (
    <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
      <StackHeader title="" onBack={back} />
      <EmptyState
        title="Couldn’t open this screen"
        body={online ? 'Try again — if it keeps happening, reload the app.' : 'You’re offline and it isn’t saved on your phone yet. It opens once you’re back online.'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="dark"
              onClick={() => {
                reset();
                void router.invalidate();
              }}
            >
              Try again
            </Button>
            {online && (
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Reload
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
