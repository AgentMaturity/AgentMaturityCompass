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

    await expect(page.locator(".nav-brand")).toHaveText("amc_");
    await expect(page.locator('.nav-links a[aria-current="page"]')).toHaveText("Docs");
    await expect(page.locator(".welcome h1")).toContainText("Build an AI agent for work that gets audited");
    await expect(page.getByRole("heading", { name: "Evidence & Receipts" })).toBeVisible();
    await expect(page.getByText("OSS Adoption Roadmap", { exact: true })).toHaveCount(0);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      barBottom: document.querySelector(".docs-bar")?.getBoundingClientRect().bottom,
      mainLeft: document.querySelector(".main")?.getBoundingClientRect().left,
      publicGuideCount: Number(document.querySelector(".stat-card .num")?.textContent || "0"),
      sidebarGuideIds: Array.from(document.querySelectorAll("#sidebar-nav [data-doc]"), link => link.getAttribute("data-doc")),
      firstCategoryCount: Number(document.querySelector(".sidebar-section .sidebar-count")?.textContent || "0")
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    // The docs bar sits under the site nav (68 px) and is 56 px tall; the guide list is 280 px wide.
    expect(layout.barBottom).toBe(124);
    expect(layout.mainLeft).toBe(280);
    expect(layout.publicGuideCount).toBeGreaterThan(0);
    expect(new Set(layout.sidebarGuideIds).size).toBe(layout.sidebarGuideIds.length);
    expect(layout.publicGuideCount).toBe(layout.sidebarGuideIds.length);
    expect(layout.firstCategoryCount).toBeLessThanOrEqual(10);

    await page.screenshot({ path: testInfo.outputPath("amc-docs-desktop.png"), fullPage: true });
  });

  test("keeps install commands and the sidebar usable on mobile", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(docsUrl);

    const menu = page.getByRole("button", { name: "Show the list of guides" });
    await expect(menu).toBeVisible();
    await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
    await menu.click();
    await expect(page.locator("#sidebar")).toHaveClass(/open/);
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await menu.click();
    await expect(page.locator("#sidebar")).not.toHaveClass(/open/);
    await expect(menu).toHaveAttribute("aria-expanded", "false");

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      commands: Array.from(document.querySelectorAll<HTMLElement>(".welcome-command")).map(command => ({
        text: command.textContent?.trim() ?? "",
        clientWidth: command.clientWidth,
        scrollWidth: command.scrollWidth
      }))
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    // The source build's one-line installer; the by-hand build and the older installers are named in sentences, not as commands.
    expect(layout.commands.map(command => command.text)).toEqual([
      "$ curl -fsSL https://agentmaturity.co/install-source.sh | sh"
    ]);
    for (const command of layout.commands) {
      expect(command.scrollWidth).toBeLessThanOrEqual(command.clientWidth);
    }

    await page.screenshot({ path: testInfo.outputPath("amc-docs-mobile.png"), fullPage: false });
  });

  test("fails closed for operator planning routes and search", async ({ page }) => {
    // An internal or unknown guide is never rendered: the page says there is no such public guide.
    await page.goto(`${docsUrl}#OSS_ADOPTION_ROADMAP`);
    await expect(page.locator(".welcome h1")).toHaveText("No guide called “OSS_ADOPTION_ROADMAP”");
    await expect(page.locator(".doc-article")).toHaveCount(0);
    await expect(page.getByText("OSS Adoption Roadmap", { exact: true })).toHaveCount(0);

    const search = page.getByRole("searchbox", { name: "Search the docs" });
    await search.fill("OSS Adoption Roadmap");
    await expect(page.locator("#search-results")).toContainText("No results found");
  });

  for (const file of standaloneDocs) {
    test(`${file} uses the shared AMC shell without mobile overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`file://${resolve(websiteDirectory, `docs/${file}`)}`);

      await expect(page.locator(".nav-brand")).toHaveText("amc_");
      await expect(page.locator(".nav-brand")).toHaveAttribute("href", "../");
      await expect(page.locator(".footer-tagline")).toContainText("Evidence over claims.");
      const layout = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth
      }));
      expect(layout.documentWidth).toBe(layout.viewportWidth);
    });
  }
});
