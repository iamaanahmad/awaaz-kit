import { defineConfig } from 'vitest/config';

// Workspace-wide Vitest config. Package-level tests are co-located as `*.test.ts(x)`;
// cross-package tests live under `tests/`. Playwright specs (`tests/e2e`) are excluded.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    passWithNoTests: true,
    // Property tests (100 runs) can be slow on cold/loaded machines.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
