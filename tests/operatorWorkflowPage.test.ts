import { expect, test } from "vitest";
import type { Browser, BrowserContext } from "@playwright/test";

// P2-22 operator pages in a real browser against real built Studio. Opt-in, as tests/cosProduct09StudioPage.test.ts:
// AMC_PUBLIC_TASK_BROWSER=1 on darwin. The packet step also needs AMC_OPERATOR_PACKET_PLAN, the digest of a plan an A4
// project in the fixture workspace signed and reviewed at Adapt (no such fixture exists yet; see docs/OPERATOR_WORKFLOW.md).
const BROWSER = process.env.AMC_PUBLIC_TASK_BROWSER === "1" && process.platform === "darwin";
const integration = (name: string, fn: () => Promise<void>, timeout?: number): void => { if (BROWSER) test(name, fn, timeout); };

test("P2-22 browser page object resolves even when the browser scenario is not enabled", async () => {
  await expect(import("./e2e/operator-workflow-page.mjs")).resolves.toHaveProperty("OperatorWorkflowPage");
});

integration("P2-22 operator pages: open the inbox, open a packet, record a decision", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const { publicTaskHttpFixture } = await import("./helpers/publicTaskHttpFixture.js");
  const { OperatorWorkflowPage } = await import("./e2e/operator-workflow-page.mjs");
  let browser: Browser | undefined, context: BrowserContext | undefined;
  const f = await publicTaskHttpFixture("success", "sqlite");
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.AMC_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AMC_TEST_BROWSER_EXECUTABLE } : {}) });
    context = await browser.newContext({ serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === f.base ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const ui = new OperatorWorkflowPage(page, browserExpect.configure({ timeout: 15_000 }), f.base);
    await ui.login(f.identities.owner);
    await ui.openInbox();
    const plan = process.env.AMC_OPERATOR_PACKET_PLAN;
    if (plan) {
      await ui.openPacket(plan);
      await ui.decide("confirmed");
    }
    expect(errors).toEqual([]);
  } finally {
    try { await context?.close(); } finally { try { await browser?.close(); } finally { await f.close(); } }
  }
}, 180_000);
