import { test, expect } from '@playwright/test';

test.describe('Home Screen @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('loads and shows rumik branding', async ({ page }) => {
    await expect(page.locator('text=rumik')).toBeVisible({ timeout: 15000 });
  });

  test('shows feel the music tagline', async ({ page }) => {
    await expect(page.locator('text=feel the music')).toBeVisible({ timeout: 15000 });
  });

  test('shows Discover and Library cards', async ({ page }) => {
    await expect(page.locator('text=Discover')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Library')).toBeVisible({ timeout: 15000 });
  });

  test('shows recently played section', async ({ page }) => {
    await expect(page.locator('text=Recently Played')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Neon Drift')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Blue Static')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Ultraviolet')).toBeVisible({ timeout: 15000 });
  });
});
