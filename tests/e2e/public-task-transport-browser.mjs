import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NativeTasksPage } from "./native-tasks-page.mjs";

/** New changed-boundary scenarios only. Every API response comes from real Studio. */
export async function runPublicTaskBrowser({ browser, expect, createFixture }) {
  const runs = [];
  for (const mode of ["success", "nonzero", "denied", "budget"]) {
    const f = await createFixture(mode, "sqlite");
    const out = join(f.root, "browser"); mkdirSync(out, { mode: 0o700 });
    const receipt = { scope: "actual Chromium and built Studio HTTP, automated fixture users and stub; not installed or human evidence",
      browser: browser.version(), mode, checks: [], requests: [], errors: [], cleanup: {}, ok: false };
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    await context.route("**/*", route => new URL(route.request().url()).origin === f.base ? route.continue() : route.abort("blockedbyclient"));
    const page = await context.newPage();
    page.on("pageerror", error => receipt.errors.push(error.message));
    page.on("request", request => {
      if (request.method() !== "POST" || !request.url().includes("/api/v1/native-tasks")) return;
      const body = request.postDataJSON();
      receipt.requests.push({ method: request.method(), path: new URL(request.url()).pathname,
        requestId: body.clientRequestId ?? null, revision: body.expectedRevision ?? null,
        csrfPresent: Boolean(request.headers()["x-amc-native-csrf"]), intent: request.headers()["x-amc-native-intent"] });
    });
    const ui = new NativeTasksPage(page, expect, f.base, "default");
    try {
      await ui.open(f.identities.owner);
      await page.locator("#nativeTaskProvider").selectOption("stub");
      await page.locator("#nativeTaskTools").selectOption("workspace");
      await page.locator('[data-native-validation-id="public"]').check();
      await page.locator("#nativeTaskPrompt").fill(`Automated public ${mode} validation task.`);
      const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/native-tasks");
      await page.locator("#nativeTaskSubmit").click();
      const admittedResponse = await response; assert.equal(admittedResponse.status(), 202);
      const admitted = (await admittedResponse.json()).data;
      let task = await f.settle(admitted.taskId);
      assert.equal(task.state, "idle", JSON.stringify(task));
      assert.equal(task.turnEndReason, "complete"); assert.equal(task.verification, "not-verified");
      const status = mode === "success" ? "passed" : mode === "nonzero" ? "failed" : "unavailable";
      assert.equal(task.validation.status, status);
      assert.equal(task.validation.checks[0].exitCode, mode === "success" ? 0 : mode === "nonzero" ? 7 : null);
      assert.equal(f.operator.effect(), mode === "success" || mode === "nonzero" ? "validation-outcome" : null);
      await expect(page.locator("#nativeTaskRefresh")).toBeEnabled(); await page.locator("#nativeTaskRefresh").click();
      await expect(page.locator("#nativeTaskValidation")).toContainText(mode === "success" ? "Selected checks passed" : mode === "nonzero" ? "Selected checks failed" : "Validation unavailable");
      await page.locator("#nativeTaskValidation summary").first().click();
      await expect(page.locator("#nativeTaskValidation")).toContainText(mode === "budget" ? "daily tool budget exhausted" : mode === "denied" ? "not approved" : "validation-outcome");
      const history = f.history(task.sessionId);
      assert.ok(history.events.some(row => row.id === task.validation.checks[0].outputEventId));
      assert.equal(history.events.filter(row => row.event_type === "tool/call").length, 1, "Do not hide the stub's separate model-tool request");
      receipt.checks.push({ name: "actual-http-browser-validation-outcome", status, taskId: task.taskId,
        sessionId: task.sessionId, outputEventId: task.validation.checks[0].outputEventId, historyHead: history.headEventHash });
      if (mode === "success") {
        // Deliver the real follow-up, then deliberately drop only its reply.
        // No fabricated successful body and no automatic replacement submission.
        let originalBody, lost = false;
        const turnPattern = `**/api/v1/native-tasks/${task.taskId}/turn?*`;
        await page.route(turnPattern, async route => {
          originalBody = route.request().postDataJSON();
          const actual = await route.fetch(); assert.equal(actual.status(), 202); lost = true;
          await route.abort("failed");
        }, { times: 1 });
        await expect(page.locator("#nativeTaskSubmit")).toBeEnabled();
        await page.locator("#nativeTaskPrompt").fill("Admitted browser follow-up with lost ACK.");
        await page.locator("#nativeTaskSubmit").click();
        await expect.poll(() => lost).toBe(true);
        await expect(page.locator("#nativeTaskNotice")).toContainText("Submission outcome unknown");
        await page.locator("#nativeTaskPrompt").fill("Edited draft must remain unsent.");
        task = await f.settle(task.taskId);
        await page.locator("#nativeTaskRefresh").click();
        await expect(page.locator("#nativeTaskRetry")).toBeHidden();
        await expect(page.locator("#nativeTaskPrompt")).toHaveValue("Edited draft must remain unsent.");
        const beforeReplay = f.history(task.sessionId).events;
        // Candidate-01 recorded three actual request headers across these two
        // stub turns; operator validation is not an additional model request.
        assert.equal(beforeReplay.filter(row => row.event_type === "request/header").length, 3);
        const replay = await f.request(f.taskPath(task.taskId, "turn"), { body: originalBody });
        assert.equal(replay.status, 202); assert.equal(replay.body.data.revision, task.revision);
        assert.deepEqual(f.history(task.sessionId).events, beforeReplay);
        const conflict = await f.request(f.taskPath(task.taskId, "turn"), { body: { ...originalBody, prompt: "Changed retry" } });
        assert.equal(conflict.status, 409); assert.equal(conflict.body.code, "NATIVE_REQUEST_CONFLICT");
        receipt.checks.push({ name: "admitted-followup-lost-ack-no-replay", revision: task.revision, originalId: originalBody.clientRequestId });
        const pollPattern = `**/api/v1/native-tasks/${task.taskId}?*`;
        await page.route(pollPattern, route => route.abort("failed"));
        await expect(page.locator("#nativeTaskRefresh")).toBeEnabled(); await page.locator("#nativeTaskRefresh").click();
        await expect(page.locator("#nativeTaskVerification")).toContainText("Current status is unconfirmed");
        await expect(page.locator("#nativeTaskState")).toHaveText("Status unconfirmed");
        await expect(page.locator("#nativeTaskSubmit")).toBeDisabled();
        await expect(page.locator("#nativeTaskVerify")).toBeDisabled();
        await expect(page.locator("#nativeTaskTranscript .native-task-event")).toHaveCount(0);
        await page.unroute(pollPattern);
        await page.locator("#nativeTaskRefresh").click();
        await expect(page.locator("#nativeTaskSubmit")).toBeEnabled();
        await expect(page.locator("#nativeTaskTranscript")).toContainText("Admitted browser follow-up with lost ACK.");
        assert.deepEqual(f.history(task.sessionId).events, beforeReplay);
        receipt.checks.push({ name: "failed-poll-withholds-actions-and-refresh-reloads-authentic-history" });
      }
      await page.screenshot({ path: join(out, "outcome.png"), fullPage: true });
      receipt.finalTask = await ui.task();
      assert.equal(receipt.errors.length, 0, JSON.stringify(receipt.errors)); receipt.ok = true;
    } catch (error) {
      receipt.failure = { message: String(error.message), stack: error.stack };
      await page.screenshot({ path: join(out, "failure.png"), fullPage: true }).catch(() => undefined);
      throw error;
    } finally {
      await context.close(); receipt.cleanup.contextClosed = true;
      try { await f.close(); receipt.cleanup.studioClosed = true; }
      finally { writeFileSync(join(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 }); runs.push({ root: f.root, ok: receipt.ok }); }
    }
  }
  // A distinct JSONL task: cold read is useful, but it grants no writer resume.
  const f = await createFixture("success", "jsonl");
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  const page = await context.newPage(), ui = new NativeTasksPage(page, expect, f.base, "default");
  const receipt = { browser: browser.version(), scope: "JSONL browser cold inspection and evidence loss; no private spill access", checks: [], ok: false, cleanup: {} };
  let restore;
  try {
    await ui.open(f.identities.owner); const admitted = await ui.create("JSONL browser history after restart.");
    let task = await f.settle(admitted.taskId);
    await expect(page.locator("#nativeTaskRefresh")).toBeEnabled(); await page.locator("#nativeTaskRefresh").click();
    await expect(page.locator("#nativeTaskRelease")).toBeVisible();
    await ui.control("release"); await f.restart(); await page.reload();
    await expect(page.locator("#nativeTaskIdentity")).toContainText("jsonl");
    await expect(page.locator("#nativeTaskResume")).toBeHidden();
    await expect(page.locator("#nativeTaskIdentity")).toContainText("writer resume is not supported");
    const before = f.jsonlBytes();
    const denied = await f.control(task.taskId, "resume", task.revision);
    assert.equal(denied.status, 409); assert.equal(denied.body.code, "NATIVE_RESUME_UNSUPPORTED"); assert.deepEqual(f.jsonlBytes(), before);
    receipt.checks.push({ name: "cold-jsonl-no-resume-control-or-dispatch", sessionId: task.sessionId });
    const path = join(f.workspace, ".amc/jsonl/events.jsonl"), original = readFileSync(path);
    const rows = original.toString("utf8").trimEnd().split("\n"); const row = JSON.parse(rows[0]); row.writer_sig = "unsigned"; rows[0] = JSON.stringify(row);
    restore = () => writeFileSync(path, original);
    writeFileSync(path, rows.join("\n") + "\n");
    await page.locator("#nativeTaskRefresh").click();
    await expect(page.locator("#nativeTaskIdentity")).toContainText("unavailable");
    await expect(page.locator("#nativeTaskState")).toHaveText("Evidence unavailable");
    await expect(page.locator("#nativeTaskVerification")).toContainText("No previous verification verdict is current");
    await expect(page.locator("#nativeTaskTranscript .native-task-event")).toHaveCount(0);
    await expect(page.locator("#nativeTaskResume")).toBeHidden();
    restore(); restore = undefined;
    await page.locator("#nativeTaskRefresh").click();
    await expect(page.locator("#nativeTaskTranscript")).toContainText("JSONL browser history after restart.");
    assert.deepEqual(f.jsonlBytes(), original);
    receipt.checks.push({ name: "tampered-history-withdrawn-and-authentic-bytes-restored" });
    receipt.ok = true;
  } catch (error) { receipt.failure = { message: String(error.message), stack: error.stack }; throw error; }
  finally {
    restore?.(); await context.close(); receipt.cleanup.contextClosed = true;
    try { await f.close(); receipt.cleanup.studioClosed = true; }
    finally { writeFileSync(join(f.root, "jsonl-browser-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 }); }
  }
  return runs;
}
