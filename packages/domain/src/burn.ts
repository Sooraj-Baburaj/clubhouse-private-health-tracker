import type { GymFocus, Intensity } from '@clubhouse/contracts';
import { GYM_FOCUS_MET, INTENSITY_MULTIPLIER } from './constants';

/** A pace band: when speed (km/h) is at least `minKmh`, use `met`. Bands are sorted ascending by minKmh. */
export interface MetBand {
  minKmh: number;
  met: number;
}

export interface ActivityTypeDef {
  key: string;
  met: number;
  metBands?: MetBand[] | null;
  inputs: ('duration' | 'distance' | 'intensity' | 'focus')[];
}

export interface BurnInput {
  durationMin: number;
  distanceKm?: number | null;
  intensity?: Intensity | null;
  focus?: GymFocus | null;
}

export function speedKmh(distanceKm: number, durationMin: number): number {
  if (durationMin <= 0) return 0;
  return distanceKm / (durationMin / 60);
}

export function metFor(type: ActivityTypeDef, input: BurnInput): number {
  if (type.inputs.includes('focus') && input.focus) return GYM_FOCUS_MET[input.focus];
  if (type.metBands && type.metBands.length && input.distanceKm && input.distanceKm > 0) {
    const v = speedKmh(input.distanceKm, input.durationMin);
    let met = type.metBands[0]!.met;
    for (const band of type.metBands) if (v >= band.minKmh) met = band.met;
    return met;
  }
  const mult = input.intensity ? INTENSITY_MULTIPLIER[input.intensity] : 1;
  return type.met * mult;
}

/** SYS-CALC-10: Burn = MET × weight (kg) × hours. */
export function computeBurn(type: ActivityTypeDef, input: BurnInput, weightKg: number): { kcal: number; met: number } {
  const met = metFor(type, input);
  const kcal = met * weightKg * (Math.max(0, input.durationMin) / 60);
  return { kcal: Math.round(kcal), met: Math.round(met * 10) / 10 };
}
