import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { publicTaskHttpFixture, type PublicTaskFixture } from "./helpers/publicTaskHttpFixture.js";

const fixtures: PublicTaskFixture[] = [];
async function fixture() { const f = await publicTaskHttpFixture("success", "jsonl"); fixtures.push(f); return f; }
afterEach(async () => { for (const f of fixtures.splice(0).reverse()) await f.close(); });

/** Kill only the actual local writer created in this test's isolated workspace.
 * No private SDK child handle, process-name matching or arbitrary PID argument.
 * The authenticated opening and current signed owner must agree. */
async function interruptFixtureWriter(f: PublicTaskFixture, sessionId: string): Promise<number> {
  const rows = f.history(sessionId).events;
  const first = JSON.parse(rows[0]!.meta_json).amcSessionWriter;
  const current = JSON.parse(rows.at(-1)!.meta_json).amcSessionWriter;
  assert.equal(rows[0]!.session_id, sessionId); assert.equal(rows[0]!.event_type, "session/open");
  assert.equal(current.pid, first.pid); assert.equal(current.token, first.token);
  assert.equal(current.state, "active"); assert.equal(current.hostId, hostname());
  assert.ok(Number.isSafeInteger(current.pid) && current.pid > 0 && current.pid !== process.pid);
  process.kill(current.pid, "SIGKILL");
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { process.kill(current.pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return current.pid; throw error; }
    assert.ok(Date.now() < deadline, "Owned writer did not actually exit"); await new Promise(done => setTimeout(done, 20));
  }
}

test("public SDK/ACP CLI resumes the actual killed JSONL writer without opening a replacement session", async () => {
  const f = await fixture();
  const sdk = await import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as typeof import("../src/sdk/nativeAgentClient.js");
  const options = { workspace: f.workspace, provider: "stub", agentId: "default", tools: "none" as const,
    credentialsMode: "operator-only" as const, credentialsHome: join(f.root, "operator-home"),
    maxSteps: 3, maxTokens: 128, timeoutMs: 20_000, env: { ...process.env } };
  const clients: import("../src/sdk/nativeAgentClient.js").AMCNativeClient[] = [];
  try {
    const first = await sdk.AMCNativeClient.start(options); clients.push(first);
    const session = await first.newSession(); const original = await session.prompt("Original SDK JSONL recording.").result;
    expect(original.text).toContain("Original SDK JSONL recording.");
    const id = session.sessionId, prefix = f.jsonlBytes();
    const competing = await sdk.AMCNativeClient.start(options); clients.push(competing);
    await expect(competing.resumeSession(id)).rejects.toThrow(); expect(f.jsonlBytes()).toEqual(prefix);
    const killedPid = await interruptFixtureWriter(f, id); await first.close(); await competing.close();
    expect(sdk.inspectJsonlSessionRecovery({ workspace: f.workspace, sessionId: id, agentId: "default" }).eligible).toBe(true);
    const changed = await sdk.AMCNativeClient.start({ ...options, maxSteps: 2 }); clients.push(changed);
    await expect(changed.resumeSession(id)).rejects.toThrow(); await changed.close(); expect(f.jsonlBytes()).toEqual(prefix);
    const client = await sdk.AMCNativeClient.start(options); clients.push(client);
    const resumed = await client.resumeSession(id);
    expect(resumed.sessionId).toBe(id); expect(resumed.history.some(row => JSON.stringify(row).includes("Original SDK JSONL recording."))).toBe(true);
    expect(f.jsonlBytes().subarray(0, prefix.length)).toEqual(prefix);
    expect(f.history(id).events.filter(row => row.event_type === "request/header")).toHaveLength(1);
    const result = await resumed.prompt("Explicit resumed SDK JSONL output.").result;
    expect(result.text).toContain("Explicit resumed SDK JSONL output."); expect(result.verification).toBe("not-verified");
    await client.close();
    const history = sdk.loadSessionEventHistory({ workspace: f.workspace, sessionId: id, requireSealed: true, verifyPayloads: true });
    expect(history.events.filter(row => row.event_type === "session/open")).toHaveLength(1);
    expect(history.events.filter(row => row.event_type === "request/header")).toHaveLength(2);
    const closed = await sdk.AMCNativeClient.start(options); clients.push(closed);
    await expect(closed.resumeSession(id)).rejects.toThrow();
    writeFileSync(join(f.root, "new-sdk-resume-receipt.json"), JSON.stringify({ sourceBoundary: "built source SDK and real ACP CLI; not installed", sessionId: id,
      killedPid, actualExitObserved: true, sameSession: true, prefixUnchanged: true, modelHeaders: 2, inputKind: "local deterministic stub", providerQualified: false }, null, 2));
  } finally { for (const client of clients.reverse()) await client.close(); }
}, 90_000);

test("authenticated HTTP JSONL resume preserves admissions and current control refusals after real writer exit", async () => {
  const f = await fixture(), original = f.input("Original admitted JSONL task.");
  const admission = await f.request("/api/v1/native-tasks", { body: original }); expect(admission.status).toBe(202);
  let task = await f.settle(admission.body.data.taskId), id = task.sessionId!;
  const input = { clientRequestId: randomUUID(), expectedRevision: task.revision, prompt: "Original admitted follow-up." };
  expect((await f.request(f.taskPath(task.taskId, "turn"), { body: input })).status).toBe(202);
  task = await f.settle(task.taskId); const prefix = f.jsonlBytes();
  const killedPid = await interruptFixtureWriter(f, id); await f.restart();
  const cold = (await f.poll(task.taskId)).task;
  expect(cold).toMatchObject({ sessionId: id, revision: 2, clientRequestId: original.clientRequestId,
    lastClientRequestId: input.clientRequestId, canResume: true, recovery: { eligible: true, state: "ready" } });
  for (const action of ["resume", "release", "cancel", "verify", "archive"]) {
    expect((await f.control(task.taskId, action, 1)).status).toBe(409);
    expect((await f.request(f.taskPath(task.taskId, action), { identity: "other", body: { expectedRevision: 2 } })).status).toBe(404);
  }
  expect((await f.request(f.taskPath(task.taskId, "resume"), { body: { expectedRevision: 2 }, headers: { "x-amc-native-csrf": undefined } })).status).toBe(403);
  expect((await f.request(`${f.taskPath(task.taskId, "resume")}&agentId=other`, { body: { expectedRevision: 2 } })).status).toBe(400);
  expect((await f.request(f.taskPath(task.taskId, "resume"), { body: { expectedRevision: 2, sessionId: "substituted" } })).status).toBe(400);
  expect(f.jsonlBytes()).toEqual(prefix);
  expect((await f.control(task.taskId, "resume", 2)).body.data).toMatchObject({ state: "idle", sessionId: id, revision: 2 });
  const afterResume = f.jsonlBytes(); expect(afterResume.subarray(0, prefix.length)).toEqual(prefix);
  expect((await f.request(f.taskPath(task.taskId, "turn"), { body: input })).status).toBe(202);
  expect((await f.request(f.taskPath(task.taskId, "turn"), { body: { ...input, prompt: "Changed replay must not execute." } })).status).toBe(409);
  expect(f.jsonlBytes()).toEqual(afterResume);
  expect(f.history(id).events.filter(row => row.event_type === "request/header")).toHaveLength(2);
  const newInput = { clientRequestId: randomUUID(), expectedRevision: 2, prompt: "New authorized JSONL turn." };
  expect((await f.request(f.taskPath(task.taskId, "turn"), { body: newInput })).status).toBe(202);
  task = await f.settle(task.taskId); expect(task.sessionId).toBe(id); expect(task.revision).toBe(3);
  const checked = await f.control(task.taskId, "verify", 3); expect(checked.body.data.state).toBe("closed");
  expect((await f.control(task.taskId, "resume", 3)).status).toBe(409);
  expect((await f.control(task.taskId, "archive", 3)).body.data.archived).toBe(true);
  expect((await f.control(task.taskId, "resume", 3)).status).toBe(409);
  writeFileSync(join(f.root, "new-http-resume-receipt.json"), JSON.stringify({ scope: "built source HTTP JSONL recovery, fixture identities and stub only",
    sessionId: id, killedPid, actualExitObserved: true, prefixUnchanged: true, originalRequestIds: [original.clientRequestId, input.clientRequestId], archivedRefusal: true }, null, 2));
}, 90_000);

// Opt-in real-browser scenario: registered only with AMC_JSONL_RESUME_BROWSER=1 so the mandatory profile never reports it as skipped.
if (process.env.AMC_JSONL_RESUME_BROWSER === "1") test("actual Chromium JSONL Resume and lost-control refresh preserve one ownership transfer", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const { NativeTasksPage } = await import("./e2e/native-tasks-page.mjs");
  const f = await fixture();
  const browser = await chromium.launch({ headless: true, ...(process.env.AMC_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AMC_TEST_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage();
  const ui = new NativeTasksPage(page, browserExpect.configure({ timeout: 20_000 }), f.base, "default");
  const receipt: Record<string, unknown> = { scope: "real Chromium, built source Studio, automated fixture owner and local stub; not installed or human evidence", ok: false };
  const posts: string[] = []; page.on("request", request => { if (request.method() === "POST") posts.push(new URL(request.url()).pathname); });
  try {
    await ui.open(f.identities.owner); const admitted = await ui.create("JSONL browser original history.");
    let task = await f.settle(admitted.taskId); await page.locator("#nativeTaskRefresh").click();
    await browserExpect(page.locator("#nativeTaskRelease")).toBeVisible(); await ui.control("release");
    await f.restart(); await page.reload();
    await browserExpect(page.locator('[data-native-recovery-state="ready"]')).toBeVisible();
    await browserExpect(page.locator("#nativeTaskResume")).toBeEnabled(); const prefix = f.jsonlBytes();
    const pattern = `**/api/v1/native-tasks/${task.taskId}/resume?*`;
    await page.route(pattern, async route => {
      const response = await route.fetch({ maxRetries: 0 }); assert.equal(response.status(), 200);
      assert.equal((await response.json()).data.sessionId, task.sessionId); await route.abort("connectionreset");
    });
    await page.locator("#nativeTaskResume").click();
    await browserExpect(page.locator("#nativeTaskSubmit")).toBeDisabled();
    await browserExpect(page.locator("#nativeTaskNotice")).toContainText(/refresh/i);
    await page.unroute(pattern);
    const transfers = f.history(task.sessionId!).events.filter(row => row.event_type === "session/resume").length;
    expect(transfers).toBe(1); expect(posts.filter(path => path.endsWith("/resume"))).toHaveLength(1);
    expect(f.jsonlBytes().subarray(0, prefix.length)).toEqual(prefix);
    await page.locator("#nativeTaskRefresh").click(); task = await ui.ready();
    expect(task.sessionId).toBe(admitted.sessionId); expect(f.history(task.sessionId!).events.filter(row => row.event_type === "session/resume")).toHaveLength(1);
    await page.locator("#nativeTaskPrompt").fill("Browser explicit resumed JSONL turn."); await page.locator("#nativeTaskSubmit").click();
    await browserExpect(page.locator("#nativeTaskTranscript")).toContainText("Browser explicit resumed JSONL turn.");
    await ui.ready(); await page.screenshot({ path: join(f.root, "jsonl-resume-browser.png"), fullPage: true });
    await ui.control("release");
    Object.assign(receipt, { ok: true, browser: browser.version(), sessionId: task.sessionId, ownershipTransfers: transfers, lostResponseRefreshRequired: true, prefixUnchanged: true });
  } catch (error) { receipt.failure = String(error); throw error; }
  finally { await context.close(); await browser.close(); receipt.browserClosed = true; writeFileSync(join(f.root, "new-browser-resume-receipt.json"), JSON.stringify(receipt, null, 2)); }
}, 120_000);
