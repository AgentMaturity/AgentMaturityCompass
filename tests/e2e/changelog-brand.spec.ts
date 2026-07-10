import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const changelogUrl = `file://${resolve(process.cwd(), "website/changelog.html")}`;

test.describe("AMC changelog brand shell", () => {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name} is canonical, accessible, and viewport-bounded`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("console", message => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", error => errors.push(error.message));

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(changelogUrl);

      await expect(page.locator(".editorial-wordmark")).toHaveText(/amc_releases/);
      await expect(page.locator(".editorial-tagline")).toHaveText("Evidence over claims.");
      await expect(page.getByRole("heading", { level: 1, name: "Release notes" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "1.1.1" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Complete changelog" })).toBeVisible();

      const layout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        mainCount: document.querySelectorAll("main").length,
        footerCount: document.querySelectorAll("footer").length,
      }));
      expect(layout.documentWidth).toBe(layout.viewportWidth);
      expect(layout.bodyWidth).toBe(layout.viewportWidth);
      expect(layout.mainCount).toBe(1);
      expect(layout.footerCount).toBe(1);
      expect(errors).toEqual([]);

      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations).toEqual([]);

      if (viewport.name === "mobile") {
        await page.keyboard.press("Tab");
        await expect(page.locator(".skip-link")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("main#main-content")).toBeFocused();
        await page.evaluate(() => window.scrollTo(0, 0));
      }

      await page.screenshot({
        path: testInfo.outputPath(`amc-changelog-${viewport.name}.png`),
        fullPage: viewport.name === "desktop",
      });
    });
  }
});
