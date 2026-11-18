#!/usr/bin/env node
// Opens every Compass Console page (src/console/pages) in a running Studio at 1440 and 390 px wide, in the light and the
// dark theme, takes a screenshot of each, and fails on (a) a console error or page error, (b) a page wider than the
// window (sideways scrolling), or (c) an asset request that failed. A script for people checking the console's look,
// not a gate check: it needs a running Studio and a person to sign in as. Run it from the repository root:
//   npm run console:sweep -- --base http://127.0.0.1:3210 --user owner --password-file <file> [--out <folder>] [--pages home,a4]
// Errors before the sign-in (the sign-in page asks who is signed in and is told nobody) are not counted. It never
// prints a password.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    user: { type: "string", default: "owner" },
    "password-file": { type: "string" },
    out: { type: "string", default: "console-sweep" },
    pages: { type: "string", default: "" }
  }
});
if (!values.base || !values["password-file"]) {
  console.error("Usage: node scripts/console-visual-sweep.mjs --base <studio url> --user <name> --password-file <file> [--out <folder>] [--pages a,b]");
  process.exit(2);
}
const base = values.base.replace(/\/+$/, "");
const out = resolve(values.out);
mkdirSync(out, { recursive: true });
const pages = values.pages ? values.pages.split(",").map((name) => name.trim()).filter(Boolean)
  : readdirSync("src/console/pages").filter((file) => file.endsWith(".html")).map((file) => file.slice(0, -5)).sort();
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");

const WIDTHS = [1440, 390];
const SCHEMES = ["light", "dark"];
const problems = [];

async function signIn(browser, width, colorScheme) {
  const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, colorScheme, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`${base}/console/login`);
  await page.fill("#loginUser", values.user);
  await page.fill("#loginPass", readFileSync(values["password-file"], "utf8").trim());
  await page.click("#loginBtn");
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 });
  return { context, page };
}

async function sweep(browser, width, scheme) {
  const { context, page } = await signIn(browser, width, scheme);
  let found = [];
  // A failed request's console line names no address; its location does (an API read that answers 404 "No score yet"
  // is told apart from a broken page that way).
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const where = message.location()?.url ? ` (${message.location().url.replace(base, "")})` : "";
    found.push(`console error: ${message.text().slice(0, 200)}${where}`);
  });
  page.on("pageerror", (error) => found.push(`page error: ${String(error).slice(0, 200)}`));
  page.on("requestfailed", (request) => { if (request.url().includes("/assets/")) found.push(`asset failed: ${request.url()}`); });
  page.on("response", (response) => { if (response.url().includes("/assets/") && response.status() >= 400) found.push(`asset ${response.status()}: ${response.url()}`); });
  for (const name of pages) {
    found = [];
    await page.goto(`${base}/console/${name}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => found.push("still loading after 15 s"));
    await page.waitForTimeout(500);
    const wider = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (wider > 0) found.push(`${wider} px wider than the window`);
    await page.screenshot({ path: join(out, `${name}-${width}-${scheme}.png`) });
    for (const problem of found) problems.push(`${name} at ${width} px, ${scheme}: ${problem}`);
    console.log(`${found.length ? "FAIL" : "ok  "} ${name} ${width} ${scheme}`);
  }
  await context.close();
}

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) for (const scheme of SCHEMES) await sweep(browser, width, scheme);
} finally {
  await browser.close();
}
console.log(`\n${pages.length} pages x ${WIDTHS.length} widths x ${SCHEMES.length} themes; screenshots in ${out}`);
if (problems.length) {
  console.log(`${problems.length} problems:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("No problems found.");
