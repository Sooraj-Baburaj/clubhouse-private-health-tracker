import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/ui/atoms/IconButton';

export function StackHeader({ title, onBack, right, subtitle }: { title: ReactNode; onBack: () => void; right?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <IconButton label="Back" onClick={onBack}>
        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.75} />
      </IconButton>
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-heading text-[24px] leading-tight">{title}</h1>
        {subtitle && <div className="truncate text-[12px] text-neutral-700">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
