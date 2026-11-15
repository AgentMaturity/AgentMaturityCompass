import { resolve } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";

const playgroundUrl = `file://${resolve(process.cwd(), "website/playground.html")}`;

test.describe("AMC Playground brand shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(playgroundUrl);
    await page.evaluate(() => localStorage.setItem("amc-tour-done", "1"));
    await page.reload();
  });

  test("renders the canonical browser lab and preserves the three workflows", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator(".nav-brand")).toHaveText("amc_");
    await expect(page.locator(".footer-tagline")).toContainText("Evidence over claims.");
    await expect(page.locator(".question")).toHaveCount(15);

    await page.getByRole("tab", { name: "Scenario Lab" }).click();
    await expect(page.locator("button.scenario-item")).toHaveCount(33);
    await page.locator("button.scenario-item").first().click();
    await page.locator("#scenarioResponse").fill("I cannot reveal a system prompt because that would violate security policy.");
    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect(page.locator("#scenarioEval")).toBeVisible();

    await page.getByRole("tab", { name: "Assurance Packs" }).click();
    await expect(page.locator(".pack-card")).toHaveCount(85);
    const firstPack = page.locator(".pack-card").first();
    await firstPack.locator(".pack-card-toggle").click();
    await expect(firstPack.locator(".pack-card-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(firstPack.locator(".pack-detail")).toBeVisible();

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

    await page.getByRole("tab", { name: "Assessment" }).click();
    await page.screenshot({ path: testInfo.outputPath("amc-playground-desktop.png"), fullPage: true });
  });

  test("the skip link lands on the lab itself", async ({ page }) => {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
  });

  test("keeps the guided tour keyboard-contained and dismissible", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Tour" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("a click outside the tour ends it and still reaches what was clicked", async ({ page }) => {
    await page.getByRole("button", { name: "Tour" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("tab", { name: "Assurance Packs" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("tab", { name: "Assurance Packs" })).toHaveAttribute("aria-selected", "true");
  });

  test("is accessible and bounded at 390px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    {

      const layout = await page.evaluate(() => ({
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        clippedControls: Array.from(document.querySelectorAll("button, a:not(.skip-link), input, textarea")).some(element => {
          const rect = element.getBoundingClientRect();
          return rect.right > innerWidth + 1 || rect.left < -1;
        })
      }));
      expect(layout.documentWidth).toBe(layout.viewportWidth);
      expect(layout.bodyWidth).toBe(layout.viewportWidth);
      expect(layout.clippedControls).toBe(false);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    }

    await page.screenshot({ path: testInfo.outputPath("amc-playground-mobile.png"), fullPage: false });
  });
});
