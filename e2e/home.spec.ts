import { test, expect } from '@playwright/test';

test.describe('Home Screen @smoke', () => {
  test('loads and shows rumik branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=rumik')).toBeVisible();
  });

  test('shows feel the music tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=feel the music')).toBeVisible();
  });

  test('shows Discover and Library cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Discover')).toBeVisible();
    await expect(page.locator('text=Library')).toBeVisible();
  });

  test('shows recently played section', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Recently Played')).toBeVisible();
    await expect(page.locator('text=Neon Drift')).toBeVisible();
    await expect(page.locator('text=Blue Static')).toBeVisible();
    await expect(page.locator('text=Ultraviolet')).toBeVisible();
  });
});
