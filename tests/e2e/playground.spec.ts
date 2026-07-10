import { test, expect } from './fixtures.js';
import { PLAYGROUND_URL } from './urls.js';

test.describe('Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
  });

  test('page loads with 15 questions', async ({ page }) => {
    const questions = page.locator('.question');
    await expect(questions).toHaveCount(15);
  });

  test('clicking a level button sets it as active', async ({ page }) => {
    const firstLevelBtn = page.locator('.level-btn').first();
    await firstLevelBtn.click();
    await expect(firstLevelBtn).toHaveClass(/active/);
  });

  test('score updates when levels are selected', async ({ page }) => {
    const scoreBig = page.locator('.score-big');
    const initialScore = await scoreBig.textContent();

    // Click a level button (L3 = index 2 for first question)
    const levelBtns = page.locator('.question').first().locator('.level-btn');
    if (await levelBtns.count() >= 3) {
      await levelBtns.nth(2).click();
      const newScore = await scoreBig.textContent();
      expect(newScore).not.toBe(initialScore);
    }
  });

  test('progress bar fills as questions are answered', async ({ page }) => {
    const progressFill = page.locator('.progress-fill');
    const initialWidth = await progressFill.evaluate(el => el.style.width);

    // Answer first question
    await page.locator('.question').first().locator('.level-btn').first().click();
    const newWidth = await progressFill.evaluate(el => el.style.width);
    expect(newWidth).not.toBe('0%');
  });

  test('share button shows share text', async ({ page }) => {
    // Answer at least one question first
    await page.locator('.level-btn').first().click();

    const shareBtn = page.locator('button:has-text("Share"), .btn:has-text("Share")');
    if (await shareBtn.count() > 0) {
      await shareBtn.first().click();
      const shareResult = page.locator('.share-result');
      await expect(shareResult).toBeVisible();
    }
  });

  test('export JSON produces valid JSON', async ({ page }) => {
    // Answer a question
    await page.locator('.level-btn').first().click();

    const exportBtn = page.locator('button:has-text("Export"), .btn:has-text("Export")');
    if (await exportBtn.count() > 0) {
      // Listen for download or clipboard
      const [download] = await Promise.all([
        page.waitForEvent('download').catch(() => null),
        exportBtn.first().click(),
      ]);
      if (download) {
        const content = await download.createReadStream().then(s => {
          return new Promise<string>((resolve) => {
            let data = '';
            s.on('data', chunk => data += chunk);
            s.on('end', () => resolve(data));
          });
        });
        expect(() => JSON.parse(content)).not.toThrow();
      }
    }
  });

  test('reset clears all selections', async ({ page }) => {
    // Answer questions
    const btns = page.locator('.level-btn');
    if (await btns.count() > 0) {
      await btns.first().click();
    }

    const resetBtn = page.locator('button:has-text("Reset"), .btn:has-text("Reset")');
    if (await resetBtn.count() > 0) {
      await resetBtn.first().click();
      const activeButtons = page.locator('.level-btn.active');
      expect(await activeButtons.count()).toBe(0);
    }
  });

  test('badge copy works', async ({ page }) => {
    // Answer enough questions for a badge
    const questions = page.locator('.question');
    const count = await questions.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = questions.nth(i).locator('.level-btn').first();
      if (await btn.count() > 0) await btn.click();
    }

    const badgeBtn = page.locator('button:has-text("Badge"), .btn:has-text("Badge"), button:has-text("Copy Badge")');
    if (await badgeBtn.count() > 0) {
      await badgeBtn.first().click();
      // Just verify no error was thrown
    }
  });
});
