import { useConsistency } from '@/features/progress';
import { Skeleton } from '@/ui/atoms/Skeleton';
import { ConsistencyCard } from '@/ui/organisms/consistency/ConsistencyCard';
import { ErrorCard, SectionHead } from './Kit';

export function ConsistencySection() {
  const q = useConsistency();
  return (
    <>
      <SectionHead eyebrow="Consistency" />
      {q.data ? <ConsistencyCard data={q.data} name="You" /> : q.isError ? <ErrorCard error={q.error} onRetry={() => void q.refetch()} what="your consistency" /> : <Skeleton h={190} r={30} />}
    </>
  );
}
