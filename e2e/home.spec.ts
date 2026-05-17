import { test, expect } from '@playwright/test';

test.describe('Home Screen @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // domcontentloaded only — networkidle hangs because the app makes background
    // fetches to the OTA server (unreachable in CI) with long TCP timeouts.
    await page.waitForLoadState('domcontentloaded');
    // Give React 8 seconds to mount and render after JS executes
    await page.waitForTimeout(8000);
  });

  test('loads and shows rumik branding', async ({ page }) => {
    // Use toContainText on body — more resilient than toBeVisible for RN Web
    // where elements may have no bounding box in certain viewport/headless configs
    await expect(page.locator('body')).toContainText('rumik', { timeout: 10000 });
  });

  test('shows feel the music tagline', async ({ page }) => {
    await expect(page.locator('body')).toContainText('feel the music', { timeout: 10000 });
  });

  test('shows Discover and Library cards', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Discover', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Library', { timeout: 10000 });
  });

  test('shows recently played section', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Recently Played', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Neon Drift', { timeout: 10000 });
  });
});
