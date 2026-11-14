#!/usr/bin/env node
// Re-takes the Compass Console pictures on the website (website/img/*.webp: three on the home page, which website/a4.html
// also shows, and one more on a4.html) from a running Studio, so they can be refreshed whenever the console changes.
//
// Needs a scratch workspace with exactly one person in it (an owner) and no agent project yet: the home card shows
// "Build an agent for your industry" only before the first project, and the practice project this script starts is
// offered only while one person can sign in. Start one in an empty folder with its own HOME, for example:
//   amc up --no-baseline --no-open && amc user init --username owner --password-file <file>
// then run, from the repository root:
//   npm run capture:site-shots -- --base http://127.0.0.1:3210 --user owner --password-file <file> [--out website/img]
// It signs in, captures Home's "Build an agent for your industry" card with a pack chosen (a4-start.webp), starts a
// practice project from it as a person would and captures that project's "What to do now" panel (a4-project.webp), then
// captures Home with the project under way (console-home.webp), then adds a second person and captures a pack project
// waiting for its first approval (a4-approval.webp). It prints each picture's size: copy those into the width and height
// of its <img> in website/index.html and website/a4.html. It never prints a password.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    user: { type: "string", default: "owner" },
    "password-file": { type: "string" },
    out: { type: "string", default: "website/img" },
    pack: { type: "string", default: "digital-health-record" }
  }
});
if (!values.base || !values["password-file"]) {
  console.error("Usage: node scripts/brand/capture-site-shots.mjs --base <studio url> --user <owner> --password-file <file> [--out website/img]");
  process.exit(2);
}
const base = values.base.replace(/\/+$/, "");
const out = resolve(values.out);
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");

const WIDTH = 1200; // the encoded width: sharp on a 2x screen at the size the page shows them, and light to load
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

/** Encodes a PNG screenshot as WebP, scaled to WIDTH, in the browser itself (no image library needed). */
async function saveWebp(png, name) {
  const encoder = await context.newPage();
  const { dataUrl, size } = await encoder.evaluate(async ({ src, width }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((image.height * width) / image.width);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/webp", 0.86), size: `${canvas.width}x${canvas.height}` };
  }, { src: `data:image/png;base64,${png.toString("base64")}`, width: WIDTH });
  await encoder.close();
  const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(`${out}/${name}`, bytes);
  console.log(`${name}: ${size}, ${Math.round(bytes.length / 1024)} KB`);
}

async function settle() {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}

// Sign in the way a person does.
await page.goto(`${base}/console/login`);
await page.fill("#loginUser", values.user);
await page.fill("#loginPass", readFileSync(values["password-file"], "utf8").trim());
await page.click("#loginBtn");
await page.waitForURL(/\/console\/home/, { timeout: 30_000 });

// Each picture is one part of the console, taken at a width where that part is about as wide as the website shows it,
// so its words stay readable on the page.
/** One screenshot around several elements, in page coordinates, with a small margin. */
async function around(selector) {
  const box = await page.locator(selector).evaluateAll((nodes) => {
    const rects = nodes.map((node) => node.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top)) + window.scrollY, bottom = Math.max(...rects.map((r) => r.bottom)) + window.scrollY;
    const left = Math.min(...rects.map((r) => r.left)), right = Math.max(...rects.map((r) => r.right));
    return { x: left - 8, y: top - 8, width: right - left + 16, height: bottom - top + 16 };
  });
  return page.screenshot({ fullPage: true, clip: box });
}

// 1. Home's first card, "Build an agent for your industry": the start form with an Industry Pack chosen, a name, and
// the "Who approves each step?" choice.
await settle();
await page.waitForSelector("#a4HomeTitle");
const homeTitle = (await page.textContent("#a4HomeTitle")).trim();
if (homeTitle !== "Build an agent for your industry") throw new Error(`The home card says "${homeTitle}": use a workspace with no agent project yet.`);
const form = page.locator("#a4HomeForm");
await form.locator("select").first().selectOption(values.pack);
await form.locator("[name=name]").fill("Patient record assistant");
await form.locator("[name=name]").blur();
await page.waitForTimeout(400);
await saveWebp(await page.locator("#a4HomeCard").screenshot(), "a4-start.webp");

// 2. Start a practice project from that card, as a person would, and capture its "What to do now" panel.
const practice = form.locator("input[name=practice][value=yes]");
if (await practice.isDisabled()) throw new Error("A practice project is not offered here: use a workspace with one person in it.");
await practice.check();
await form.locator("button[type=submit]").click();
await page.waitForURL(/a4Project/, { timeout: 30_000 });
await settle();
await page.waitForSelector(".a4-start");
await saveWebp(await around(".a4-practice, .a4-start"), "a4-project.webp");

// 3. Home once a project exists: carry on with it, or watch an agent, run a task and score the record.
await page.goto(`${base}/console/home`);
await settle();
await page.waitForSelector("#firstUse");
await saveWebp(await around("#a4HomeCard, #firstUse"), "console-home.webp");

// 4. A project that needs a second person, waiting for its first approval (a4-approval.webp, on website/a4.html). The
// owner starts a project from the same pack and follows the "What to do now" button, filling each stage's questions with
// "Use an example". When the panel asks for a second person, the owner invites one on the Members card (this also ends
// the practice project above, as any second person does). It stops when the panel says who must approve. The invited
// person's first password is shown on screen once and is never captured.
await page.goto(`${base}/console/a4?new=1`);
await settle();
const create = page.locator("#a4CreateForm");
await create.locator("select").first().selectOption(values.pack);
await create.locator("[name=name]").fill("Claims letter assistant");
await create.locator("button[type=submit]").click();
await page.waitForURL(/a4Project/, { timeout: 30_000 });
const projectUrl = page.url();
for (let step = 0; step < 12; step++) {
  await page.goto(projectUrl);
  await settle();
  if ((await page.locator(".a4-start").innerText()).includes("Who must approve")) break;
  const next = page.locator(".a4-start button").first();
  const label = (await next.textContent()).trim();
  if (/invite/i.test(label)) {
    const invite = page.locator(".a4-invite");
    await invite.locator("[name=inviteUsername]").fill("reviewer");
    await invite.locator("button", { hasText: "Invite" }).click();
  } else if (/reason/i.test(label)) {
    // A pack project's approvers are all local users: the owner acknowledges that with a reason before the request.
    await page.getByLabel(/^Reason/).first().fill("Both approvers are people on our team.");
    await page.locator("button:visible", { hasText: /^Acknowledge$/ }).first().click();
  } else {
    await next.click();
    if (/answer/i.test(label)) {
      await page.locator("button:visible", { hasText: "Use an example" }).first().click();
      await page.locator("button:visible", { hasText: "Save answers" }).first().click();
    }
  }
  await settle();
}
if (!(await page.locator(".a4-start").innerText()).includes("Who must approve")) throw new Error("The project never reached its first approval.");
await saveWebp(await page.locator(".a4-start").screenshot(), "a4-approval.webp");

await browser.close();
// Reported, not fatal: look at the pictures before committing them.
if (errors.length) console.warn(`The console reported page errors while capturing:\n${errors.join("\n")}`);
