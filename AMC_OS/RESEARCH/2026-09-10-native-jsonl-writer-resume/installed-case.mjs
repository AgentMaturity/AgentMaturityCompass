// Run only from the newly installed consumer. No source-tree/private AMC imports.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initWorkspace, initBudgets, startStudioApiServer } from "agent-maturity-compass";
import { AMCNativeClient, loadSessionEventHistory, inspectJsonlSessionRecovery } from "agent-maturity-compass/sdk/native";

const root = resolve(process.argv[2]);
mkdirSync(root, { recursive: false });
const receipt = { scope: "new installed local tarball: supported public SDK, actual packaged ACP CLI, admin-authenticated public HTTP; deterministic stub only",
  sourceCommit: process.env.AMC_ACCEPTANCE_SOURCE, ok: false, startedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch }, imports: {}, checks: [], pids: [], ports: [],
  nonClaims: ["cookie/browser installed qualification", "real provider/human", "tool approval installed scenarios", "full suite", "prepack/release", "publication/deployment", "old retained-output aggregate"] };
for (const specifier of ["agent-maturity-compass", "agent-maturity-compass/sdk/native"]) {
  const path = realpathSync(fileURLToPath(import.meta.resolve(specifier)));
  assert.ok(path.startsWith(realpathSync(join(process.cwd(), "node_modules")) + "/"), `not the newly installed package: ${path}`);
  receipt.imports[specifier] = { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
}
const clients = [], livePids = new Set();
let server;
function save() { writeFileSync(join(root, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n"); }
function history(workspace, sessionId, extra = {}) { return loadSessionEventHistory({ workspace, sessionId, ...extra }); }
function bytes(workspace) { return readFileSync(join(workspace, ".amc", "jsonl", "events.jsonl")); }
function owner(workspace, sessionId) {
  const rows = history(workspace, sessionId).events;
  const signed = JSON.parse(rows.at(-1).meta_json).amcSessionWriter;
  assert.equal(signed.hostId, hostname()); assert.equal(signed.state, "active");
  assert.ok(Number.isSafeInteger(signed.pid) && signed.pid > 0 && signed.pid !== process.pid);
  livePids.add(signed.pid); if (!receipt.pids.includes(signed.pid)) receipt.pids.push(signed.pid); save(); return signed;
}
async function observeExit(pid) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === "ESRCH") { livePids.delete(pid); return; } throw error; }
    assert.ok(Date.now() < deadline, `owned installed writer ${pid} did not exit`);
    await new Promise(done => setTimeout(done, 25));
  }
}
async function interrupt(workspace, sessionId) {
  const original = JSON.parse(history(workspace, sessionId).events[0].meta_json).amcSessionWriter;
  const current = owner(workspace, sessionId);
  assert.equal(current.pid, original.pid); assert.equal(current.token, original.token);
  process.kill(current.pid, "SIGKILL"); await observeExit(current.pid); return current.pid;
}
function workspace(name) {
  const path = join(root, name); mkdirSync(path);
  process.env.AMC_HOME = join(root, `${name}-operator`);
  process.env.AMC_CONTROL_CHECKPOINT_DIR = join(root, `${name}-checkpoints`);
  process.env.AMC_VAULT_PASSPHRASE = `new-local-fixture-${randomUUID()}`;
  process.env.AMC_VAULT_REMEMBER = "0"; process.env.AMC_SESSION_STORE = "jsonl";
  initWorkspace({ workspacePath: path, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(path, "default"); return path;
}
async function client(ws, changes = {}) {
  const value = await AMCNativeClient.start({ workspace: ws, agentId: "default", provider: "stub", tools: "none",
    credentialsMode: "operator-only", credentialsHome: process.env.AMC_HOME, maxSteps: 3, maxTokens: 128,
    timeoutMs: 20_000, env: { ...process.env }, ...changes }); clients.push(value); return value;
}
try {
  save(); const ws = workspace("sdk-workspace");
  const first = await client(ws), session = await first.newSession();
  const firstResult = await session.prompt("Installed original JSONL output.").result;
  assert.match(firstResult.text, /Installed original JSONL output/);
  const id = session.sessionId, prefix = bytes(ws);
  const contender = await client(ws); await assert.rejects(contender.resumeSession(id)); await contender.close();
  assert.deepEqual(bytes(ws), prefix);
  const deadPid = await interrupt(ws, id); await first.close();
  assert.equal(inspectJsonlSessionRecovery({ workspace: ws, sessionId: id, agentId: "default" }).eligible, true);
  const changed = await client(ws, { maxSteps: 2 }); await assert.rejects(changed.resumeSession(id)); await changed.close();
  assert.deepEqual(bytes(ws), prefix);
  const next = await client(ws), resumed = await next.resumeSession(id); owner(ws, id);
  assert.equal(resumed.sessionId, id); assert.ok(resumed.history.some(row => JSON.stringify(row).includes("Installed original JSONL output")));
  assert.deepEqual(bytes(ws).subarray(0, prefix.length), prefix);
  assert.equal(history(ws, id).events.filter(row => row.event_type === "request/header").length, 1);
  const result = await resumed.prompt("Installed explicit resumed JSONL output.").result;
  assert.match(result.text, /Installed explicit resumed JSONL output/); assert.equal(result.verification, "not-verified");
  await next.close();
  const sealed = history(ws, id, { verifyPayloads: true, requireSealed: true });
  assert.equal(sealed.events.filter(row => row.event_type === "session/open").length, 1);
  assert.equal(sealed.events.filter(row => row.event_type === "request/header").length, 2);
  const closed = await client(ws); await assert.rejects(closed.resumeSession(id)); await closed.close();
  receipt.checks.push({ name: "installed-sdk-actual-writer-death-and-resume", sessionId: id, deadPid,
    sameSession: true, unchangedPrefixSha256: createHash("sha256").update(prefix).digest("hex"), originalModelCalls: 1, finalModelCalls: 2,
    liveOwnerRefused: true, changedConfigurationRefused: true, closedRefused: true }); save();

  const httpWs = workspace("http-workspace");
  // Supported public native startup pins JSONL for the managed child, whose
  // environment deliberately does not accept arbitrary parent backend overrides.
  const seed = await client(httpWs); await seed.newSession(); await seed.close();
  const adminToken = randomUUID();
  async function listen(port = 0) {
    server = await startStudioApiServer({ workspace: httpWs, host: "127.0.0.1", port, token: adminToken });
    receipt.ports.push(server.port); save(); return server.url;
  }
  let base = await listen();
  async function request(path, body, overrides = {}) {
    const headers = { "x-amc-admin-token": adminToken, "content-type": "application/json", connection: "close",
      ...(body === undefined ? {} : { "x-amc-native-intent": "task-workspace-v1" }) };
    for (const [key, value] of Object.entries(overrides)) { if (value === null) delete headers[key]; else headers[key] = value; }
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000) });
    return { status: response.status, body: await response.json() };
  }
  const taskPath = (id, action = "") => `/api/v1/native-tasks/${id}${action ? "/" + action : ""}?agentId=default`;
  async function poll(id) { const response = await request(taskPath(id)); assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data.task; }
  async function settle(id) {
    const deadline = Date.now() + 30_000;
    for (;;) { const task = await poll(id); if (["idle", "released", "closed", "failed"].includes(task.state)) return task;
      assert.ok(Date.now() < deadline, "installed task did not settle"); await new Promise(done => setTimeout(done, 50)); }
  }
  const admitted = { clientRequestId: randomUUID(), agentId: "default", provider: "stub", tools: "none", prompt: "Installed HTTP original.", maxSteps: 3, maxTokens: 128 };
  const started = await request("/api/v1/native-tasks", admitted); assert.equal(started.status, 202, JSON.stringify(started.body));
  let task = await settle(started.body.data.taskId); assert.equal(task.state, "idle", JSON.stringify(task));
  const follow = { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Installed HTTP original follow-up." };
  assert.equal((await request(taskPath(task.taskId, "turn"), follow)).status, 202);
  task = await settle(task.taskId); assert.equal(task.revision, 2); assert.equal(task.state, "idle", JSON.stringify(task));
  const httpPrefix = bytes(httpWs), httpId = task.sessionId;
  const httpDeadPid = await interrupt(httpWs, httpId), port = server.port;
  await server.close(); server = undefined; base = await listen(port);
  const cold = await poll(task.taskId); assert.equal(cold.sessionId, httpId); assert.equal(cold.canResume, true);
  assert.equal(cold.recovery.eligible, true); assert.equal(cold.clientRequestId, admitted.clientRequestId); assert.equal(cold.lastClientRequestId, follow.clientRequestId);
  for (const action of ["resume", "cancel", "release", "verify", "archive"]) {
    assert.equal((await request(taskPath(task.taskId, action), { expectedRevision: 1 })).status, 409);
  }
  assert.equal((await request(taskPath(task.taskId, "resume"), { expectedRevision: 2 }, { "x-amc-native-intent": null })).status, 403);
  assert.equal((await request(taskPath(task.taskId, "resume"), { expectedRevision: 2 }, { "x-amc-admin-token": "not-authorized" })).status, 401);
  assert.equal((await request(taskPath(task.taskId, "resume") + "&agentId=other", { expectedRevision: 2 })).status, 400);
  assert.equal((await request(taskPath(task.taskId, "resume"), { expectedRevision: 2, sessionId: "other" })).status, 400);
  assert.deepEqual(bytes(httpWs), httpPrefix);
  const accepted = await request(taskPath(task.taskId, "resume"), { expectedRevision: 2 });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body)); assert.equal(accepted.body.data.state, "idle", JSON.stringify(accepted.body));
  assert.equal(accepted.body.data.sessionId, httpId); owner(httpWs, httpId);
  const after = bytes(httpWs); assert.deepEqual(after.subarray(0, httpPrefix.length), httpPrefix);
  assert.equal((await request(taskPath(task.taskId, "turn"), follow)).status, 202);
  assert.equal((await request(taskPath(task.taskId, "turn"), { ...follow, prompt: "changed replay" })).status, 409);
  assert.deepEqual(bytes(httpWs), after);
  const nextInput = { clientRequestId: randomUUID(), expectedRevision: 2, prompt: "Installed HTTP resumed output." };
  assert.equal((await request(taskPath(task.taskId, "turn"), nextInput)).status, 202);
  task = await settle(task.taskId); assert.equal(task.state, "idle", JSON.stringify(task)); assert.equal(task.revision, 3);
  const verified = await request(taskPath(task.taskId, "verify"), { expectedRevision: 3 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body)); assert.equal(verified.body.data.state, "closed");
  assert.equal((await request(taskPath(task.taskId, "resume"), { expectedRevision: 3 })).status, 409);
  assert.equal((await request(taskPath(task.taskId, "archive"), { expectedRevision: 3 })).status, 200);
  assert.equal((await request(taskPath(task.taskId, "resume"), { expectedRevision: 3 })).status, 409);
  const finalHistory = history(httpWs, httpId, { verifyPayloads: true, requireSealed: true });
  assert.equal(finalHistory.events.filter(row => row.event_type === "session/open").length, 1);
  assert.equal(finalHistory.events.filter(row => row.event_type === "request/header").length, 3);
  receipt.checks.push({ name: "installed-authenticated-http-actual-death-restart-resume", sessionId: httpId, deadPid: httpDeadPid,
    sameSession: true, originalAdmittedIds: [admitted.clientRequestId, follow.clientRequestId], staleControlsRefused: true,
    missingIntentRefused: true, wrongIdentityRefused: true, changedBodyRefused: true, archivedRefused: true,
    unchangedPrefixSha256: createHash("sha256").update(httpPrefix).digest("hex"), originalModelCalls: 2, finalModelCalls: 3 });
  receipt.ok = true;
} catch (error) { receipt.failure = error.stack ?? String(error); console.error(receipt.failure); process.exitCode = 1; }
finally {
  try { await server?.close(); receipt.serverClosed = true; }
  catch (error) { receipt.serverClosureError = String(error); receipt.ok = false; process.exitCode = 1; }
  receipt.clientsClosed = true;
  for (const value of clients.reverse()) { try { await value.close(); } catch (error) { receipt.clientsClosed = false; receipt.ok = false; process.exitCode = 1; } }
  for (const pid of [...livePids]) { try { await observeExit(pid); } catch (error) { receipt.ok = false; receipt.processClosureError = String(error); process.exitCode = 1; } }
  receipt.allObservedWritersClosed = livePids.size === 0;
  receipt.endedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ ok: receipt.ok, receipt: join(root, "receipt.json"), checks: receipt.checks.length }));
}
