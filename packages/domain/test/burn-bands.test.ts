import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@clubhouse/contracts';
import { bandFor, computeBurn, dayCalorieClass, isDayClosed, isInRangeDay } from '../src';

const running = { key: 'running', met: 9.8, inputs: ['duration', 'distance'] as const, metBands: [{ minKmh: 0, met: 6 }, { minKmh: 8, met: 8.3 }, { minKmh: 10, met: 9.8 }, { minKmh: 12, met: 11.5 }] };
const gym = { key: 'gym', met: 5, inputs: ['duration', 'focus'] as const };
const yoga = { key: 'yoga', met: 2.5, inputs: ['duration', 'intensity'] as const };

describe('burn (SYS-CALC-10/11)', () => {
  it('MET × kg × hours', () => {
    expect(computeBurn({ ...yoga, inputs: [...yoga.inputs] }, { durationMin: 60, intensity: 'moderate' }, 70).kcal).toBe(175);
  });
  it('picks the MET band from pace for distance types', () => {
    const r = computeBurn({ ...running, inputs: [...running.inputs] }, { durationMin: 30, distanceKm: 5 }, 72); // 10 km/h
    expect(r.met).toBe(9.8);
    expect(r.kcal).toBe(Math.round(9.8 * 72 * 0.5));
    expect(computeBurn({ ...running, inputs: [...running.inputs] }, { durationMin: 30, distanceKm: 3 }, 72).met).toBe(6);
  });
  it('gym focus METs 3.5 / 6.0 / 5.0', () => {
    expect(computeBurn({ ...gym, inputs: [...gym.inputs] }, { durationMin: 60, focus: 'strength' }, 80).kcal).toBe(280);
    expect(computeBurn({ ...gym, inputs: [...gym.inputs] }, { durationMin: 60, focus: 'cardio' }, 80).kcal).toBe(480);
    expect(computeBurn({ ...gym, inputs: [...gym.inputs] }, { durationMin: 60, focus: 'mixed' }, 80).kcal).toBe(400);
  });
});

describe('bands (SYS-CALC-20/21/22, Appendix E)', () => {
  const t = DEFAULT_THRESHOLDS;
  it('calories are two-sided', () => {
    expect(bandFor('kcal', 1700, 2000, t, true).band).toBe('green'); // 85 % boundary is green
    expect(bandFor('kcal', 1690, 2000, t, true)).toMatchObject({ band: 'yellow', direction: 'under', label: 'a bit low', icon: 'dash' });
    expect(bandFor('kcal', 2000, 2000, t, true)).toMatchObject({ band: 'green', label: 'on track', icon: 'check' });
    expect(bandFor('kcal', 2200, 2000, t, true)).toMatchObject({ band: 'yellow', direction: 'over', label: 'a bit over' });
    expect(bandFor('kcal', 2400, 2000, t, true)).toMatchObject({ band: 'red', label: 'over', icon: 'alert' });
  });
  it('protein is one-sided: over is green then "plenty", never red', () => {
    expect(bandFor('protein', 150, 100, t, true).band).toBe('green');
    expect(bandFor('protein', 200, 100, t, true)).toMatchObject({ band: 'yellow', label: 'plenty' });
    expect(bandFor('protein', 70, 100, t, true)).toMatchObject({ band: 'yellow', label: 'low' });
  });
  it('fibre is green from 70 % up', () => {
    expect(bandFor('fibre', 70, 100, t, true).band).toBe('green');
    expect(bandFor('fibre', 300, 100, t, true).band).toBe('green');
  });
  it('under for calories and carbs is neutral until the day closes', () => {
    expect(bandFor('kcal', 500, 2000, t, false)).toMatchObject({ band: 'neutral', label: 'room to fuel' });
    expect(bandFor('carbs', 50, 200, t, false).band).toBe('neutral');
    expect(bandFor('protein', 10, 100, t, false).band).toBe('yellow');
  });
  it('day closes after 20:00 or once dinner is logged', () => {
    expect(isDayClosed({ isToday: true, localTime: '19:59', loggedSlots: [] })).toBe(false);
    expect(isDayClosed({ isToday: true, localTime: '20:00', loggedSlots: [] })).toBe(true);
    expect(isDayClosed({ isToday: true, localTime: '13:00', loggedSlots: ['dinner'] })).toBe(true);
    expect(isDayClosed({ isToday: false, localTime: '08:00', loggedSlots: [] })).toBe(true);
  });
  it('in-range day needs a food log and a non-red calorie band', () => {
    expect(isInRangeDay(1900, 2000, true, t)).toBe(true);
    expect(isInRangeDay(1500, 2000, true, t)).toBe(true);
    expect(isInRangeDay(2500, 2000, true, t)).toBe(false);
    expect(isInRangeDay(0, 2000, false, t)).toBe(false);
    expect(dayCalorieClass(2500, 2000, t)).toBe('over');
    expect(dayCalorieClass(1000, 2000, t)).toBe('under');
  });
});
