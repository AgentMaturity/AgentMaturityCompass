import { test, expect } from './fixtures.js';
import { INDEX_URL } from './urls.js';

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(INDEX_URL);
  });

  test('page loads with correct title', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.toLowerCase()).toContain('agent maturity');
  });

  test('desktop and mobile navigation point to existing sections', async ({ page }) => {
    const desktop = page.locator('nav .nav-links a[href^="#"]');
    expect(await desktop.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['#paths', '#pricing']);
    await expect(page.locator('nav .nav-links a[href="a4.html"]')).toHaveCount(1);
    const mobile = page.locator('.nav-mobile a[href^="#"]');
    expect(await mobile.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['#paths', '#install', '#capabilities', '#pricing', '#desktop', '#domains']);
    await expect(page.locator('.nav-mobile a[href="a4.html"]')).toHaveCount(1);
    const navLinks = page.locator('nav a[href^="#"], .nav-mobile a[href^="#"]');
    const count = await navLinks.count();

    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      if (href && href.startsWith('#') && href.length > 1) {
        const targetId = href.slice(1);
        const target = page.locator(`[id="${targetId}"]`);
        await expect(target).toHaveCount(1);
      }
    }
  });

  // 925c34d00: the source build (the only route with the amc menu today) comes first; the one-line installers give 1.1.1.
  test('install section gives the source build and both one-line release installers', async ({ page }) => {
    const commands = page.locator('#install .install-command');
    await expect(commands).toHaveCount(2);
    await expect(commands.nth(0)).toContainText('git clone https://github.com/AgentMaturity/AgentMaturityCompass.git');
    await expect(commands.nth(0)).toContainText('pnpm install --frozen-lockfile && pnpm run build && npm link');
    await expect(commands.nth(1)).toContainText('curl -fsSL https://agentmaturity.co/install.sh | sh');
    await expect(commands.nth(1)).toContainText('irm https://agentmaturity.co/install.ps1 | iex');
  });

  test('FAQ expands one answer at a time and can close it', async ({ page }) => {
    const questions = page.locator('.faq-q');
    await questions.nth(0).click();
    await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await questions.nth(1).click();
    await expect(questions.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(questions.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.faq-item.open')).toHaveCount(1);
    await questions.nth(1).click();
    await expect(questions.nth(1)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.faq-item.open')).toHaveCount(0);
  });

  test('footer links are valid', async ({ page }) => {
    const footerLinks = page.locator('footer a[href], .footer a[href], .fcopy a[href]');
    const count = await footerLinks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const href = await footerLinks.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toBe('');
    }
  });

  test('skip-to-content link moves keyboard focus to main', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
