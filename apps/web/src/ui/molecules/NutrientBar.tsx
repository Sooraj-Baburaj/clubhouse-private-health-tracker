import type { BandDto } from '@clubhouse/contracts';
import { Bar } from '@clubhouse/ui';
import { BandIcon, bandFill } from '@/ui/atoms/Badges';
import { cn } from '@/lib/cn';

/**
 * APP-HOME-11: eaten ÷ target, coloured by band, with the band label and icon (never colour alone) and a
 * screen-reader name. `compact` renders the 1b macro tile.
 */
export function NutrientBar({ label, eaten, target, unit = 'g', band, pulseKey, compact, onClick }: { label: string; eaten: number; target: number; unit?: string; band: BandDto; pulseKey?: string | number; compact?: boolean; onClick?: () => void }) {
  const pct = target > 0 ? eaten / target : 0;
  const aria = `${label}: ${Math.round(eaten)} of ${Math.round(target)} ${unit}, ${Math.round(pct * 100)} percent, ${band.label}`;
  const Tag = onClick ? 'button' : 'div';
  if (compact) {
    return (
      <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={aria} className="flex flex-col gap-1 rounded-[22px] bg-surface px-2.5 py-3 text-left">
        <span className="text-[11px] font-bold text-neutral-700">{label}</span>
        <span className="font-heading text-[20px] leading-none tabular">
          {Math.round(eaten)}
          <span className="font-body text-[12px] text-neutral-700">/{Math.round(target)}</span>
        </span>
        <Bar value={pct} height={6} className="bg-neutral-300" fillStyle={{ background: bandFill(band.band) }} pulseKey={pulseKey} />
        <span className="flex items-center gap-1 text-[10px] font-bold text-neutral-700">
          <BandIcon icon={band.icon} className="h-3 w-3" />
          {band.label}
        </span>
      </Tag>
    );
  }
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-label={aria} className={cn('flex w-full flex-col gap-1.5 text-left', onClick && 'cursor-pointer')}>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-bold">{label}</span>
        <span className="flex items-center gap-1.5 text-neutral-700 tabular">
          <span className="flex items-center gap-1 text-[11px] font-bold">
            <BandIcon icon={band.icon} className="h-3 w-3" />
            {band.label}
          </span>
          · {Math.round(eaten)} / {Math.round(target)} {unit}
        </span>
      </div>
      <Bar value={pct} height={10} className="bg-neutral-300" fillStyle={{ background: bandFill(band.band) }} pulseKey={pulseKey} />
    </Tag>
  );
}
