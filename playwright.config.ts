import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas end-to-end contra la compilación de producción (`vite preview`),
 * que incluye la CSP y el service worker. Cada navegador se ejecuta en
 * español e inglés.
 */
const browsers = [
  { name: 'chromium', use: devices['Desktop Chrome'] },
  { name: 'firefox', use: devices['Desktop Firefox'] },
  { name: 'webkit', use: devices['Desktop Safari'] },
  { name: 'mobile', use: devices['Pixel 7'] },
];
const locales = [
  { id: 'es', locale: 'es-ES' },
  { id: 'en', locale: 'en-US' },
];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  ...(process.env['CI'] ? { workers: 2 } : {}),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    serviceWorkers: 'allow',
  },
  projects: browsers.flatMap((b) =>
    locales.map((l) => ({
      name: `${b.name}-${l.id}`,
      use: { ...b.use, locale: l.locale },
    })),
  ),
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 240_000,
  },
});
