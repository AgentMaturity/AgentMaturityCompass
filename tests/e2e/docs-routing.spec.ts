import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const docsUrl = `file://${resolve(here, "../../website/docs/index.html")}`;
const contentBase = "https://docs.test/content/";
const manifestUrl = "https://docs.test/content-manifest.json";
const docsScript = readFileSync(resolve(here, "../../website/docs/docs.js"), "utf8");
const publicBlock = docsScript.match(/const PUBLIC_DOC_IDS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
const publicDocs = Array.from(publicBlock.matchAll(/'([^']+)'/g), match => match[1]).sort();

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function configureDocsTransport(page: Page, options: {
  markedScript: string;
  bodyForDoc: (doc: string) => string;
  manifestBodyForDoc?: (doc: string) => string;
  fetchedDocs?: string[];
}): Promise<void> {
  await page.addInitScript(({ base, manifest }) => {
    (globalThis as typeof globalThis & { AMC_DOCS_CONTENT_BASE?: string }).AMC_DOCS_CONTENT_BASE = base;
    (globalThis as typeof globalThis & { AMC_DOCS_MANIFEST_URL?: string }).AMC_DOCS_MANIFEST_URL = manifest;
  }, { base: contentBase, manifest: manifestUrl });
  await page.route("**/vendor/marked.min.js", route => route.fulfill({
    contentType: "application/javascript",
    body: options.markedScript,
  }));

  const manifestBodyForDoc = options.manifestBodyForDoc ?? options.bodyForDoc;
  const rendererHash = sha256(options.markedScript);
  const guides = publicDocs.map(id => {
    const body = manifestBodyForDoc(id);
    return {
      id,
      source: `docs/${id}.md`,
      asset: `content/${id}.md`,
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
    };
  });
  await page.route(manifestUrl, route => route.fulfill({
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      schemaVersion: "2026-07-10",
      sourceRevision: "0123456789abcdef0123456789abcdef01234567",
      guideCount: guides.length,
      renderer: {
        package: "marked",
        version: "18.0.6",
        asset: "vendor/marked.min.js",
        bytes: Buffer.byteLength(options.markedScript),
        sha256: rendererHash,
      },
      guides,
    }),
  }));
  await page.route(`${contentBase}**`, route => {
    const url = route.request().url();
    options.fetchedDocs?.push(url);
    const path = decodeURIComponent(new URL(url).pathname.replace(/^\/content\//, ""));
    const doc = path.endsWith(".md") ? path.slice(0, -3) : path;
    return route.fulfill({
      body: options.bodyForDoc(doc),
      contentType: "text/markdown",
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  });
}

test("rendered guide links stay in the Docs router and unknown targets fail closed", async ({ page }) => {
  const fetchedDocs: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await configureDocsTransport(page, {
    fetchedDocs,
    markedScript: `window.marked = {
      setOptions() {},
      parse(markdown) {
        if (markdown.includes("NESTED_ROUTE_FIXTURE")) {
          return '<h1>Runtime plane</h1><p><a id="public-guide-link" href="../GETTING_STARTED.md#first-score">First score</a></p><p><a id="internal-guide-link" href="../IMPLEMENTATION_REALITY_MAP.md">Internal plan</a></p><p><code>INSUFFICIENT_EVIDENCE_WITH_A_VERY_LONG_UNBROKEN_REFERENCE_TOKEN</code></p>';
        }
        return '<h1>Getting started</h1><h2 id="first-score">First score</h2>';
      }
    };`,
    bodyForDoc: doc => doc === "deep-dive/INDEX" ? "NESTED_ROUTE_FIXTURE" : "GETTING_STARTED_FIXTURE",
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

test("rendered code controls preserve the AMC identity and announce copy outcomes", async ({ page }) => {
  const codeText = "printf 'Copy this exact payload'\nsecond line\n";
  const browserErrors: string[] = [];

  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => browserErrors.push(`page: ${error.message}`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value: string) {
          if ((window as typeof window & { __clipboardShouldFail?: boolean }).__clipboardShouldFail) {
            throw new Error("clipboard denied by test fixture");
          }
          (window as typeof window & { __copiedText?: string }).__copiedText = value;
        },
      },
    });
  });
  await configureDocsTransport(page, {
    markedScript: `window.marked = {
      setOptions() {},
      parse() {
        return "<h1>Copy control</h1><pre><code>printf 'Copy this exact payload'\\nsecond line\\n</code></pre>";
      }
    };`,
    bodyForDoc: () => "COPY_CONTROL_FIXTURE",
  });

  await page.goto(`${docsUrl}#PLAYGROUND`);
  await expect(page.locator('.doc-article[data-doc="PLAYGROUND"]')).toBeVisible();
  const control = page.locator(".copy-btn");
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAttribute("type", "button");
  await expect(control).toHaveAttribute("aria-label", "Copy code");
  await expect(control).toHaveAttribute("aria-live", "polite");

  const initialLayout = await page.evaluate(() => {
    const wrapper = document.querySelector<HTMLElement>(".code-block");
    const pre = wrapper?.querySelector<HTMLElement>("pre");
    const button = wrapper?.querySelector<HTMLElement>(".copy-btn");
    if (!wrapper || !pre || !button) return null;
    const wrapperRect = wrapper.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      buttonAppearance: style.appearance,
      buttonPosition: style.position,
      buttonFont: style.fontFamily,
      buttonBorder: style.borderTopColor,
      buttonLeft: buttonRect.left,
      buttonRight: buttonRect.right,
      wrapperLeft: wrapperRect.left,
      wrapperRight: wrapperRect.right,
      preContainsButton: pre.contains(button),
    };
  });
  expect(initialLayout).not.toBeNull();
  expect(initialLayout?.documentWidth).toBe(initialLayout?.viewportWidth);
  expect(initialLayout?.buttonAppearance).toBe("none");
  expect(initialLayout?.buttonPosition).toBe("absolute");
  expect(initialLayout?.buttonFont).toContain("Space Mono");
  expect(initialLayout?.buttonBorder).toBe("rgba(74, 239, 121, 0.2)");
  expect(initialLayout?.buttonLeft).toBeGreaterThanOrEqual(initialLayout?.wrapperLeft ?? 0);
  expect(initialLayout?.buttonRight).toBeLessThanOrEqual(initialLayout?.wrapperRight ?? 0);
  expect(initialLayout?.preContainsButton).toBe(false);

  const beforeScroll = await control.evaluate(element => element.getBoundingClientRect().left);
  await page.locator(".code-block pre").evaluate(element => {
    element.scrollLeft = element.scrollWidth;
  });
  const afterScroll = await control.evaluate(element => element.getBoundingClientRect().left);
  expect(afterScroll).toBe(beforeScroll);

  await control.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedText?: string }).__copiedText)).toBe(codeText);
  await expect(control).toHaveText("Copied");
  await expect(control).toHaveAttribute("aria-label", "Code copied");
  await expect(control).toHaveAttribute("data-state", "success");

  await page.evaluate(() => {
    (window as typeof window & { __clipboardShouldFail?: boolean }).__clipboardShouldFail = true;
  });
  await control.click();
  await expect(control).toHaveText("Try again");
  await expect(control).toHaveAttribute("aria-label", "Copy failed");
  await expect(control).toHaveAttribute("data-state", "error");
  expect(browserErrors).toEqual([]);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test("guide content with a stale or tampered hash fails closed before rendering", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => browserErrors.push(`page: ${error.message}`));
  await configureDocsTransport(page, {
    markedScript: "window.marked = { setOptions() {}, parse() { return '<h1>Must not render</h1>'; } };",
    bodyForDoc: () => "TAMPERED",
    manifestBodyForDoc: () => "EXPECTED",
  });

  await page.goto(`${docsUrl}#PLAYGROUND`);
  await expect(page.locator(".doc-error")).toBeVisible();
  await expect(page.locator(".doc-error")).toContainText("SHA-256 integrity check failed");
  await expect(page.locator(".doc-article")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
