import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite (plan §16). Runs the API (AI_MODE from the environment, mock by default) and the production builds of
 * both SPAs through `vite preview`, which proxies /api to the API. Needs a migrated, seeded database: pnpm db:migrate &&
 * pnpm seed:all && pnpm seed:demo.
 */
const API = 'http://localhost:3000';
const WEB = 'http://localhost:4173';
const ADMIN = 'http://localhost:4174/admin/';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'member-iphone', testMatch: /member\..*\.spec\.ts/, use: { ...devices['iPhone 15'], baseURL: WEB } },
    { name: 'member-pixel', testMatch: /member\..*\.spec\.ts/, use: { ...devices['Pixel 7'], baseURL: WEB } },
    { name: 'admin-desktop', testMatch: /admin\..*\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: ADMIN, viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @clubhouse/server exec tsx --env-file-if-exists=../../.env src/dev.ts',
      url: `${API}/api/health`,
      env: { PORT: '3000', AI_MODE: process.env.AI_MODE ?? 'mock' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @clubhouse/web build && pnpm --filter @clubhouse/web exec vite preview --strictPort',
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    {
      command: 'pnpm --filter @clubhouse/admin build && pnpm --filter @clubhouse/admin exec vite preview --strictPort',
      url: ADMIN,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
});
