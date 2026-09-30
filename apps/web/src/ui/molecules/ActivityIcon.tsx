import { Activity, Bike, CircleDot, Dumbbell, Feather, Flame, Flower2, Footprints, Mountain, Music, TrendingUp, Trophy, Waves, Zap, type LucideIcon } from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  footprints: Footprints,
  bike: Bike,
  waves: Waves,
  dumbbell: Dumbbell,
  flower: Flower2,
  mountain: Mountain,
  trophy: Trophy,
  feather: Feather,
  music: Music,
  zap: Zap,
  'trending-up': TrendingUp,
  flame: Flame,
  'circle-dot': CircleDot,
  activity: Activity,
};

export function ActivityIcon({ icon, className = 'h-5 w-5' }: { icon: string; className?: string }) {
  const I = MAP[icon] ?? Activity;
  return <I className={className} strokeWidth={2.75} aria-hidden />;
}
