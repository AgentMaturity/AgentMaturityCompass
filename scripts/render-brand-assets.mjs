import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const source = resolve(repositoryRoot, "scripts/brand/og-card.html");
const output = resolve(repositoryRoot, "website/og-card.png");

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1
  });
  await page.goto(pathToFileURL(source).href, { waitUntil: "load" });
  await page.screenshot({
    path: output,
    type: "png",
    fullPage: false,
    animations: "disabled"
  });
} finally {
  await browser.close();
}

const rendered = readFileSync(output);
const width = rendered.readUInt32BE(16);
const height = rendered.readUInt32BE(20);
if (width !== 1200 || height !== 630) {
  throw new Error(`AMC social card must be 1200x630; rendered ${width}x${height}`);
}

console.log(`Rendered ${output} (${width}x${height})`);
