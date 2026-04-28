import { test as setup, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const AUTH_FILE = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    setup.skip(true, 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — skipping authenticated flows. Add them to .env.local to enable.');
  }

  if (!existsSync(dirname(AUTH_FILE))) {
    mkdirSync(dirname(AUTH_FILE), { recursive: true });
  }

  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email!);
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Successful login redirects away from /login.
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  await expect(page.getByText(/login|sign in/i)).toHaveCount(0);

  await page.context().storageState({ path: AUTH_FILE });
});
