import { useNavigate, useParams, useRouter, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { addDays } from '@clubhouse/domain';
import { dateLabel } from '@/features/format';
import { useMeData } from '@/features/me';
import { useMemberDay } from '@/features/team';
import { Avatar } from '@/ui/atoms/Avatar';
import { IconButton } from '@/ui/atoms/IconButton';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { StackHeader } from '@/ui/molecules/StackHeader';
import { ErrorCard } from '@/ui/organisms/progress/Kit';
import { MemberDayFull, MemberDaySummary } from '@/ui/organisms/team/MemberDay';

/** /team/$memberId — a teammate's day: summary for everyone, full logs only when they share them. */
export function MemberDayPage() {
  const { memberId = '' } = useParams({ strict: false }) as { memberId?: string };
  const search = useSearch({ strict: false }) as { date?: string };
  const me = useMeData();
  const router = useRouter();
  const navigate = useNavigate();
  const date = search.date && search.date < me.today ? search.date : undefined;
  const q = useMemberDay(memberId, date);
  const day = date ?? me.today;
  const back = () => (window.history.length > 1 ? router.history.back() : void navigate({ to: '/progress', search: {} }));
  const go = (n: number) => {
    const next = addDays(day, n);
    void navigate({ to: '/team/$memberId', params: { memberId }, search: next >= me.today ? {} : { date: next }, replace: true });
  };
  const d = q.data;
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex flex-col gap-3.5 px-5 pb-10 pt-2">
        <StackHeader
          onBack={back}
          title={d ? d.person.name : ' '}
          subtitle={day === me.today ? 'Today' : dateLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}
          right={
            d ? (
              <button type="button" onClick={() => void navigate({ to: '/member/$memberId', params: { memberId } })} aria-label={`${d.person.name}’s profile`} className="rounded-full border-0 bg-transparent p-0">
                <Avatar name={d.person.name} initials={d.person.initials} url={d.person.avatarUrl} size={44} />
              </button>
            ) : undefined
          }
        />
        <div className="flex items-center justify-between rounded-full bg-surface p-1">
          <IconButton label="Previous day" tone="ghost" onClick={() => go(-1)}>
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </IconButton>
          <span className="text-[14px] font-bold">{day === me.today ? 'Today' : dateLabel(day)}</span>
          <IconButton label="Next day" tone="ghost" onClick={() => go(1)} disabled={day >= me.today}>
            <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </IconButton>
        </div>
        {!d ? (
          q.isError ? (
            <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="their day" />
          ) : (
            <>
              <Skeleton h={170} r={32} />
              <Skeleton h={80} r={24} />
              <Skeleton h={140} r={28} />
            </>
          )
        ) : (
          <>
            <MemberDaySummary d={d} />
            <MemberDayFull d={d} />
          </>
        )}
      </div>
    </MotionConfig>
  );
}
