import { test, expect } from '@playwright/test';

test.describe('App Shell @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // domcontentloaded only — networkidle hangs because the app makes background
    // fetches to the OTA server (unreachable in CI) with long TCP timeouts.
    await page.waitForLoadState('domcontentloaded');
    // Give React 8 seconds to mount and render after JS executes
    await page.waitForTimeout(8000);
  });

  test('loads and shows rumik branding', async ({ page }) => {
    await expect(page.locator('body')).toContainText('rumik', { timeout: 10000 });
  });

  test('shows feel the music tagline on sign-in screen', async ({ page }) => {
    await expect(page.locator('body')).toContainText('feel the music', { timeout: 10000 });
  });

  test('shows sign-in form with email and password fields', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Sign in', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Email', { timeout: 10000 });
  });

  test('shows Google OAuth and create account options', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Continue with Google', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Create account', { timeout: 10000 });
  });
});
