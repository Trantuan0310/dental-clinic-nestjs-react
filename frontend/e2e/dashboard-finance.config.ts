import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'dashboard-finance.spec.ts', workers: 1,
  outputDir: '../test-results/dashboard-finance', reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:5188', locale: 'en-US' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188', reuseExistingServer: false },
});
