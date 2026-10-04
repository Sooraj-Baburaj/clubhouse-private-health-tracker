/**
 * `pnpm board:backfill` — rebuild the crew leaderboard from existing logs after the deploy that adds it: day facts for
 * the last 35 days, every member's weeks, and quiet closes of finished weeks (no chat posts, no pushes). Safe to re-run.
 *
 *   pnpm board:backfill            all teams
 *   pnpm board:backfill --days 56  a longer window
 */
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const { loadEnv } = await import('../src/config/env');
const { buildContainer } = await import('../src/container');
const { backfillBoard } = await import('../src/application/board');

const arg = process.argv.indexOf('--days');
const days = arg > 0 ? Number(process.argv[arg + 1]) : 35;
if (!Number.isInteger(days) || days < 7 || days > 120) {
  console.error('--days must be a whole number from 7 to 120.');
  process.exit(1);
}

const c = buildContainer(loadEnv());
try {
  const teams = await c.db.query.teams.findMany({ columns: { id: true, name: true } });
  for (const t of teams) {
    const started = Date.now();
    const r = await backfillBoard(c, t.id, days);
    console.log(`${t.name}: ${r.members} members, ${r.weeks} weeks refreshed, ${r.closed} closed (${Math.round((Date.now() - started) / 1000)} s)`);
  }
} finally {
  await c.sql.end({ timeout: 5 });
}
