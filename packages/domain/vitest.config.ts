// Standalone Vitest config for packages/domain, used by Stryker (mutation testing).
// The repo-wide runs use the root vitest.config.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
