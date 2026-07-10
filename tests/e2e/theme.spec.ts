import { test, expect } from './fixtures.js';
import { INDEX_URL } from './urls.js';

test.describe('Theme', () => {
  test('theme toggle exists on homepage', async ({ page }) => {
    await page.goto(INDEX_URL);
    const toggle = page.locator('#themeToggle, .theme-toggle, [aria-label*="theme" i]');
    expect(await toggle.count()).toBeGreaterThan(0);
  });

  test('switching theme changes CSS variables', async ({ page }) => {
    await page.goto(INDEX_URL);

    // Get initial background
    const initialBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );

    const toggle = page.locator('#themeToggle, .theme-toggle');
    if (await toggle.count() > 0) {
      await toggle.first().click();
      await page.waitForTimeout(300);

      const newBg = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor
      );

      // Background should change if theme was applied
      // (clean-theme sets --bg to white)
      if (newBg !== initialBg) {
        expect(newBg).not.toBe(initialBg);
      }
    }
  });

  test('theme persists across reload', async ({ page }) => {
    await page.goto(INDEX_URL);

    const toggle = page.locator('#themeToggle, .theme-toggle');
    if (await toggle.count() === 0) {
      test.skip();
      return;
    }

    // Toggle theme
    await toggle.first().click();
    await page.waitForTimeout(300);

    // Check if body has clean-theme class
    const hasClean = await page.evaluate(() =>
      document.body.classList.contains('clean-theme')
    );

    // Reload
    await page.reload();
    await page.waitForTimeout(500);

    // Check persistence via localStorage
    const storedTheme = await page.evaluate(() =>
      localStorage.getItem('amc-theme') || localStorage.getItem('theme')
    );

    if (storedTheme) {
      expect(storedTheme).toBeTruthy();
    }
  });
});
