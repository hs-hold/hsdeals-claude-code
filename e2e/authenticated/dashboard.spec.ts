import { test, expect } from '@playwright/test';

test.beforeEach(async () => {
  if (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD) {
    test.skip(true, 'TEST_USER credentials not set');
  }
});

test('dashboard loads after login', async ({ page }) => {
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/login/);
  // Sidebar should be present on any signed-in page.
  await expect(page.locator('aside, nav').first()).toBeVisible({ timeout: 10_000 });
});

test('deals list page renders', async ({ page }) => {
  await page.goto('/deals');
  await expect(page).toHaveURL(/\/deals/);
  // Either the table renders or the empty-state shows — both are valid.
  const tableOrEmpty = page.locator('table, text=/no deals/i').first();
  await expect(tableOrEmpty).toBeVisible({ timeout: 10_000 });
});

test('error log page renders', async ({ page }) => {
  await page.goto('/errors');
  await expect(page.getByRole('heading', { name: /error log/i })).toBeVisible();
});

test('settings page renders', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings/);
});
