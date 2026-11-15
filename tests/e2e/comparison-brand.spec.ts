import { resolve } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";

const comparisonUrl = `file://${resolve(process.cwd(), "website/compare.html")}`;

test.describe("AMC comparison brand and evidence boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(comparisonUrl);
  });

  test("renders the canonical decision guide and provenance ledger", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator(".nav-brand")).toHaveText("amc_");
    await expect(page.locator(".footer-tagline")).toContainText("Evidence over claims.");
    await expect(page.getByRole("heading", { name: "Pick the proof that fits your decision." })).toBeVisible();
    await expect(page.locator(".decision-card")).toHaveCount(7);
    await expect(page.locator(".source-item")).toHaveCount(8);
    await expect(page.getByRole("table", { name: "Evidence fit by evaluation approach" })).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      mainCount: document.querySelectorAll("main").length,
      footerCount: document.querySelectorAll("footer").length
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.bodyWidth).toBe(layout.viewportWidth);
    expect(layout.mainCount).toBe(1);
    expect(layout.footerCount).toBe(1);

    await page.screenshot({ path: testInfo.outputPath("amc-comparison-desktop.png"), fullPage: true });
  });

  test("is dark only, like the rest of the site, and forgets a saved light theme", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("amc-theme", "clean"));
    await page.reload();
    await expect(page.locator("#themeToggle, .theme-toggle")).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveClass(/clean-theme/);
    expect(await page.evaluate(() => localStorage.getItem("amc-theme"))).toBeNull();
  });

  test("is accessible and bounded at 390px, and says its table scrolls", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".table-region")).toHaveAttribute("tabindex", "0");
    await expect(page.locator(".scroll-hint")).toBeVisible();
    {

      const layout = await page.evaluate(() => {
        const tableRegion = document.querySelector<HTMLElement>(".table-region");
        return {
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          clippedControls: Array.from(document.querySelectorAll("button, a:not(.skip-link)")).some(element => {
            if (element.closest(".table-region")) return false;
            const rect = element.getBoundingClientRect();
            return rect.right > innerWidth + 1 || rect.left < -1;
          }),
          tableScrollable: Boolean(tableRegion && tableRegion.scrollWidth > tableRegion.clientWidth),
          tableTabIndex: tableRegion?.getAttribute("tabindex")
        };
      });
      expect(layout.documentWidth).toBe(layout.viewportWidth);
      expect(layout.bodyWidth).toBe(layout.viewportWidth);
      expect(layout.clippedControls).toBe(false);
      expect(layout.tableScrollable).toBe(true);
      expect(layout.tableTabIndex).toBe("0");

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    }

    await page.screenshot({ path: testInfo.outputPath("amc-comparison-mobile.png"), fullPage: false });
  });
});
