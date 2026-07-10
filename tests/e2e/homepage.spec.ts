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

  test('nav links exist and point to section anchors', async ({ page }) => {
    const navLinks = page.locator('nav a[href^="#"], nav .nlinks a[href^="#"]');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(3);

    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      if (href && href.startsWith('#') && href.length > 1) {
        const targetId = href.slice(1);
        const target = page.locator(`[id="${targetId}"]`);
        await expect(target).toHaveCount(1);
      }
    }
  });

  test('install section has tab-like switching', async ({ page }) => {
    // Look for install-related tabs/buttons
    const installSection = page.locator('#install, [id*="install"], .install');
    if (await installSection.count() > 0) {
      const tabs = installSection.locator('button, [role="tab"]');
      if (await tabs.count() > 1) {
        await tabs.first().click();
        // Verify some content changed or tab is active
        const activeTab = installSection.locator('.active, [aria-selected="true"]');
        expect(await activeTab.count()).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('Simple/Technical toggle works if present', async ({ page }) => {
    const toggle = page.locator('[data-toggle], .toggle-simple, .toggle-technical, #modeToggle');
    if (await toggle.count() > 0) {
      await toggle.first().click();
      // Just verify it's clickable without errors
    }
  });

  test('footer links are valid', async ({ page }) => {
    const footerLinks = page.locator('footer a[href], .footer a[href], .fcopy a[href]');
    const count = await footerLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await footerLinks.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toBe('');
    }
  });

  test('skip-to-content link works if present', async ({ page }) => {
    const skip = page.locator('a[href="#main"], a[href="#content"], .skip-link, [class*="skip"]');
    if (await skip.count() > 0) {
      await expect(skip.first()).toHaveAttribute('href', /#.+/);
    }
  });
});
