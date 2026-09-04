import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test runner.
 *
 * Assumes:
 *   - Backend dev server on http://localhost:3000 (npm run start:dev in /backend)
 *   - Frontend dev server on http://localhost:5173 (npm run dev in /frontend)
 *
 * Override via env vars:
 *   PLAYWRIGHT_BASE_URL  →  frontend origin (default http://localhost:5173)
 *   PLAYWRIGHT_API_URL   →  backend origin for direct calls if needed
 *
 * Run:  npx playwright test   (after `npx playwright install`)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  // Logs in once per role and saves the session so tests start
  // pre-authenticated (see global-setup.ts for why — POST /auth/login is
  // throttled to 5/60s, which a full suite of individual per-test logins
  // blows through in seconds).
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    storageState: 'e2e/.auth/admin.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});