import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = resolve(here, "../../website");
const editorialPages = [
  "blog.html",
  "blog/index.html",
  "blog/amc-philosophy.html",
  "blog/eu-ai-act-agents.html",
  "blog/langchain-scoring-tutorial.html",
  "blog/the-84-point-gap.html"
];

const pageUrl = (path: string): string => `file://${resolve(websiteDirectory, path)}`;

test.describe("AMC editorial brand shell", () => {
  test("renders the routed editorial index at desktop width", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(pageUrl("blog/index.html"));

    await expect(page.locator(".editorial-wordmark")).toHaveText(/amc_editorial/);
    await expect(page.locator(".editorial-tagline")).toHaveText("Evidence over claims.");
    await expect(page.getByRole("heading", { name: "AMC Blog" })).toBeVisible();
    await expect(page.locator(".blog-card")).toHaveCount(3);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      topbarHeight: document.querySelector(".editorial-topbar")?.getBoundingClientRect().height,
      mainCount: document.querySelectorAll("main").length,
      footerCount: document.querySelectorAll("footer").length
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.topbarHeight).toBe(56);
    expect(layout.mainCount).toBe(1);
    expect(layout.footerCount).toBe(1);

    await page.screenshot({ path: testInfo.outputPath("amc-editorial-desktop.png"), fullPage: true });
  });

  test("preserves the inline blog article routing contract", async ({ page }) => {
    await page.goto(`${pageUrl("blog.html")}#evaluate-agents-2026`);
    await expect(page.getByRole("heading", { name: "How to Evaluate AI Agents in 2026" })).toBeVisible();
    await expect(page.locator("#blog-index")).toBeHidden();

    await page.locator(".article.active .back").click();
    await expect(page.locator("#blog-index")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  });

  for (const path of editorialPages) {
    test(`${path} is accessible and bounded at 390px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(pageUrl(path));

      await expect(page.locator(".editorial-wordmark")).toBeVisible();
      await expect(page.locator("main#main-content")).toHaveCount(1);
      await expect(page.locator("footer.editorial-footer")).toHaveCount(1);

      const layout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        oversizedPre: Array.from(document.querySelectorAll("pre")).some(pre => pre.scrollWidth > pre.clientWidth && getComputedStyle(pre).overflowX !== "auto"),
        oversizedTable: Array.from(document.querySelectorAll("table")).some(table => table.scrollWidth > table.clientWidth && !["auto", "scroll"].includes(getComputedStyle(table).overflowX))
      }));
      expect(layout.documentWidth).toBe(layout.viewportWidth);
      expect(layout.bodyWidth).toBe(layout.viewportWidth);
      expect(layout.oversizedPre).toBe(false);
      expect(layout.oversizedTable).toBe(false);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);

      if (path === "blog/the-84-point-gap.html") {
        await page.screenshot({ path: testInfo.outputPath("amc-editorial-mobile.png"), fullPage: false });
      }
    });
  }
});
