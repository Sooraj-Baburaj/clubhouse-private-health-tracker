/** Seed activity types with METs from the Compendium of Physical Activities (SYS-DB-10/11). */
export interface ActivityTypeSeed {
  key: string;
  name: string;
  icon: string;
  met: number;
  metBands: { minKmh: number; met: number }[] | null;
  inputs: ('duration' | 'distance' | 'intensity' | 'focus')[];
  defaultDurationMin: number;
  sortOrder: number;
}

export const ACTIVITY_TYPE_SEED: ActivityTypeSeed[] = [
  { key: 'running', name: 'Run', icon: 'footprints', met: 9.8, metBands: [{ minKmh: 0, met: 6.0 }, { minKmh: 8, met: 8.3 }, { minKmh: 9.7, met: 9.8 }, { minKmh: 11.3, met: 11.0 }, { minKmh: 12.9, met: 11.8 }, { minKmh: 14.5, met: 12.8 }, { minKmh: 16.1, met: 14.5 }], inputs: ['duration', 'distance'], defaultDurationMin: 30, sortOrder: 1 },
  { key: 'walking', name: 'Walk', icon: 'footprints', met: 3.5, metBands: [{ minKmh: 0, met: 2.0 }, { minKmh: 3.2, met: 2.8 }, { minKmh: 4.0, met: 3.5 }, { minKmh: 5.6, met: 4.3 }, { minKmh: 6.4, met: 5.0 }, { minKmh: 7.2, met: 7.0 }], inputs: ['duration', 'distance'], defaultDurationMin: 30, sortOrder: 2 },
  { key: 'cycling', name: 'Cycle', icon: 'bike', met: 7.5, metBands: [{ minKmh: 0, met: 4.0 }, { minKmh: 16, met: 6.8 }, { minKmh: 19.3, met: 8.0 }, { minKmh: 22.5, met: 10.0 }, { minKmh: 25.7, met: 12.0 }, { minKmh: 30.6, met: 15.8 }], inputs: ['duration', 'distance'], defaultDurationMin: 45, sortOrder: 3 },
  { key: 'swimming', name: 'Swim', icon: 'waves', met: 8.0, metBands: [{ minKmh: 0, met: 5.8 }, { minKmh: 2.2, met: 8.3 }, { minKmh: 3.0, met: 9.8 }], inputs: ['duration', 'distance'], defaultDurationMin: 30, sortOrder: 4 },
  { key: 'gym', name: 'Gym', icon: 'dumbbell', met: 5.0, metBands: null, inputs: ['duration', 'focus'], defaultDurationMin: 60, sortOrder: 5 },
  { key: 'yoga', name: 'Yoga', icon: 'flower', met: 2.5, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 45, sortOrder: 6 },
  { key: 'hiking', name: 'Hike', icon: 'mountain', met: 6.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 90, sortOrder: 7 },
  { key: 'football', name: 'Football', icon: 'trophy', met: 7.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 60, sortOrder: 8 },
  { key: 'badminton', name: 'Badminton', icon: 'feather', met: 5.5, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 45, sortOrder: 9 },
  { key: 'cricket', name: 'Cricket', icon: 'trophy', met: 4.8, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 90, sortOrder: 10 },
  { key: 'dancing', name: 'Dance', icon: 'music', met: 5.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 45, sortOrder: 11 },
  { key: 'skipping', name: 'Skipping', icon: 'zap', met: 11.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 15, sortOrder: 12 },
  { key: 'stairs', name: 'Stairs', icon: 'trending-up', met: 8.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 15, sortOrder: 13 },
  { key: 'hiit', name: 'HIIT', icon: 'flame', met: 8.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 30, sortOrder: 14 },
  { key: 'tennis', name: 'Tennis', icon: 'circle-dot', met: 7.3, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 60, sortOrder: 15 },
  { key: 'basketball', name: 'Basketball', icon: 'circle-dot', met: 6.5, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 60, sortOrder: 16 },
  { key: 'pilates', name: 'Pilates', icon: 'flower', met: 3.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 45, sortOrder: 17 },
  { key: 'other', name: 'Other', icon: 'activity', met: 4.0, metBands: null, inputs: ['duration', 'intensity'], defaultDurationMin: 30, sortOrder: 99 },
];
