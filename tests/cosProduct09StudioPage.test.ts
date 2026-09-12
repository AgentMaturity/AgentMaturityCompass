import { expect, test } from "vitest";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { PublicTaskFixture } from "./helpers/publicTaskHttpFixture.js";

// Author-only delivery. Opt in after P01's implementation/integration boundary and a matching build.
// Every successful API response below comes from real Studio. Faults delay/drop transport, not fake success.
const integration = test.runIf(process.env.AMC_PUBLIC_TASK_BROWSER === "1" && process.platform === "darwin");
type BrowserExpect = typeof import("@playwright/test").expect;
type Ui = InstanceType<typeof import("./e2e/native-tasks-page.mjs").NativeTasksPage>;
type Context = { page: Page; context: BrowserContext; f: PublicTaskFixture; ui: Ui; check: BrowserExpect;
  writes: { path: string; body: Record<string, unknown>; intent: string | undefined; csrf: string | undefined }[] };

async function withStudio(run: (context: Context) => Promise<void>): Promise<void> {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const { publicTaskHttpFixture } = await import("./helpers/publicTaskHttpFixture.js");
  const { NativeTasksPage } = await import("./e2e/native-tasks-page.mjs");
  let browser: Browser | undefined, context: BrowserContext | undefined, f: PublicTaskFixture | undefined;
  try {
    f = await publicTaskHttpFixture("success", "sqlite");
    browser = await chromium.launch({ headless: true,
      ...(process.env.AMC_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AMC_TEST_BROWSER_EXECUTABLE } : {}) });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const base = f.base;
    await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage(), check = browserExpect.configure({ timeout: 15_000 });
    const writes: Context["writes"] = [], errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (request.method() !== "POST" || !path.includes("/api/v1/native-tasks")) return;
      writes.push({ path, body: request.postDataJSON(), intent: request.headers()["x-amc-native-intent"], csrf: request.headers()["x-amc-native-csrf"] });
    });
    const ui = new NativeTasksPage(page, check, base, "default");
    await ui.open(f.identities.owner);
    await run({ page, context, f, ui, check, writes });
    expect(errors).toEqual([]);
    for (const write of writes) { expect(write.intent).toBe("task-workspace-v1"); expect(write.csrf).toBeTruthy(); }
  } finally {
    try { await context?.close(); } finally { try { await browser?.close(); } finally { await f?.close(); } }
  }
}

integration("P09 actual browser text attachments retain the original bytes across explicit retry and preserve edited drafts", async () => {
  await withStudio(async ({ page, f, ui, check, writes }) => {
    await page.locator("#nativeTaskProvider").selectOption("stub");
    await page.locator("#nativeTaskPrompt").fill("Review the selected text as reference data.");
    await page.locator("#nativeTaskAttachments").setInputFiles({ name: "notes.md", mimeType: "text/markdown",
      buffer: Buffer.from("# Local reference\nગુજરાતી text, not a binary upload.") });
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("notes.md");
    await page.locator("#nativeTaskSubmissionPreview summary").click();
    const original = await page.locator("#nativeTaskSubmittedText").textContent();
    expect(original).toContain("ગુજરાતી");
    expect(writes).toHaveLength(0);

    // First attempt is dropped before Studio receives it. Retry must use that exact body, not the edits below.
    await page.route("**/api/v1/native-tasks", route => route.request().method() === "POST" ? route.abort("connectionreset") : route.fallback(), { times: 1 });
    await page.locator("#nativeTaskSubmit").click();
    await check(page.locator("#nativeTaskNotice")).toContainText("Submission outcome unknown");
    await check(page.locator("#nativeTaskRetry")).toBeDisabled();
    expect(writes).toHaveLength(1); expect(writes[0].body.prompt).toBe(original);
    expect(writes[0].body).not.toHaveProperty("attachments");
    await page.locator("#nativeTaskPrompt").fill("A different unsent follow-up draft.");
    await page.locator("[data-native-remove-attachment]").click();
    await page.locator("#nativeTaskAttachments").setInputFiles({ name: "later.txt", mimeType: "text/plain", buffer: Buffer.from("Later draft context.") });
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("later.txt");
    await page.locator("#nativeTaskRefresh").click();
    await check(page.locator("#nativeTaskRetry")).toBeEnabled(); expect(writes).toHaveLength(1);
    const reply = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/native-tasks");
    await page.locator("#nativeTaskRetry").click();
    const admitted = await reply; expect(admitted.status()).toBe(202);
    const accepted = (await admitted.json()).data;
    await f.settle(accepted.taskId);
    await check(page.locator("#nativeTaskState")).toHaveText("Ready for another turn");
    expect(writes).toHaveLength(2); expect(writes[1].body).toEqual(writes[0].body);
    await check(page.locator("#nativeTaskRetry")).toBeHidden();
    await check(page.locator("#nativeTaskPrompt")).toHaveValue("A different unsent follow-up draft.");
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("later.txt");
    await check(page.locator("#nativeTaskTranscript .native-task-event-user")).toHaveCount(1);
    await check(page.locator("#nativeTaskTranscript")).toContainText("notes.md");
    await check(page.locator("#nativeTaskTranscript")).not.toContainText("Later draft context.");
    await check(page.locator("#nativeTaskUsage")).toContainText("synthetic");
    expect((await ui.task()).clientRequestId).toBe(writes[0].body.clientRequestId);
    await page.setViewportSize({ width: 390, height: 900 });
    const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
  });
}, 180_000);

integration("P09 an old real poll cannot restore controls after offline, and failed setup still exposes reconnect", async () => {
  await withStudio(async ({ page, context, f, ui, check, writes }) => {
    const accepted = await ui.create("Original history for delayed-read recovery.");
    await f.settle(accepted.taskId); await ui.ready();
    const writeCount = writes.length;
    let captured = false, first = true, release!: () => void, finished!: () => void;
    let transportError: unknown;
    const permission = new Promise<void>(resolve => { release = resolve; });
    const complete = new Promise<void>(resolve => { finished = resolve; });
    const pattern = `**/api/v1/native-tasks/${accepted.taskId}?*`;
    await page.route(pattern, async route => {
      if (!first) { await route.continue(); return; }
      first = false;
      try {
        const response = await route.fetch({ maxRetries: 0 }); expect(response.status()).toBe(200);
        captured = true; await permission;
        // Cancellation may make delivery impossible; no substitute successful response is fabricated.
        await route.fulfill({ response }).catch(() => undefined);
      } catch (error) { transportError = error; await route.abort().catch(() => undefined); }
      finally { finished(); }
    });
    try {
      // Await the page's ordinary idle poll, not a refresh that already owns the control lock.
      await check.poll(() => captured).toBe(true);
      await context.setOffline(true);
      await check(page.locator("#nativeTaskState")).toHaveText("Status unconfirmed");
      release(); await complete; expect(transportError).toBeUndefined();
      await context.setOffline(false);
      await check(page.locator("#nativeTaskReconnect")).toBeEnabled();
      await check(page.locator("#nativeTaskSubmit")).toBeDisabled();
      await check(page.locator("#nativeTaskTranscript .native-task-event")).toHaveCount(0);
      await check(page.locator("#nativeTaskUsage")).toContainText("Current status is unconfirmed");
      expect(writes).toHaveLength(writeCount);
      await page.locator("#nativeTaskReconnect").click();
      await check(page.locator("#nativeTaskState")).toHaveText("Ready for another turn");
      await check(page.locator("#nativeTaskTranscript .native-task-event-user")).toHaveCount(1);
      expect(writes).toHaveLength(writeCount);
    } finally { release(); await page.unroute(pattern); }

    await page.route("**/api/v1/native-tasks/options?*", route => route.abort("connectionreset"), { times: 1 });
    await page.locator("#nativeTaskRefresh").click();
    await check(page.locator("#nativeTaskError")).toBeVisible();
    await check(page.locator("#nativeTaskReconnect")).toBeEnabled();
    await check(page.locator("#nativeTaskRefresh")).toBeEnabled();
    await page.locator("#nativeTaskReconnect").click();
    await check(page.locator("#nativeTaskState")).toHaveText("Ready for another turn");
    await check(page.locator("#nativeTaskTranscript .native-task-event-user")).toHaveCount(1);
    expect(writes).toHaveLength(writeCount);
  });
}, 180_000);

integration("P09 signed approval visibility, actual cancellation, and same-session resume never imply a prompt replay", async () => {
  await withStudio(async ({ page, f, ui, check, writes }) => {
    const accepted = await ui.create("Request a governed local demonstration tool; do not approve it automatically.", "workspace");
    await check(page.locator("#nativeTaskApprovalBanner")).toBeVisible();
    await check(page.locator("#nativeTaskApprovals .native-task-approval")).toHaveCount(1);
    const pending = await ui.task(), approval = pending.approvals[0];
    expect(pending.state).toBe("running"); expect(approval.required).toBe(2);
    // A pending approval is not necessarily a committed tool/call. Compare only actual projected activity.
    const observed = await f.poll(accepted.taskId);
    if (observed.events.some(event => event.kind === "tool" || event.kind === "tool-update")) {
      await check(page.locator("#nativeTaskToolStatus")).toContainText("retained calls");
    } else await check(page.locator("#nativeTaskToolStatus")).toContainText("No tool activity");
    const review = await page.locator("#nativeTaskApprovals a").first().getAttribute("href");
    const target = new URL(review!, page.url());
    expect(target.searchParams.get("agent")).toBe("default");
    expect(target.searchParams.get("approval")).toBe(approval.approvalRequestId);
    expect(f.operator.effect()).toBeNull();
    const cancellation = await ui.control("cancel");
    expect(cancellation.taskId).toBe(accepted.taskId);
    const ended = await f.settle(accepted.taskId, false);
    expect(ended.turnEndReason).toBe("cancelled");
    await check(page.locator("#nativeTaskCancel")).toBeHidden();
    await ui.control("release");
    await check(page.locator("#nativeTaskResume")).toBeEnabled();
    const sessionId = ended.sessionId!, requestsBefore = f.history(sessionId).events.filter(row => row.event_type === "request/header").length;
    const beforeResume = writes.length, resumed = await ui.control("resume");
    expect(resumed.sessionId).toBe(sessionId); expect(resumed.state).toBe("idle");
    await check(page.locator("#nativeTaskSubmit")).toBeEnabled();
    expect(writes).toHaveLength(beforeResume + 1);
    expect(writes.at(-1)?.path).toMatch(/\/resume$/);
    expect(writes.at(-1)?.body).toEqual({ expectedRevision: ended.revision });
    expect(f.history(sessionId).events.filter(row => row.event_type === "request/header")).toHaveLength(requestsBefore);
    expect(f.operator.effect()).toBeNull();
  });
}, 180_000);

integration("P09 original media picker follows real discovery, keeps ordering local, and never tests a provider by selecting files", async () => {
  await withStudio(async ({ page, ui, check, writes }) => {
    await page.locator("#nativeTaskProvider").selectOption("stub");
    await check(page.locator("#nativeTaskMediaAttachments")).toBeDisabled();
    const options = await ui.options();
    const openai = options.providers.find((provider: { id: string; input?: { formats?: string[] }; credential: { configured: boolean } }) => provider.id === "openai");
    expect(openai?.input?.formats).toContain("amc-image-input@2");
    expect(openai?.credential.configured).toBe(false);
    await page.locator("#nativeTaskProvider").selectOption("openai");
    await page.locator("#nativeTaskModel").fill("not-contacted-by-file-selection");
    await page.locator("#nativeTaskPrompt").fill("Inspect these two originals in the displayed order.");
    await check(page.locator("#nativeTaskMediaAttachments")).toBeEnabled();
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3e8AAAAASUVORK5CYII=", "base64");
    await page.locator("#nativeTaskMediaAttachments").setInputFiles([
      { name: "first.png", mimeType: "image/png", buffer: pixel }, { name: "second.png", mimeType: "image/png", buffer: pixel }
    ]);
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("Media 1 · first.png");
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("Media 2 · second.png");
    await page.locator("[data-native-move-attachment]").click();
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("Media 1 · second.png");
    await check(page.locator("#nativeTaskSubmittedText")).toContainText("amc-image-input@2");
    await check(page.locator("#nativeTaskDraftBytes")).toContainText("serialized part bytes");
    await check(page.locator("#nativeTaskSubmit")).toBeDisabled(); // No configured credential; selection grants nothing.
    expect(writes).toHaveLength(0);
    await page.locator("#nativeTaskProvider").selectOption("stub");
    await check(page.locator("#nativeTaskMediaAttachments")).toBeDisabled();
    await check(page.locator("#nativeTaskSubmit")).toBeDisabled();
    await check(page.locator("#nativeTaskAttachmentList")).toContainText("second.png");
    await check(page.locator("#nativeTaskDraftBytes")).toContainText("input contract");
    expect(writes).toHaveLength(0);
  });
}, 180_000);
