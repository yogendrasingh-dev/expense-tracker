import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['./tests/integration/setup.ts'],
    setupFiles: ['./tests/integration/helpers/setupEach.ts'],
    // Testcontainers boot + migrations can take longer than the default 5s.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    // All integration test files share one Testcontainers Postgres and rely on
    // truncateAllTables() between tests for isolation (testing-strategy.md §6) — running two
    // files in parallel worker processes would let one file's truncate race another's assertions.
    fileParallelism: false,
  },
});
