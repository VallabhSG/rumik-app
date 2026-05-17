import { test, expect } from '@playwright/test';

test.describe('Home Screen @smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors so CI logs show any JS crashes
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('[browser error]', msg.text());
    });
    page.on('pageerror', err => console.log('[page crash]', err.message));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Debug: log first 300 chars of body text so CI shows what rendered
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.log('[body]', bodyText.substring(0, 300) || '(empty)');
  });

  test('loads and shows rumik branding', async ({ page }) => {
    await expect(page.locator('text=rumik').first()).toBeVisible({ timeout: 15000 });
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
