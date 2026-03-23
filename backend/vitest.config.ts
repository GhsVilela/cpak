import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        // Infrastructure files requiring real DB/filesystem — not unit-testable
        'src/migrations/**',
        'src/utils/db.ts',
        'src/utils/imageStorage.ts',
      ],
      thresholds: {
        lines: 30,
        functions: 38,
        branches: 24,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
