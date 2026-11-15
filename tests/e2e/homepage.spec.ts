import { test, expect } from './fixtures.js';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { INDEX_URL } from './urls.js';

const WEBSITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../website');

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(INDEX_URL);
  });

  test('page loads with the front-door headline', async ({ page }) => {
    expect((await page.title()).toLowerCase()).toContain('agent maturity');
    await expect(page.locator('h1')).toHaveText('Build an AI agent for work that gets audited_');
    await expect(page.locator('.footer-tagline')).toContainText('Build, run and check AI agents for regulated work.');
  });

  test('desktop and mobile navigation point to existing sections', async ({ page }) => {
    const desktop = page.locator('nav .nav-links a[href^="#"]');
    expect(await desktop.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['#a4-forge', '#capabilities', '#domains']);
    await expect(page.locator('nav .nav-links a[href="a4.html"]')).toHaveCount(1);
    const mobile = page.locator('.nav-mobile a[href^="#"]');
    expect(await mobile.evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['#a4-forge', '#capabilities', '#domains', '#paths', '#install', '#desktop', '#pricing']);
    await expect(page.locator('.nav-mobile a[href="a4.html"]')).toHaveCount(1);
    const navLinks = page.locator('nav a[href^="#"], .nav-mobile a[href^="#"], .footer a[href^="#"]');
    const count = await navLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await navLinks.nth(i).getAttribute('href');
      if (href && href.length > 1) await expect(page.locator(`[id="${href.slice(1)}"]`)).toHaveCount(1);
    }
  });

  test('the industry picker still helps when its pack list cannot load', async ({ page }) => {
    // This suite opens the page from file://, where the browser refuses to fetch industry-packs.json: the same state a
    // reader sees with the list missing. The chips stay links to each industry's page and the sheet says what happened.
    const chips = page.locator('#stationChips a.chip');
    await expect(chips).toHaveCount(7);
    for (const href of await chips.evaluateAll(links => links.map(link => link.getAttribute('href')))) {
      expect(href).toMatch(/^station-[a-z]+\.html$/);
    }
    await expect(page.locator('#packSheet')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#sheetSummary')).toContainText('did not load');
    await expect(page.locator('.picker-field')).toBeHidden();
  });

  test('the industry picker fills the first draft from the pack list', async ({ page }) => {
    // file:// pages cannot fetch, so serve the website folder from a routed http origin.
    await page.route('http://amc.test/**', async route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
      const file = resolve(WEBSITE_DIR, path);
      if (!file.startsWith(WEBSITE_DIR) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ path: file });
    });
    await page.goto('http://amc.test/index.html');
    const data = JSON.parse(readFileSync(resolve(WEBSITE_DIR, 'industry-packs.json'), 'utf8'));
    const stations = data.stations.filter((station: { packs: unknown[] }) => station.packs.length > 0);
    const chips = page.locator('#stationChips button.chip');
    await expect(chips).toHaveCount(stations.length);
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#packSheet')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#sheetTitle')).toHaveText(stations[0].packs[0].name);
    await expect(page.locator('#sheetRules li').first()).toHaveText(stations[0].packs[0].rules[0]);
    const last = stations[stations.length - 1];
    await chips.last().click();
    await expect(chips.last()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#packSelect option')).toHaveCount(last.packs.length);
    await page.locator('#packSelect').selectOption(last.packs[last.packs.length - 1].id);
    await expect(page.locator('#sheetTitle')).toHaveText(last.packs[last.packs.length - 1].name);
    await expect(page.locator('#sheetRisk .risk')).not.toHaveText('Not set');
  });

  test('install section gives the source build first and the older release installers second', async ({ page }) => {
    const commands = page.locator('#install pre.cmd');
    await expect(commands).toHaveCount(2);
    await expect(commands.nth(0)).toContainText('pnpm install --frozen-lockfile && pnpm run build && npm link');
    await expect(commands.nth(1)).toContainText('curl -fsSL https://agentmaturity.co/install.sh | sh');
    await expect(commands.nth(1)).toContainText('irm https://agentmaturity.co/install.ps1 | iex');
    await expect(page.locator('#install .install-card').nth(1)).toContainText('1.1.1');
    await expect(page.locator('#install button.copy')).toHaveCount(1);
  });

  test('every scrollable command block can be reached with the keyboard', async ({ page }) => {
    const blocks = page.locator('pre.cmd');
    expect(await blocks.count()).toBeGreaterThan(0);
    for (const tabindex of await blocks.evaluateAll(nodes => nodes.map(node => node.getAttribute('tabindex')))) expect(tabindex).toBe('0');
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
    const footerLinks = page.locator('footer a[href]');
    const count = await footerLinks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) expect(await footerLinks.nth(i).getAttribute('href')).toBeTruthy();
  });

  test('images declare their size so the page does not shift as they load', async ({ page }) => {
    for (const size of await page.locator('main img').evaluateAll(images => images.map(image => [image.getAttribute('width'), image.getAttribute('height')]))) {
      expect(Number(size[0])).toBeGreaterThan(0);
      expect(Number(size[1])).toBeGreaterThan(0);
    }
  });

  test('skip-to-content link moves keyboard focus to main', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
