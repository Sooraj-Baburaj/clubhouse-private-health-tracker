import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'packages/server/test/integration/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['packages/server/test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          setupFiles: ['packages/server/test/integration/setup-env.ts'],
          globalSetup: ['packages/server/test/integration/global-setup.ts'],
        },
      },
    ],
  },
});
