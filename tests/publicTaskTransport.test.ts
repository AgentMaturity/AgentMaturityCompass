import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { publicTaskHttpFixture, type PublicTaskFixture } from "./helpers/publicTaskHttpFixture.js";

const fixtures: PublicTaskFixture[] = [];
async function fixture(backend: "sqlite" | "jsonl" = "sqlite") {
  const f = await publicTaskHttpFixture("success", backend); fixtures.push(f); return f;
}
afterEach(async () => { for (const f of fixtures.splice(0).reverse()) await f.close(); });

test("actual authenticated HTTP refuses ambiguous query selection before native admission or controls", async () => {
  const f = await fixture(), input = f.input();
  for (const query of ["?agentId=default", "?workspace=other", "?x=1&x=2"]) {
    const result = await f.request(`/api/v1/native-tasks${query}`, { body: input });
    expect(result.status).toBe(400); expect(result.body.code).toBe("NATIVE_QUERY_INVALID");
  }
  for (const query of ["agentId=default&agentId=other", "agentId=default&cursor=0", "nativeCsrfToken=private"]) {
    expect((await f.request(`/api/v1/native-tasks/options?${query}`)).status).toBe(400);
  }
  expect((await f.request("/api/v1/native-tasks", { body: input, headers: { "x-amc-native-csrf": undefined } })).status).toBe(403);
  expect((await f.request("/api/v1/native-tasks", { body: input, identity: "viewer" })).status).toBe(403);
  const admission = await f.request("/api/v1/native-tasks", { body: input }); expect(admission.status).toBe(202);
  const task = await f.settle(admission.body.data.taskId), before = f.history(task.sessionId!).events;
  expect(task.history).toMatchObject({ status: "authenticated", backend: "sqlite" });
  for (const query of ["agentId=default&agentId=other", "agentId=default&cursor=0&cursor=1", "agentId=default&command=whoami"]) {
    expect((await f.request(`/api/v1/native-tasks/${task.taskId}?${query}`)).status).toBe(400);
  }
  for (const action of ["turn", "cancel", "release", "resume", "verify", "archive"]) {
    const body = action === "turn" ? { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Not admitted." } : { expectedRevision: 1 };
    const denied = await f.request(`${f.taskPath(task.taskId, action)}&agentId=other`, { body });
    expect(denied.status).toBe(400); expect(denied.body.code).toBe("NATIVE_QUERY_INVALID");
    expect((await f.request(f.taskPath(task.taskId, action), { identity: "other", body })).status).toBe(404);
  }
  expect(f.history(task.sessionId!).events).toEqual(before);
}, 60_000);

test("actual HTTP admitted follow-up lost acknowledgement remains exact across restart and stale controls refuse", async () => {
  const f = await fixture();
  const start = await f.request("/api/v1/native-tasks", { body: f.input() });
  let task = await f.settle(start.body.data.taskId);
  const original = { clientRequestId: randomUUID(), expectedRevision: task.revision, prompt: "An admitted follow-up whose response is discarded." };
  const lost = await f.request(f.taskPath(task.taskId, "turn"), { body: original }); expect(lost.status).toBe(202);
  task = await f.settle(task.taskId); const before = f.history(task.sessionId!).events;
  expect(before.filter(row => row.event_type === "request/header")).toHaveLength(2);
  const replay = await f.request(f.taskPath(task.taskId, "turn"), { body: original });
  expect(replay.status).toBe(202); expect(replay.body.data.revision).toBe(2);
  const conflict = await f.request(f.taskPath(task.taskId, "turn"), { body: { ...original, prompt: "Changed body must not run." } });
  expect(conflict.status).toBe(409); expect(conflict.body.code).toBe("NATIVE_REQUEST_CONFLICT");
  for (const action of ["cancel", "release", "resume", "verify", "archive"]) {
    const stale = await f.control(task.taskId, action, 1);
    expect(stale.status).toBe(409); expect(stale.body.code).toBe("NATIVE_STALE_REVISION");
  }
  expect(f.history(task.sessionId!).events).toEqual(before);
  expect((await f.control(task.taskId, "release", 2)).status).toBe(200);
  await f.restart(); const cold = await f.poll(task.taskId);
  expect(cold.task.history.status).toBe("authenticated"); expect(cold.events.some(e => e.text === original.prompt)).toBe(true);
  const coldBefore = f.history(task.sessionId!).events;
  expect((await f.request(f.taskPath(task.taskId, "turn"), { body: original })).status).toBe(202);
  expect(f.history(task.sessionId!).events).toEqual(coldBefore);
}, 60_000);

test("JSONL HTTP cold history grants only eligible explicit recovery and withdraws displays after tampering", async () => {
  const f = await fixture("jsonl");
  const admitted = await f.request("/api/v1/native-tasks", { body: f.input() });
  let task = await f.settle(admitted.body.data.taskId);
  const released = await f.control(task.taskId, "release", task.revision); expect(released.status).toBe(200);
  await f.restart(); task = (await f.poll(task.taskId)).task;
  expect(task.history.backend).toBe("jsonl"); expect(task.canResume).toBe(true);
  expect(task.recovery).toMatchObject({ eligible: true, state: "ready" });
  const before = f.jsonlBytes();
  const resumed = await f.control(task.taskId, "resume", task.revision);
  expect(resumed.status).toBe(200); expect(resumed.body.data.state).toBe("idle"); expect(resumed.body.data.sessionId).toBe(task.sessionId);
  expect(f.jsonlBytes().subarray(0, before.length)).toEqual(before);
  expect(f.history(task.sessionId!).events.filter(row => row.event_type === "request/header")).toHaveLength(1);
  // Verification may legitimately refuse an unsealed archive; its label must
  // never survive loss of authentic history, regardless of its previous value.
  await f.control(task.taskId, "verify", task.revision);
  const path = join(f.workspace, ".amc/jsonl/events.jsonl"), authentic = f.jsonlBytes();
  const lines = authentic.toString("utf8").trimEnd().split("\n"); const row = JSON.parse(lines[0]!); row.writer_sig = "unsigned"; lines[0] = JSON.stringify(row);
  try {
    writeFileSync(path, lines.join("\n") + "\n"); await new Promise(done => setTimeout(done, 300));
    const invalid = await f.poll(task.taskId, task.nextCursor);
    expect(invalid.task.history.status).toBe("unavailable"); expect(invalid.task.verification).toBe("not-verified");
    expect(invalid.events).toEqual([]); expect(invalid.task.approvals).toEqual([]); expect(invalid.task.validationOutputs).toEqual([]);
    expect(invalid.task.canResume).toBe(false); expect(invalid.truncated).toBe(true);
  } finally { writeFileSync(path, authentic); }
  expect((await f.poll(task.taskId)).task.history.status).toBe("authenticated");
}, 60_000);

test.runIf(process.env.AMC_PUBLIC_TASK_BROWSER === "1" && process.platform === "darwin")("real Chromium public validation, lost-ACK and evidence reconnect controls", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const { runPublicTaskBrowser } = await import("./e2e/public-task-transport-browser.mjs");
  const browser = await chromium.launch({ headless: true,
    ...(process.env.AMC_TEST_BROWSER_EXECUTABLE ? { executablePath: process.env.AMC_TEST_BROWSER_EXECUTABLE } : {}) });
  try { await runPublicTaskBrowser({ browser, expect: browserExpect.configure({ timeout: 15_000 }), createFixture: publicTaskHttpFixture }); }
  finally { await browser.close(); }
}, 240_000);

test("a successful HTTP verifier label is withdrawn on evidence loss and is not restored by a metadata read", async () => {
  const f = await fixture("jsonl");
  const start = await f.request("/api/v1/native-tasks", { body: f.input("Closed task verification freshness.") });
  const task = await f.settle(start.body.data.taskId);
  const verified = await f.control(task.taskId, "verify", task.revision);
  expect(verified.status).toBe(200);
  expect(verified.body.data.verification, JSON.stringify(verified.body)).toBe("workspace-key-consistency");
  const path = join(f.workspace, ".amc/jsonl/events.jsonl"), original = f.jsonlBytes();
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from('{"torn":')]));
    const unavailable = await f.poll(task.taskId, verified.body.data.nextCursor);
    expect(unavailable.task.history.status).toBe("unavailable");
    expect(unavailable.task.verification).toBe("not-verified"); expect(unavailable.events).toEqual([]);
  } finally { writeFileSync(path, original); }
  const restored = await f.poll(task.taskId);
  expect(restored.task.history.status).toBe("authenticated"); expect(restored.task.verification).toBe("not-verified");
}, 60_000);
