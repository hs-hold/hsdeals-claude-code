import { test, expect } from '@playwright/test';

// Smoke tests — verify the app boots, providers wire up, and the public
// surface (login page + protected-route redirect) behaves. Authenticated
// flows are intentionally out of scope here; add them once a TEST_USER
// fixture is set up against a Supabase test project.

test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'HS Deals' })).toBeVisible();
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('protected route redirects to login when signed out', async ({ page }) => {
  await page.goto('/deals');
  await expect(page).toHaveURL(/\/login/);
});

test('invalid credentials show an error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('nobody@example.invalid');
  await page.getByLabel(/password/i).fill('wrong-password-xyz');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});
