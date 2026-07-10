import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const docsUrl = `file://${resolve(here, "../../website/docs/index.html")}`;
const rawDocs = "https://raw.githubusercontent.com/AgentMaturity/AgentMaturityCompass/main/docs/";

test("rendered guide links stay in the Docs router and unknown targets fail closed", async ({ page }) => {
  const fetchedDocs: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://cdn.jsdelivr.net/npm/marked/marked.min.js", route => route.fulfill({
    contentType: "application/javascript",
    body: `window.marked = {
      setOptions() {},
      parse(markdown) {
        if (markdown.includes("NESTED_ROUTE_FIXTURE")) {
          return '<h1>Runtime plane</h1><p><a id="public-guide-link" href="../GETTING_STARTED.md#first-score">First score</a></p><p><a id="internal-guide-link" href="../IMPLEMENTATION_REALITY_MAP.md">Internal plan</a></p><p><code>INSUFFICIENT_EVIDENCE_WITH_A_VERY_LONG_UNBROKEN_REFERENCE_TOKEN</code></p>';
        }
        return '<h1>Getting started</h1><h2 id="first-score">First score</h2>';
      }
    };`,
  }));
  await page.route(`${rawDocs}**`, route => {
    const url = route.request().url();
    fetchedDocs.push(url);
    const body = url.endsWith("deep-dive/INDEX.md") ? "NESTED_ROUTE_FIXTURE" : "GETTING_STARTED_FIXTURE";
    return route.fulfill({
      body,
      contentType: "text/markdown",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });

  await page.goto(`${docsUrl}#deep-dive/INDEX`);
  await expect(page.locator('.doc-article[data-doc="deep-dive/INDEX"]')).toBeVisible();
  const layout = await page.evaluate(() => ({ viewport: window.innerWidth, documentWidth: document.documentElement.scrollWidth }));
  expect(layout.documentWidth).toBe(layout.viewport);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  const internal = page.locator("#internal-guide-link");
  await expect(internal).not.toHaveAttribute("href");
  await expect(internal).toHaveAttribute("data-doc-link-unavailable", "true");
  await internal.click();
  expect(fetchedDocs.some(url => url.endsWith("IMPLEMENTATION_REALITY_MAP.md"))).toBe(false);
  expect(await page.evaluate(() => window.location.hash)).toBe("#deep-dive/INDEX");

  await page.locator("#public-guide-link").click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("#GETTING_STARTED::first-score");
  await expect(page.locator('.doc-article[data-doc="GETTING_STARTED"]')).toBeVisible();
  await expect(page.locator("#first-score")).toBeVisible();
  await expect(page.locator("#first-score")).toBeFocused();
  expect(fetchedDocs.some(url => url.endsWith("GETTING_STARTED.md"))).toBe(true);
});
