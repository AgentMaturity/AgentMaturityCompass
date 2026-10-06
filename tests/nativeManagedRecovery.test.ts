import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { openLedger } from "../src/ledger/ledger.js";
import { readBudgetEvents } from "../src/budgets/nativeBudgetUsage.js";
import { publicTaskHttpFixture, type PublicTaskFixture } from "./helpers/publicTaskHttpFixture.js";

const fixtures: PublicTaskFixture[] = [];
async function fixture(backend: "sqlite" | "jsonl") { const f = await publicTaskHttpFixture("success", backend); fixtures.push(f); return f; }
afterEach(async () => { for (const f of fixtures.splice(0).reverse()) await f.close(); });
const headers = (f: PublicTaskFixture, id: string) => f.history(id).events.filter(row => row.event_type === "request/header");
function budgets(f: PublicTaskFixture) {
  const ledger = openLedger(f.workspace, { readonly: true });
  try { return readBudgetEvents(f.workspace, ledger).filter(row => row.event_type.startsWith("request/")
    || ["NATIVE_BUDGET_RESERVATION", "TOOL_CALL_ALLOWED", "TOOL_CALL_FAILED", "TOOL_CALL_DENIED"].includes(String(JSON.parse(row.meta_json).auditType))); }
  finally { ledger.close(); }
}
async function sdk() { return import(pathToFileURL(resolve("dist/sdk/nativeAgentClient.js")).href) as Promise<typeof import("../src/sdk/nativeAgentClient.js")>; }
function clientOptions(f: PublicTaskFixture) { return { workspace: f.workspace, provider: "stub", agentId: "default",
  credentialsMode: "operator-only" as const, credentialsHome: join(f.root, "operator-home"),
  credentialsFile: join(f.root, "operator-home", "credentials.yaml"), maxSteps: 3, maxTokens: 128, timeoutMs: 20_000, env: { ...process.env } }; }

/** Only the authenticated initial native writer in this new fixture may be killed. */
async function interrupt(f: PublicTaskFixture, id: string) {
  const rows = f.history(id).events, opening = rows[0]!;
  const first = JSON.parse(opening.meta_json).amcSessionWriter, owner = JSON.parse(rows.at(-1)!.meta_json).amcSessionWriter;
  assert.equal(opening.event_type, "session/open"); assert.equal(opening.session_id, id);
  assert.equal(owner.pid, first.pid); assert.equal(owner.token, first.token); assert.equal(owner.hostId, hostname());
  assert.equal(owner.state, "active"); assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0 && owner.pid !== process.pid);
  process.kill(owner.pid, "SIGKILL"); const deadline = Date.now() + 10_000;
  for (;;) {
    try { process.kill(owner.pid, 0); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; break; }
    assert.ok(Date.now() < deadline, "Fixture ACP writer must actually exit"); await new Promise(done => setTimeout(done, 25));
  }
  writeFileSync(join(f.root, "writer-exit.json"), JSON.stringify({ sessionId: id, pid: owner.pid, actualExitObserved: true }));
  return owner.pid as number;
}
async function resumable(f: PublicTaskFixture, id: string) {
  const deadline = Date.now() + 10_000;
  for (;;) { const { task } = await f.poll(id); if (task.canResume) return task;
    assert.ok(Date.now() < deadline, `Dead native client was not reconciled: ${JSON.stringify(task)}`);
    await new Promise(done => setTimeout(done, 75)); }
}

test.each(["sqlite", "jsonl"] as const)("same Studio explicitly reattaches a dead %s writer without restarting or replaying", async backend => {
  const f = await fixture(backend), input = f.input("Original same-Studio native recording.");
  const admitted = await f.request("/api/v1/native-tasks", { body: input }); expect(admitted.status).toBe(202);
  const first = await f.settle(admitted.body.data.taskId), id = first.sessionId!;
  expect(first.state).toBe("idle"); expect(first.canResume).toBe(false);
  const prior = f.history(id).events, oldBudgets = budgets(f);
  const descriptorPath = join(f.workspace, ".amc", "studio-native-tasks", `${first.taskId}.json`), descriptor = readFileSync(descriptorPath);
  const pid = await interrupt(f, id), cold = await resumable(f, first.taskId);
  expect(cold).toMatchObject({ state: "failed", sessionId: id, revision: 1, clientRequestId: input.clientRequestId });
  expect(cold.error).toContain("runtime process exited");
  expect((await f.request(f.taskPath(first.taskId, "turn"), { body: { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Not admitted before explicit resume." } })).status).toBe(409);
  expect((await f.control(first.taskId, "resume", 0)).status).toBe(400);
  expect((await f.request(f.taskPath(first.taskId, "resume"), { identity: "other", body: { expectedRevision: 1 } })).status).toBe(404);
  expect((await f.request(f.taskPath(first.taskId, "resume"), { body: { expectedRevision: 1 }, headers: { "x-amc-native-csrf": undefined } })).status).toBe(403);
  expect((await f.request("/api/v1/native-tasks", { body: input })).body.data.sessionId).toBe(id);
  expect(readFileSync(descriptorPath)).toEqual(descriptor); expect(f.history(id).events).toEqual(prior); expect(budgets(f)).toEqual(oldBudgets);
  expect((await f.control(first.taskId, "resume", 1)).body.data).toMatchObject({ state: "idle", sessionId: id, revision: 1 });
  expect(f.history(id).events.slice(0, prior.length)).toEqual(prior); expect(headers(f, id)).toHaveLength(1); expect(budgets(f)).toEqual(oldBudgets);
  expect((await f.control(first.taskId, "resume", 1)).body.data.state).toBe("idle");
  expect(f.history(id).events.filter(row => row.event_type === "session/resume")).toHaveLength(1);
  expect((await f.request(f.taskPath(first.taskId, "turn"), { body: { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "New explicit same-session turn." } })).status).toBe(202);
  const second = await f.settle(first.taskId); expect(second).toMatchObject({ state: "idle", sessionId: id, revision: 2 });
  expect(headers(f, id)).toHaveLength(2);
  expect((await f.control(first.taskId, "verify", 2)).body.data.state).toBe("closed");
  expect((await f.control(first.taskId, "resume", 2)).status).toBe(409);
  writeFileSync(join(f.root, "managed-recovery.json"), JSON.stringify({ backend, pid, sessionId: id, restartedStudio: false,
    explicitResume: true, prefixUnchanged: true, budgetPrefixUnchanged: true, requestsBeforeNewTurn: 1, requestsAfterNewTurn: 2,
    scope: "built source, real cookie HTTP/ACP, local stub; not installed or provider/human qualification" }, null, 2));
}, 100_000);

// The validation check runs through the native shell inside a Studio-spawned
// ACP process, whose environment is an allowlist, so the platform cannot be
// pinned there. macOS offers the shell through the fixture's signed opt-in on
// every Mac; Linux would depend on the host's Bubblewrap (P0-06). Darwin-only
// for the same reason as nativeValidationOutcomeSurfaces.
test.runIf(process.platform === "darwin").each(["sqlite", "jsonl"] as const)("reattached %s native controller retains approval quorum, accounting and validation pins", async backend => {
  const f = await fixture(backend), input = f.input("Original native validation controller.", true);
  const admitted = await f.request("/api/v1/native-tasks", { body: input }); expect(admitted.status).toBe(202);
  const first = await f.settle(admitted.body.data.taskId), id = first.sessionId!;
  expect(first.state).toBe("idle"); expect(first.validation.status).toBe("passed"); expect(f.operator.effect()).toBe("validation-outcome");
  const original = f.history(id).events, oldBudgets = budgets(f), beforeHeaders = headers(f, id).length;
  const firstApprovals = new Set(f.observations.filter(row => String(row.path).includes("/approve")).map(row => row.path));
  await interrupt(f, id); await resumable(f, first.taskId);
  const client = await (await sdk()).AMCNativeClient.start({ ...clientOptions(f), tools: "workspace", expectedToolsDigest: f.operator.toolsDigest,
    validationConfig: f.operator.checks, validationConfigSha256: f.operator.sha256, validate: ["public"] });
  try { await expect(client.resumeSession(id)).rejects.toThrow(); } finally { await client.close(); }
  expect(f.history(id).events).toEqual(original);
  const checkBytes = readFileSync(f.operator.checks);
  writeFileSync(f.operator.checks, Buffer.concat([checkBytes, Buffer.from("\n")]));
  try {
    // The existing managed-control API returns the failed task view for an
    // asynchronous preparation refusal; HTTP 200 is not a successful resume.
    const refused = await f.control(first.taskId, "resume", 1);
    expect(refused.status).toBe(200);
    expect(refused.body.data).toMatchObject({ state: "failed", sessionId: id, revision: 1 });
    expect(refused.body.data.error).toContain("Native resume was refused");
    expect(f.history(id).events).toEqual(original); expect(budgets(f)).toEqual(oldBudgets);
  }
  finally { writeFileSync(f.operator.checks, checkBytes); }
  expect((await f.control(first.taskId, "resume", 1)).body.data).toMatchObject({ state: "idle", sessionId: id, revision: 1 });
  expect(headers(f, id)).toHaveLength(beforeHeaders); expect(budgets(f)).toEqual(oldBudgets);
  expect(f.history(id).events.slice(0, original.length)).toEqual(original);
  expect((await f.request(f.taskPath(first.taskId, "turn"), { body: { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "New explicitly validated turn." } })).status).toBe(202);
  const second = await f.settle(first.taskId); expect(second).toMatchObject({ state: "idle", sessionId: id, revision: 2 });
  expect(second.validation.status).toBe("passed"); expect(second.validation.turn).toBe(2);
  expect(second.validationSelection).toEqual(first.validationSelection);
  const newDecisions = f.observations.filter(row => String(row.path).includes("/approve") && !firstApprovals.has(row.path));
  expect(newDecisions.length).toBeGreaterThanOrEqual(2); expect(new Set(newDecisions.map(row => row.identity))).toEqual(new Set(["ada", "grace"]));
  expect(f.operator.effect()).toBe("validation-outcome");
  await f.control(first.taskId, "verify", 2);
  writeFileSync(join(f.root, "native-controller-recovery.json"), JSON.stringify({ backend, sessionId: id, sameStudio: true,
    originalApprovalRemovalRefused: true, changedValidationPinRefused: true, newApproverIdentities: [...new Set(newDecisions.map(row => row.identity))],
    validation: second.validation, scope: "built source, real native controller, automated fixture approvers and local stub only" }, null, 2));
}, 120_000);

test("SDK observes actual process closure without equating a live idle child to a released writer", async () => {
  const f = await fixture("sqlite"), client = await (await sdk()).AMCNativeClient.start(clientOptions(f));
  try {
    expect(client.processClosed).toBe(false); const session = await client.newSession();
    await session.prompt("Observed process lifecycle fixture.").result; expect(client.processClosed).toBe(false);
    await session.release(); expect(client.processClosed).toBe(false);
    await client.close(); expect(client.processClosed).toBe(true);
  } finally { await client.close(); }
}, 60_000);

// Opt-in real-browser scenario: registered only with AMC_RECOVERY_CONTROL_BROWSER=1 so the mandatory profile never reports it as skipped.
if (process.env.AMC_RECOVERY_CONTROL_BROWSER === "1") test("Chromium restores a dead native controller in the same Studio and reconciles a lost resume response", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const { NativeTasksPage } = await import("./e2e/native-tasks-page.mjs");
  const f = await fixture("jsonl");
  const browser = await chromium.launch({ headless: true, ...(process.env.AMC_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AMC_TEST_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ serviceWorkers: "block" }), page = await context.newPage();
  const ui = new NativeTasksPage(page, browserExpect.configure({ timeout: 20_000 }), f.base, "default");
  const receipt: Record<string, unknown> = { ok: false, scope: "built-source actual Chromium/native cookie; automated fixture, not human or installed qualification" };
  try {
    await ui.open(f.identities.owner); const admitted = await ui.create("Same Studio original browser recording."); await ui.ready();
    const id = admitted.sessionId!, prior = f.history(id).events;
    await interrupt(f, id); await resumable(f, admitted.taskId);
    await page.locator("#nativeTaskRefresh").click(); await browserExpect(page.locator("#nativeTaskResume")).toBeEnabled();
    await browserExpect(page.locator("#nativeTaskSubmit")).toBeDisabled(); expect(f.history(id).events).toEqual(prior);
    const pattern = `**/api/v1/native-tasks/${admitted.taskId}/resume?*`;
    await page.route(pattern, async route => { const response = await route.fetch({ maxRetries: 0 }); assert.equal(response.status(), 200); await route.abort("connectionreset"); });
    await page.locator("#nativeTaskResume").click();
    await browserExpect(page.locator("#nativeTaskNotice")).toContainText(/refresh/i); await browserExpect(page.locator("#nativeTaskSubmit")).toBeDisabled();
    await page.unroute(pattern); await page.locator("#nativeTaskRefresh").click(); const restored = await ui.ready();
    expect(restored.sessionId).toBe(id); expect(headers(f, id)).toHaveLength(1);
    expect(f.history(id).events.filter(row => row.event_type === "session/resume")).toHaveLength(1);
    await page.locator("#nativeTaskPrompt").fill("Explicit browser continuation after reattachment."); await page.locator("#nativeTaskSubmit").click();
    await browserExpect(page.locator("#nativeTaskTranscript")).toContainText("Explicit browser continuation after reattachment."); await ui.ready();
    await page.screenshot({ path: join(f.root, "same-studio-recovery.png"), fullPage: true }); await ui.control("release");
    Object.assign(receipt, { ok: true, sessionId: id, browser: browser.version(), studioRestarted: false, ownershipTransfers: 1, modelHeaders: headers(f, id).length });
  } catch (error) { receipt.failure = String(error); throw error; }
  finally { await context.close(); await browser.close(); receipt.browserClosed = true; writeFileSync(join(f.root, "managed-recovery-browser.json"), JSON.stringify(receipt, null, 2)); }
}, 120_000);
