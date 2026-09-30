import { Skeleton } from '@/ui/atoms/Skeleton';

/** Loading shape of Today 1b (hero number, bar, four tiles, cards, rows). */
export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-[18px]" aria-busy="true" aria-label="Loading your day">
      <div className="flex flex-col gap-2">
        <Skeleton h={86} w="62%" r={24} />
        <Skeleton h={20} w="70%" />
      </div>
      <Skeleton h={22} r={999} />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={86} r={22} />
        ))}
      </div>
      <Skeleton h={132} r={32} />
      <Skeleton h={96} r={28} />
      <div className="flex gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} h={46} w={46} r={999} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} h={40} r={14} />
      ))}
    </div>
  );
}
