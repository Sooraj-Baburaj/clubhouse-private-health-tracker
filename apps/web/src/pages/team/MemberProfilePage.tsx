import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';
import { useMemberProfile } from '@/features/team';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { ProfileSections } from '@/ui/organisms/team/MemberProfile';

/** /member/$memberId — a teammate's profile (or your own): streaks, records, badges, the board and habits. */
export function MemberProfilePage() {
  const { memberId = '' } = useParams({ strict: false }) as { memberId?: string };
  const router = useRouter();
  const navigate = useNavigate();
  const q = useMemberProfile(memberId);
  const back = () => (router.history.canGoBack() ? router.history.back() : void navigate({ to: '/team' }));
  const d = q.data;
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader onBack={back} title="" />
        {d ? (
          <ProfileSections p={d} onOpenDay={() => void navigate({ to: '/team/$memberId', params: { memberId }, search: {} })} />
        ) : q.isError ? (
          <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="their profile" />
        ) : (
          <div className="flex flex-col items-center gap-3" aria-busy aria-label="Loading profile">
            <Skeleton h={84} w={84} r={999} />
            <Skeleton h={32} w="60%" r={12} />
            <Skeleton h={120} r={32} />
            <Skeleton h={110} r={24} />
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
