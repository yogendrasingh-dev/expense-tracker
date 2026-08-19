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
  },
});
