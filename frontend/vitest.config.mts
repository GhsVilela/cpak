import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/polyfill.ts', './tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['components/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/layout.tsx', '**/globals.css'],
      thresholds: {
        lines: 60,
        functions: 50,
        branches: 50,
      },
    },
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
