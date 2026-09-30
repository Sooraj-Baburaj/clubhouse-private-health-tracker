import { useNavigate, useRouter } from '@tanstack/react-router';
import { CheckCheck, Settings } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { fadeUp, stagger } from '@clubhouse/ui';
import { useInbox, useMarkInboxRead } from '@/features/inbox';
import { usePaneRef } from '@/app/pane';
import { Button } from '@/ui/atoms/Button';
import { IconButton } from '@/ui/atoms/IconButton';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { Spinner } from '@/ui/atoms/Spinner';
import { EmptyState } from '@/ui/molecules/EmptyState';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { InboxRow } from '@/ui/organisms/inbox/InboxRow';
import { PushCard } from '@/ui/organisms/inbox/PushCard';
import { ErrorCard } from '@/ui/organisms/progress/Kit';

/** /inbox — in-app notifications with deep links (plan §8.13). */
export function InboxPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const q = useInbox();
  const markRead = useMarkInboxRead();
  const pane = usePaneRef();
  const more = useRef<HTMLDivElement>(null);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = items.filter((n) => !n.readAt).length;
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/', search: {} }));

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const t = more.current;
    if (!t || !hasNextPage || isFetchingNextPage) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && void fetchNextPage(), { root: pane?.current ?? null, rootMargin: '200px' });
    io.observe(t);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, pane]);

  const open = (id: string, url: string, isUnread: boolean) => {
    if (isUnread) markRead.mutate([id]);
    if (url) router.history.push(url);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader
          title="Inbox"
          subtitle={unread ? `${unread} unread` : 'All caught up'}
          onBack={back}
          right={
            <IconButton label="Notification settings" onClick={() => void navigate({ to: '/settings/$section', params: { section: 'notifications' } })}>
              <Settings className="h-[18px] w-[18px]" strokeWidth={2.75} />
            </IconButton>
          }
        />
        <PushCard />
        {unread > 0 && (
          <Button variant="ghost" size="sm" className="self-end" icon={<CheckCheck className="h-4 w-4" strokeWidth={2.75} />} onClick={() => markRead.mutate('all')}>
            Mark all read
          </Button>
        )}
        {!q.data ? (
          q.isError ? (
            <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your inbox" />
          ) : (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={68} r={24} />
              ))}
            </div>
          )
        ) : !items.length ? (
          <EmptyState illustration="bell" title="Nothing here yet" body="Reminders, mentions and milestones land here. Go log something and the crew will notice." />
        ) : (
          <motion.div variants={stagger(0.03)} initial="hidden" animate="show" className="flex flex-col rounded-[28px] bg-surface py-1">
            <AnimatePresence initial={false}>
              {items.map((n) => (
                <motion.div key={n.id} variants={fadeUp} layout>
                  <InboxRow n={n} onOpen={() => open(n.id, n.url, !n.readAt)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
        <div ref={more} className="flex min-h-8 justify-center">
          {q.isFetchingNextPage ? (
            <Spinner className="h-5 w-5 text-neutral-600" />
          ) : q.hasNextPage ? (
            <Button variant="secondary" size="sm" onClick={() => void q.fetchNextPage()}>
              Load more
            </Button>
          ) : null}
        </div>
      </div>
    </MotionConfig>
  );
}
