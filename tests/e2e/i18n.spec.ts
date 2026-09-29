import { test, expect } from './fixtures.js';
import { INDEX_URL, PLAYGROUND_URL } from './urls.js';

test.describe('Internationalization', () => {
  test('homepage declares English without advertising a language switcher', async ({ page }) => {
    await page.goto(INDEX_URL);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.lang-switcher')).toHaveCount(0);
  });

  test('Playground exposes all seven supported languages', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await expect(page.getByRole('group', { name: 'Language' }).getByRole('button')).toHaveCount(7);
    await expect(page.locator('.lang-btn.active')).toHaveAttribute('data-lang', 'en');
  });

  test('switching language changes the Playground controls', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await expect(page.locator('[data-i18n="btnReset"]')).toHaveText('Reset');
    await page.getByRole('button', { name: 'Español', exact: true }).click();
    await expect(page.locator('[data-i18n="btnReset"]')).toHaveText('Reiniciar');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('.lang-btn.active')).toHaveAttribute('data-lang', 'es');
  });

  test('Playground language persists across reload', async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.getByRole('button', { name: 'Français', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('amc-lang'))).toBe('fr');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('.lang-btn.active')).toHaveAttribute('data-lang', 'fr');
    await expect(page.locator('[data-i18n="btnReset"]')).toHaveText('Réinitialiser');
  });
});
