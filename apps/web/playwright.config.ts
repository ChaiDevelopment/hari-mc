import { defineConfig, devices } from '@playwright/test';

/**
 * E2E penuh: browser → Next.js → API NestJS → PostgreSQL (stack terisolasi, lihat e2e/global-setup.ts).
 * Prasyarat: `pnpm --filter @hmc/api build` dan `pnpm --filter @hmc/web build`.
 * Tiga viewport sesuai spesifikasi: desktop 1440, tablet 768, mobile 390.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // 1 worker: tes CMS membandingkan angka dashboard dengan database bersama.
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://localhost:3499',
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
});
