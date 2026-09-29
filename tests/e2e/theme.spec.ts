import { test, expect } from './fixtures.js';
import { INDEX_URL, PLAYGROUND_URL } from './urls.js';

test.describe('Theme', () => {
  test('homepage is dark-only with no light-theme toggle', async ({ page }) => {
    await page.goto(INDEX_URL);
    await expect(page.locator('#themeToggle, .theme-toggle')).toHaveCount(0);
  });

  test('switching Playground theme changes the background and button state', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    const initial = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await expect(page.locator('#themeToggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(initial);
  });

  test('switching back to dark persists across reload', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('amc-theme'))).toBe('terminal');
    await page.reload();
    await expect(page.locator('body')).not.toHaveClass(/clean-theme/);
    await expect(page.locator('#themeToggle')).toHaveAttribute('aria-pressed', 'false');
  });
});
