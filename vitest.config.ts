import { defineConfig } from 'vitest/config';

// One Vitest run, three projects:
//   unit      pure logic and lint self-tests (node)
//   unit-dom  React components (jsdom)
//   api       HTTP tests against a real Postgres (apps/server/test/global-setup.ts)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/domain/src/**/*.test.ts',
            'packages/contracts/src/**/*.test.ts',
            'apps/server/src/**/*.test.ts',
            'eslint/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
          exclude: ['**/*.api.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'unit-dom',
          environment: 'jsdom',
          include: ['packages/ui/src/**/*.test.tsx', 'apps/web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['packages/ui/test/setup.ts'],
        },
      },
      {
        test: {
          name: 'api',
          environment: 'node',
          include: ['apps/server/src/**/*.api.test.ts', 'apps/server/test/**/*.api.test.ts'],
          globalSetup: ['apps/server/test/global-setup.ts'],
          setupFiles: ['apps/server/test/setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 60_000,
          fileParallelism: true,
          maxWorkers: 3,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage/domain',
    },
  },
});
