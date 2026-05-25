import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 2,
  // Dev defaults to 4 workers which causes concurrency flake during
  // register-heavy tests (each creates an org). Cap at 2.
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? 'github' : 'html',
  // Default action/expectation timeout. The 5s default is too tight for
  // Next.js dev-mode cold compiles when several pages are visited for the
  // first time by parallel workers; 15s gives those compiles room without
  // hiding real bugs.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
