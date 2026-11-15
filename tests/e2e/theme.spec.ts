import { test, expect } from './fixtures.js';
import { INDEX_URL, PLAYGROUND_URL } from './urls.js';

test.describe('Theme', () => {
  test('homepage is dark-only with no light-theme toggle', async ({ page }) => {
    await page.goto(INDEX_URL);
    await expect(page.locator('#themeToggle, .theme-toggle')).toHaveCount(0);
  });

  test('the Playground is dark-only too, and forgets a light theme saved by an older visit', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.evaluate(() => localStorage.setItem('amc-theme', 'clean'));
    await page.reload();
    await expect(page.locator('#themeToggle, .theme-toggle')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/clean-theme/);
    expect(await page.evaluate(() => localStorage.getItem('amc-theme'))).toBeNull();
  });
});
