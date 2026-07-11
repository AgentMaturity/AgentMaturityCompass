import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDirectory = resolve(here, "../../website");
const docsUrl = `file://${resolve(websiteDirectory, "docs/index.html")}`;
const standaloneDocs = [
  "getting-started.html",
  "cli.html",
  "adapters.html",
  "compliance.html",
  "methodology.html"
];

test.describe("AMC Docs brand shell", () => {
  test("renders the curated Docs home at desktop width", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(docsUrl);

    await expect(page.locator(".topbar-logo")).toHaveText(/amc_ docs/);
    await expect(page.locator(".topbar-tagline")).toHaveText("Evidence over claims.");
    await expect(page.locator(".welcome h1")).toContainText("Run one command");
    await expect(page.getByRole("heading", { name: "Evidence & Receipts" })).toBeVisible();
    await expect(page.getByText("OSS Adoption Roadmap", { exact: true })).toHaveCount(0);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      topbarHeight: document.querySelector(".topbar")?.getBoundingClientRect().height,
      mainLeft: document.querySelector(".main")?.getBoundingClientRect().left,
      publicGuideCount: Number(document.querySelector(".stat-card .num")?.textContent || "0"),
      firstCategoryCount: Number(document.querySelector(".sidebar-section .sidebar-count")?.textContent || "0")
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.topbarHeight).toBe(56);
    expect(layout.mainLeft).toBe(280);
    expect(layout.publicGuideCount).toBe(170);
    expect(layout.firstCategoryCount).toBeLessThanOrEqual(10);

    await page.screenshot({ path: testInfo.outputPath("amc-docs-desktop.png"), fullPage: true });
  });

  test("keeps install commands and the sidebar usable on mobile", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docsUrl);

    const menu = page.getByRole("button", { name: "Toggle sidebar" });
    await expect(menu).toBeVisible();
    await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
    await menu.click();
    await expect(page.locator("#sidebar")).toHaveClass(/open/);
    await menu.click();
    await expect(page.locator("#sidebar")).not.toHaveClass(/open/);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      commands: Array.from(document.querySelectorAll<HTMLElement>(".welcome-command")).map(command => ({
        clientWidth: command.clientWidth,
        scrollWidth: command.scrollWidth
      }))
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.commands).toHaveLength(2);
    for (const command of layout.commands) {
      expect(command.scrollWidth).toBeLessThanOrEqual(command.clientWidth);
    }

    await page.screenshot({ path: testInfo.outputPath("amc-docs-mobile.png"), fullPage: false });
  });

  test("fails closed for operator planning routes and search", async ({ page }) => {
    await page.goto(`${docsUrl}#OSS_ADOPTION_ROADMAP`);
    await expect(page.locator(".welcome")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
    await expect(page.getByText("OSS Adoption Roadmap", { exact: true })).toHaveCount(0);

    const search = page.getByRole("textbox", { name: "Search documentation" });
    await search.fill("OSS Adoption Roadmap");
    await expect(page.locator("#search-results")).toContainText("No results found");
  });

  for (const file of standaloneDocs) {
    test(`${file} uses the shared AMC shell without mobile overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`file://${resolve(websiteDirectory, `docs/${file}`)}`);

      await expect(page.locator(".topbar-logo")).toHaveText(/amc_ docs/);
      await expect(page.locator(".topbar-logo")).toHaveAttribute("href", "./");
      const layout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth
      }));
      expect(layout.documentWidth).toBe(layout.viewportWidth);
    });
  }
});
