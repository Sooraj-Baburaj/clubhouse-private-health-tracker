import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb } from '../src/client';
import { seedFoodsFromCsv } from '../src/seed';
import { migrateUrl } from './env';

const dir = resolve(import.meta.dirname, '../seed/foods');
const files: [string, 'seed' | 'usda'][] = [
  [resolve(dir, 'indian_curated.csv'), 'seed'],
  [resolve(dir, 'usda_generic.csv'), 'usda'],
];
const { db, close } = createDb(migrateUrl(), { max: 1 });
try {
  for (const [path, source] of files) {
    if (!existsSync(path)) {
      console.warn(`skipping missing ${path}`);
      continue;
    }
    const r = await seedFoodsFromCsv(db, path, source);
    console.log(`${source}: ${r.total} rows (${r.inserted} new, ${r.updated} updated)`);
  }
} finally {
  await close();
}
