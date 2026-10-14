import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/engine/**', 'src/exporters/**', 'src/device-profiles/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        'src/core/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'src/engine/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'src/exporters/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'src/device-profiles/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
});
