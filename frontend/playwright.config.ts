import { defineConfig, devices } from '@playwright/test';

const runId = process.env.E2E_RUN_ID ?? `${Date.now()}-${process.pid}`;
process.env.E2E_RUN_ID = runId;
process.env.E2E_AUTH_DIR = `e2e/.auth/${runId}`;
process.env.E2E_VIDEO_DIR = `artifacts/playwright-videos/${runId}`;

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
 *   E2E_SLOW_MO          →  delay each browser action for a visible demo
 *   E2E_RECORD_VIDEO     →  keep video for successful tests
 *
 * Run:  npx playwright test   (after `npx playwright install`)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  outputDir: `test-results/${runId}`,
  reporter: process.env.CI ? 'github' : [
    ['list'],
    ['html', { outputFolder: `artifacts/playwright-reports/${runId}`, open: 'never' }],
  ],
  // Logs in once per role and saves the session so tests start
  // pre-authenticated (see global-setup.ts for why — POST /auth/login is
  // throttled to 5/60s, which a full suite of individual per-test logins
  // blows through in seconds).
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    timezoneId: 'Asia/Ho_Chi_Minh',
    storageState: `${process.env.E2E_AUTH_DIR}/admin.json`,
    launchOptions: { slowMo: Number(process.env.E2E_SLOW_MO ?? 0) },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: process.env.E2E_RECORD_VIDEO ? 'on' : 'retain-on-failure',
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
