import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '.env.local'), quiet: true });
loadEnv({ path: resolve(process.cwd(), '.env'), quiet: true });

/**
 * Playwright config for DealFlow E2E tests.
 *
 * First-time setup:
 *   npx playwright install chromium
 *
 * For authenticated flows, set in .env.local (gitignored):
 *   TEST_USER_EMAIL=...
 *   TEST_USER_PASSWORD=...
 *
 * Run:
 *   npm run test:e2e          # headless
 *   npm run test:e2e:ui       # interactive
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    // Public smoke tests — no auth needed.
    {
      name: 'public',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // One-time login that saves the auth state to disk.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Authenticated flows — depend on setup, reuse stored session.
    {
      name: 'authenticated',
      testMatch: /authenticated\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
