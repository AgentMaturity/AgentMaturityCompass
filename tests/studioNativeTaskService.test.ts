import { createHash, randomUUID } from "node:crypto";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, type PathLike, type StatSyncOptions } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { budgetsPath, initBudgets, loadBudgetsConfig, signBudgetsConfig } from "../src/budgets/budgets.js";
import YAML from "yaml";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/sdk/nativeAgentClient.js";
import { extractEnvelope } from "../src/session/sessionTypes.js";
import { NativeTaskDescriptors, nativeTaskId } from "../src/studio/nativeTaskDescriptors.js";
import type { NativeTaskActor, NativeTaskService, NativeTaskStart, NativeTaskView } from "../src/studio/nativeTaskTypes.js";

// Exercise the actual built SDK's own compiled CLI path, as an installed server does.
let createService: typeof import("../src/studio/nativeTaskService.js").createNativeTaskService;
beforeAll(async () => {
  const file = resolve("dist/studio/nativeTaskService.js");
  if (!existsSync(file)) throw new Error("Build the coordinated candidate before native Studio process tests.");
  const built = await import(pathToFileURL(file).href) as typeof import("../src/studio/nativeTaskService.js");
  createService = built.createNativeTaskService;
}, 60_000); // importing the built module can outlast the 10 s default on a loaded host
let root: string, credentialHome: string, prior: string | undefined;
const services: NativeTaskService[] = [];
const actor: NativeTaskActor = { principalId: "studio-test:owner", agentId: "default", demo: true };
const pass = "synthetic-studio-service-vault";
beforeEach(() => {
  prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = pass;
  root = mkdtempSync(join(tmpdir(), "amc-studio-service-"));
  // The operator home (also HOME, so ~/.amc/control-checkpoints) stays OUTSIDE the
  // governed workspace, as an installed operator's does (P0-57).
  credentialHome = mkdtempSync(join(tmpdir(), "amc-studio-operator-home-"));
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  const outcomes = await Promise.allSettled(services.splice(0).map(service => service.close()));
  lockVault(root); rmSync(root, { recursive: true, force: true }); rmSync(credentialHome, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
  expect(outcomes.filter(outcome => outcome.status === "rejected")).toEqual([]);
});
function service(workspace = root, extraEnvironment: Record<string, string> = {}): NativeTaskService {
  const value = createService({ workspace, credentialsHome: credentialHome, credentialsFile: join(credentialHome, ".credentials.yaml"),
    environment: { HOME: credentialHome, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass, ...extraEnvironment } });
  services.push(value); return value;
}
function input(prompt = "Record this synthetic native Studio turn."): NativeTaskStart {
  return { agentId: "default", clientRequestId: randomUUID(), provider: "stub", tools: "none", prompt, maxSteps: 2, maxTokens: 64 };
}

test("Studio offers a signed read-only subset without advertising unknown or misclassified tools", async () => {
  const config = defaultToolsConfig();
  config.tools.allowedTools = config.tools.allowedTools.filter(tool => ["fs.read", "glob", "grep"].includes(tool.name));
  config.tools.allowedTools.push({ name: "fs.write", actionClass: "READ_ONLY" }, { name: "unknown.tool", actionClass: "READ_ONLY" });
  initToolsConfig(root, config);
  initBudgets(root, "default"); initApprovalPolicy(root);
  writeRuntimeFirewallPolicy({ workspace: root, mode: "observe" });
  const s = service();
  const setup = await s.configuration({ ...actor, demo: false });
  expect(setup.scope.ready).toBe(true);
  expect(setup.scope.tools.map(tool => tool.name).sort()).toEqual(["fs.read", "glob", "grep"]);
  expect(setup.scope.message).toContain("Read-only tools are available");
  expect(setup.scope.message).toContain("WRITE_HIGH approval quorum");
  expect(setup.scope.approvalRequired).toBe(true);
  const demonstration = await s.configuration(actor);
  expect(demonstration.scope.ready).toBe(false);

  config.tools.allowedTools = [{ name: "fs.write", actionClass: "READ_ONLY" }];
  initToolsConfig(root, config);
  const incompatible = await s.configuration({ ...actor, demo: false });
  expect(incompatible.scope.ready).toBe(false);
  expect(incompatible.scope.tools).toEqual([]);
});
function rows(sessionId?: string | null) {
  const ledger = openLedger(root, { readonly: true });
  try { return ledger.getAllEvents().filter(row => !sessionId || row.session_id === sessionId); } finally { ledger.close(); }
}
async function idle(s: NativeTaskService, id: string): Promise<NativeTaskView> {
  const deadline = Date.now() + 25_000;
  for (;;) {
    const current = s.poll(actor, id).task;
    if (current.state === "idle" || current.state === "failed") { expect(current.error).toBeNull(); expect(current.state).toBe("idle"); return current; }
    if (Date.now() >= deadline) throw new Error("Native Studio task did not settle before the fixture deadline.");
    await new Promise(done => setTimeout(done, 50));
  }
}

test("real stub turns are committed once, survive release/restart/resume and cold verify", async () => {
  const s = service(), request = input("Synthetic first native Studio turn.");
  const [first] = await Promise.all([s.start(actor, request), s.start(actor, request)]);
  let task = await idle(s, first.taskId);
  expect(task.sessionId).toBeTruthy();
  const sessionId = task.sessionId!;
  expect(rows(sessionId).filter(row => row.event_type === "request/header")).toHaveLength(1);
  const firstPoll = s.poll(actor, task.taskId);
  expect(firstPoll.events.some(event => event.kind === "user" && event.text === request.prompt)).toBe(true);
  expect(firstPoll.events.some(event => event.kind === "assistant" && event.text.includes(request.prompt))).toBe(true);
  expect(firstPoll.events.every(event => event.evidence === "committed")).toBe(true);
  expect(s.poll(actor, task.taskId, firstPoll.task.nextCursor).events).toEqual([]);
  const turn = { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Synthetic second native Studio turn." };
  await s.turn(actor, task.taskId, turn); await s.turn(actor, task.taskId, turn);
  task = await idle(s, task.taskId);
  expect(task.revision).toBe(2);
  expect(rows(sessionId).filter(row => row.event_type === "request/header")).toHaveLength(2);
  await expect(s.turn(actor, task.taskId, { ...turn, prompt: "different" })).rejects.toMatchObject({ code: "NATIVE_REQUEST_CONFLICT" });
  expect(() => s.cancel(actor, task.taskId, 1)).toThrow("revision changed");
  await expect(s.release(actor, task.taskId, 1)).rejects.toMatchObject({ code: "NATIVE_STALE_REVISION" });
  await expect(s.verify(actor, task.taskId, 1)).rejects.toMatchObject({ code: "NATIVE_STALE_REVISION" });
  task = await s.release(actor, task.taskId, 2); expect(task.canResume).toBe(true);
  await s.close();
  const restarted = service();
  expect(restarted.list(actor).find(row => row.taskId === task.taskId)?.clientRequestId).toBe(request.clientRequestId);
  const replay = await restarted.start(actor, request);
  expect(replay.sessionId).toBe(sessionId); expect(replay.revision).toBe(2);
  expect(rows(sessionId).filter(row => row.event_type === "request/header")).toHaveLength(2);
  task = await restarted.resume(actor, task.taskId, 2); expect(task.state).toBe("idle"); expect(task.sessionId).toBe(sessionId);
  await restarted.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 2, prompt: "Synthetic resumed turn." });
  task = await idle(restarted, task.taskId); expect(task.revision).toBe(3);
  await restarted.release(actor, task.taskId, 3);
  const verified = await restarted.verify(actor, task.taskId, 3);
  // Release is a resumable writer handoff and never seals the session (the resume above depends on that). Studio verifies
  // only a closed, sealed target (P0-14, 8c4bc10ec), so a released session is reported as not finalized, never verified.
  expect(verified).toMatchObject({ verification: "failed", verificationScope: null, error: expect.stringContaining("not closed and sealed, so it is not finalized") });
  const recorded = rows(sessionId);
  expect(recorded.filter(row => row.event_type === "request/header")).toHaveLength(3);
  expect(recorded.every(row => row.writer_sig !== "unsigned" && extractEnvelope(row.meta_json)?.sessionId === sessionId)).toBe(true);
  expect(recorded.some(row => row.event_type === "session/release")).toBe(true);
  expect(readFileSync(join(root, ".amc", "studio-native-tasks", `${task.taskId}.json`), "utf8")).not.toContain(request.prompt);
}, 90_000);

test("owner/selected-agent/demo and stale submission boundaries refuse without extra native requests", async () => {
  const s = service(), request = input();
  const task = await s.start(actor, request); await idle(s, task.taskId);
  const other = { ...actor, principalId: "studio-test:other" }, otherAgent = { ...actor, agentId: "different" };
  expect(s.list(other)).toEqual([]);
  expect(() => s.poll(other, task.taskId)).toThrow("not found");
  expect(() => s.poll(otherAgent, task.taskId)).toThrow("not found");
  await expect(s.start(actor, { ...input(), provider: "openai", model: "not-contacted" })).rejects.toMatchObject({ code: "NATIVE_SCOPE_REFUSED" });
  await expect(s.start(actor, { ...input(), tools: "workspace", toolsDigest: "a".repeat(64) })).rejects.toMatchObject({ code: "NATIVE_SCOPE_REFUSED" });
  // Revision 0 is now refused by the request schema before any revision comparison; a valid-but-wrong revision exercises the stale boundary.
  await expect(s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 7, prompt: "stale" })).rejects.toMatchObject({ code: "NATIVE_STALE_REVISION" });
  expect(rows(task.sessionId).filter(row => row.event_type === "request/header")).toHaveLength(1);
  await s.release(actor, task.taskId, 1);
}, 60_000);

test("cancel during initial preparation prevents the original prompt from later dispatching", async () => {
  const s = service(), request = input(), taskId = nativeTaskId(actor.principalId, request.clientRequestId);
  const starting = s.start(actor, request);
  const cancelled = s.cancel(actor, taskId, 1);
  expect(["releasing", "released", "failed"]).toContain(cancelled.state);
  const settled = await starting;
  expect(settled.state).not.toBe("running");
  expect(rows().filter(row => row.event_type === "request/header")).toHaveLength(0);
  const repeated = await s.start(actor, request); expect(repeated.taskId).toBe(taskId);
  expect(rows().filter(row => row.event_type === "request/header")).toHaveLength(0);
}, 30_000);

test("a stale non-owning observer recovers the exact lost follow-up acknowledgement without dispatching it again", async () => {
  const writer = service(), observer = service(), first = await writer.start(actor, input());
  let task = await idle(writer, first.taskId);
  expect(observer.poll(actor, task.taskId).task.revision).toBe(1);
  const original = { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Exact lost-ack follow-up." };
  await writer.turn(actor, task.taskId, original); task = await idle(writer, task.taskId);
  await writer.release(actor, task.taskId, 2);
  const before = rows(task.sessionId);
  expect(before.filter(row => row.event_type === "request/header")).toHaveLength(2);
  const acknowledged = await observer.turn(actor, task.taskId, original);
  expect(acknowledged).toMatchObject({ revision: 2, lastClientRequestId: original.clientRequestId, sessionId: task.sessionId, state: "released" });
  expect(observer.poll(actor, task.taskId).task.revision).toBe(2);
  await expect(observer.turn(actor, task.taskId, { ...original, prompt: "edited draft stays local" })).rejects.toMatchObject({ code: "NATIVE_REQUEST_CONFLICT" });
  expect(() => observer.cancel(actor, task.taskId, 1)).toThrow("revision changed");
  expect(rows(task.sessionId)).toEqual(before);
}, 60_000);

test("JSONL managed task cold inspection, verification and archive retain actual history and create deduplication", async () => {
  openSessionEventStore(root, "jsonl").close();
  const first = service(), request = input("JSONL managed archive evidence.");
  let task = await first.start(actor, request); task = await idle(first, task.taskId);
  task = await first.verify(actor, task.taskId, task.revision);
  expect(task).toMatchObject({ state: "closed", verification: "failed", error: expect.stringContaining("UNTRUSTED: the recorded evidence is internally consistent") });
  await first.close();
  const before = loadSessionEventHistory({ workspace: root, sessionId: task.sessionId!, requireSealed: true });
  expect(before.backend).toBe("jsonl");
  expect(before.events.filter(row => row.event_type === "request/header")).toHaveLength(1);
  const restarted = service();
  expect(restarted.poll(actor, task.taskId).events.some(event => event.kind === "user" && event.text === request.prompt)).toBe(true);
  expect(restarted.archive(actor, task.taskId, task.revision).archived).toBe(true);
  expect((await restarted.start(actor, request)).archived).toBe(true);
  expect(await restarted.verify(actor, task.taskId, task.revision)).toMatchObject({ verification: "failed", error: expect.stringContaining("UNTRUSTED: the recorded evidence is internally consistent") });
  expect(loadSessionEventHistory({ workspace: root, sessionId: task.sessionId! }).events).toEqual(before.events);
  expect(rows(task.sessionId).filter(row => row.event_type === "request/header")).toHaveLength(0);
}, 60_000);

test("a turn AMC's own budget refused says so instead of a generic failure, and names no provider quota (P0-59)", async () => {
  const config = loadBudgetsConfig(root); config.budgets.perAgent.default!.daily.maxLlmRequests = 1;
  writeFileSync(budgetsPath(root), YAML.stringify(config)); signBudgetsConfig(root);
  const s = service();
  const task = await idle(s, (await s.start(actor, input("Synthetic budget turn one."))).taskId);
  await s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Synthetic budget turn two." });
  const deadline = Date.now() + 25_000;
  let current = s.poll(actor, task.taskId).task;
  while (current.state === "running" && Date.now() < deadline) { await new Promise(done => setTimeout(done, 50)); current = s.poll(actor, task.taskId).task; }
  expect(current.state).toBe("failed");
  expect(current.error).toContain("Signed native budget admission refused this dispatch.");
  expect(current.error).not.toMatch(/provider reported|quota/i);
  expect(rows(task.sessionId).filter(row => row.event_type === "request/header")).toHaveLength(2);
});

// P0-62: a writer still appending while Studio reads. Every append moves the ledger file's identity, and the history
// reader refuses a read whose files moved (CHANGED). `move(reads)` makes the next reads see a new identity on each lstat,
// deterministically, as they would while a writer is still appending; `appendOnCall(n, write)` performs a real append
// during the n-th lstat of the ledger, after that stat was taken, so the read in progress passes and the next one differs.
function movingLedger(ledger: string) {
  const real = fs.lstatSync; let calls = 0, bump = 0, seen = 0, appendAt = 0, write: (() => void) | undefined;
  fs.lstatSync = ((path: PathLike, options?: StatSyncOptions) => {
    const stats = real(path, options as never);
    if (String(path) !== ledger || !stats) return stats;
    if (++seen === appendAt && write) { const append = write; write = undefined; append(); }
    if (calls <= 0) return stats;
    calls--;
    return Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { mtimeMs: stats.mtimeMs + ++bump });
  }) as typeof fs.lstatSync;
  syncBuiltinESMExports();
  return { move(reads: number) { calls = 3 * reads; }, get pending() { return calls; }, get seen() { return seen; },
    appendOnCall(n: number, append: () => void) { appendAt = seen + n; write = append; }, get appended() { return write === undefined && appendAt > 0; },
    restore() { fs.lstatSync = real; syncBuiltinESMExports(); } };
}
test("a writer still appending neither fails the turn nor hides authenticated history; Studio waits for it to settle (P0-62)", async () => {
  const s = service();
  const task = await idle(s, (await s.start(actor, input("Synthetic settle turn one."))).taskId);
  const ledger = movingLedger(join(fs.realpathSync(root), ".amc", "evidence.sqlite"));
  try {
    ledger.move(3); // the read after the turn's result meets a moving store three times, then it holds still
    await s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Synthetic settle turn two." });
    const settled = await idle(s, task.taskId);
    expect(ledger.pending, "the post-turn reads met the moving store").toBe(0);
    expect(settled.revision).toBe(2);
    expect(rows(task.sessionId).filter(row => row.event_type === "turn/end")).toHaveLength(2);
    await new Promise(done => setTimeout(done, 300));
    ledger.move(1);
    const shown = s.poll(actor, task.taskId).task;
    expect(shown.history.status, "a moving store is not unavailable evidence").toBe("authenticated");
    expect(shown).toMatchObject({ state: "idle", error: null });
  } finally { ledger.restore(); }
});

/** A real append by another writer: a sealed audit session in the same workspace ledger. */
function appendForeignSession(workspace: string): void {
  const ledger = openLedger(workspace), sessionId = `p062-writer-${randomUUID()}`;
  try {
    ledger.startSession({ sessionId, runtime: "amc", binaryPath: "p062-fixture-writer", binarySha256: "0".repeat(64) });
    ledger.appendEvidence({ sessionId, runtime: "amc", eventType: "audit", payload: "{}", payloadExt: "json", meta: { auditType: "P062_FIXTURE_WRITER" } });
    ledger.sealSession(sessionId);
  } finally { ledger.close(); }
}
test("a writer appending between Studio's pre-verify read and the verifier makes verification fail, not pass (P0-62 review)", async () => {
  const monitor = createHash("sha256").update(readFileSync(join(root, ".amc", "keys", "monitor_ed25519.pub"))).digest("hex");
  const s = service(root, { AMC_EXPECTED_MONITOR_FINGERPRINT: monitor });
  const clean = await idle(s, (await s.start(actor, input("Synthetic pinned verify."))).taskId);
  expect((await s.verify(actor, clean.taskId, 1)).verification, "control: the same flow verifies when nothing moves").toMatch(/^(externally-anchored|anchored-prefix)$/);
  const task = await idle(s, (await s.start(actor, input("Synthetic moved verify."))).taskId);
  const ledger = movingLedger(join(fs.realpathSync(root), ".amc", "evidence.sqlite"));
  try {
    // Verify reads after close (lstat 1-3), then the pre-verify head (4-6): append as that read finishes.
    ledger.appendOnCall(6, () => appendForeignSession(root));
    const verified = await s.verify(actor, task.taskId, 1);
    expect(ledger.appended).toBe(true);
    expect(verified).toMatchObject({ verification: "failed", error: expect.stringContaining("Recorded history changed during verification") });
  } finally { ledger.restore(); }
});
test("a release that completes the task while its turn waits for settled history wins; the turn is not dispatched (P0-62 review)", async () => {
  const s = service();
  const task = await idle(s, (await s.start(actor, input("Synthetic CAS turn one."))).taskId);
  const ledger = movingLedger(join(fs.realpathSync(root), ".amc", "evidence.sqlite"));
  try {
    ledger.move(1_000_000); // every read meets a moving store, so dispatch waits for settled history
    const submitted = s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Synthetic CAS turn two." });
    await new Promise(done => setTimeout(done, 200));
    const released = await s.release(actor, task.taskId, 2);
    expect(released.state).toBe("released");
    ledger.move(0);
    await expect(submitted).rejects.toMatchObject({ code: "NATIVE_TASK_CHANGED" });
    expect(s.poll(actor, task.taskId).task.state).toBe("released");
    expect(rows(task.sessionId).filter(row => row.event_type === "request/header"), "the waiting turn was never sent").toHaveLength(1);
  } finally { ledger.restore(); }
});

test("archive frees a current-history slot while retaining sealed evidence and all dedup identities after restart", async () => {
  const s = service(), request = input("Archive first recorded turn.");
  let task = await s.start(actor, request); task = await idle(s, task.taskId);
  const turn = { clientRequestId: randomUUID(), expectedRevision: task.revision, prompt: "Archive retained follow-up." };
  await s.turn(actor, task.taskId, turn); task = await idle(s, task.taskId);
  task = await s.verify(actor, task.taskId, task.revision);
  expect(task.state).toBe("closed"); expect(task.archived).toBe(false);
  const store = new NativeTaskDescriptors(root), original = store.read(task.taskId)!;
  const recorded = rows(task.sessionId);
  // Capacity is exercised with signed control metadata; only the real task above
  // supplies native runtime/evidence acceptance. These are not 255 executed tasks.
  store.lock(() => {
    for (let index = 0; index < 255; index++) {
      const requestId = randomUUID();
      store.write({ ...original, taskId: nativeTaskId(actor.principalId, requestId), revision: 1,
        submissions: [{ clientRequestId: requestId, bodyHash: original.submissions[0]!.bodyHash, revision: 1 }] });
    }
  });
  const next = input("Admission after explicit archival.");
  await expect(s.start(actor, next)).rejects.toMatchObject({ code: "NATIVE_TASK_HISTORY_LIMIT" });
  const archived = s.archive(actor, task.taskId, task.revision);
  expect(archived).toMatchObject({ taskId: task.taskId, sessionId: task.sessionId, revision: task.revision,
    state: "closed", archived: true, canResume: false, clientRequestId: request.clientRequestId, lastClientRequestId: turn.clientRequestId });
  expect(rows(task.sessionId)).toEqual(recorded);
  expect(store.list()).toHaveLength(255); expect(store.list(true)).toHaveLength(256);
  expect(store.read(task.taskId)?.submissions).toEqual(original.submissions);
  const descriptorPath = join(store.directory, `${task.taskId}.json`), archiveBytes = readFileSync(descriptorPath);
  expect(s.archive(actor, task.taskId, task.revision).archived).toBe(true);
  expect(readFileSync(descriptorPath)).toEqual(archiveBytes);
  await s.close();
  const restarted = service();
  expect(restarted.poll(actor, task.taskId).events.some(event => event.kind === "user" && event.text === turn.prompt)).toBe(true);
  expect((await restarted.start(actor, request)).archived).toBe(true);
  expect((await restarted.turn(actor, task.taskId, turn)).archived).toBe(true);
  expect(rows(task.sessionId)).toEqual(recorded);
  await expect(restarted.start(actor, { ...request, prompt: "conflicting original content" })).rejects.toMatchObject({ code: "NATIVE_REQUEST_CONFLICT" });
  await expect(restarted.start(actor, { ...next, clientRequestId: turn.clientRequestId })).rejects.toMatchObject({ code: "NATIVE_REQUEST_CONFLICT" });
  await expect(restarted.turn(actor, task.taskId, { ...turn, clientRequestId: randomUUID(), expectedRevision: task.revision }))
    .rejects.toMatchObject({ code: "NATIVE_TASK_ARCHIVED" });
  await expect(restarted.resume(actor, task.taskId, task.revision)).rejects.toMatchObject({ code: "NATIVE_TASK_ARCHIVED" });
  const admitted = await restarted.start(actor, next); await idle(restarted, admitted.taskId);
  expect(admitted.taskId).not.toBe(task.taskId);
  expect(store.list()).toHaveLength(256);
  expect(rows(task.sessionId)).toEqual(recorded);
  await restarted.release(actor, admitted.taskId, admitted.revision);
}, 90_000);

test("archive refuses active, foreign, stale, unsealed and uncertain tasks without changing retained metadata", async () => {
  const s = service(), request = input(), taskId = nativeTaskId(actor.principalId, request.clientRequestId);
  const starting = s.start(actor, request);
  expect(() => s.archive(actor, taskId, 1)).toThrow("operations to finish");
  await starting; let task = await idle(s, taskId);
  const store = new NativeTaskDescriptors(root), path = join(store.directory, `${taskId}.json`);
  let before = readFileSync(path);
  expect(() => s.archive({ ...actor, principalId: "different-owner" }, taskId, 1)).toThrow("not found");
  expect(() => s.archive({ ...actor, agentId: "other-agent" }, taskId, 1)).toThrow("not found");
  expect(() => s.archive(actor, taskId, 0)).toThrow("revision changed");
  expect(() => s.archive(actor, taskId, 1)).toThrow("operations to finish");
  expect(readFileSync(path)).toEqual(before);
  await s.release(actor, taskId, 1);
  // A signed control flag alone cannot substitute for an authenticated close.
  store.lock(() => store.write({ ...store.read(taskId)!, closed: true }));
  before = readFileSync(path);
  const observer = service();
  expect(() => observer.archive(actor, taskId, 1)).toThrow("session is still open");
  expect(readFileSync(path)).toEqual(before);
  store.lock(() => store.write({ ...store.read(taskId)!, closed: false, pendingTurn: true }));
  before = readFileSync(path);
  expect(() => service().archive(actor, taskId, 1)).toThrow("prior submission is unresolved");
  expect(readFileSync(path)).toEqual(before);
  expect(task.archived).toBe(false);
}, 60_000);

test("archive authenticates evidence again and hidden archived descriptors still fail closed on tampering", async () => {
  const s = service(); let task = await s.start(actor, input()); task = await idle(s, task.taskId);
  task = await s.verify(actor, task.taskId, task.revision); expect(task.state).toBe("closed");
  const store = new NativeTaskDescriptors(root), path = join(store.directory, `${task.taskId}.json`), before = readFileSync(path);
  const ledger = openLedger(root);
  try {
    const close = ledger.db.prepare("SELECT id, writer_sig FROM evidence_events WHERE session_id = ? AND event_type = 'session/close'").get(task.sessionId) as { id: string; writer_sig: string } | undefined;
    expect(close).toBeDefined();
    if (!close) throw new Error("Fixture requires an authenticated session/close row before tampering");
    const trigger = ledger.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'protect_evidence_immutable'").get() as { sql: string } | undefined;
    expect(trigger).toBeDefined();
    if (!trigger) throw new Error("Fixture requires the production immutable-evidence trigger");
    const readClose = () => ledger.db.prepare("SELECT * FROM evidence_events WHERE id = ?").get(close.id);
    const original = readClose();
    const updateSignature = (signature: string) => ledger.db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run(signature, close.id);
    // Ordinary SQL mutation must remain blocked. The attack below models a
    // hostile owner rewriting this disposable database beyond that storage guard.
    expect(() => updateSignature("tampered-archive-close")).toThrow("evidence immutable fields changed");
    expect(readClose()).toEqual(original);
    const rewriteFixtureSignature = (signature: string) => ledger.db.transaction(() => {
      ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
      expect(updateSignature(signature).changes).toBe(1);
      // Restore the exact production guard before any archive/verifier call.
      ledger.db.exec(trigger.sql);
    }).immediate();
    try {
      rewriteFixtureSignature("tampered-archive-close");
      expect(readClose()).toEqual({ ...(original as Record<string, unknown>), writer_sig: "tampered-archive-close" });
      expect(ledger.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'protect_evidence_immutable'").get()).toEqual(trigger);
      expect(() => updateSignature("another-forgery")).toThrow("evidence immutable fields changed");
      expect(() => s.archive(actor, task.taskId, task.revision)).toThrow("evidence did not authenticate");
      expect(readFileSync(path)).toEqual(before);
    } finally {
      rewriteFixtureSignature(close.writer_sig);
      expect(readClose()).toEqual(original);
    }
  } finally { ledger.close(); }
  s.archive(actor, task.taskId, task.revision);
  const authentic = readFileSync(path), envelope = JSON.parse(authentic.toString("utf8"));
  delete envelope.descriptor.archivedAt; writeFileSync(path, JSON.stringify(envelope));
  try {
    expect(() => s.list(actor)).toThrow("did not verify");
    await expect(s.start(actor, input())).rejects.toMatchObject({ code: "NATIVE_TASK_DESCRIPTOR_UNTRUSTED" });
  } finally { writeFileSync(path, authentic); }
}, 60_000);

test("a physical workspace alias runs the same native session, while a different ACP root is refused", async () => {
  const alias = join(root, "same-workspace-alias"); symlinkSync(root, alias, "junction");
  const s = service(alias), task = await s.start(actor, input("Alias workspace recording."));
  const settled = await idle(s, task.taskId);
  expect(rows(settled.sessionId).filter(row => row.event_type === "request/header")).toHaveLength(1);
  await s.release(actor, task.taskId, 1);
  const unrelated = join(root, "different-workspace"); mkdirSync(unrelated);
  const child = spawn(process.execPath, [resolve("dist/cli.js"), "acp", "--provider", "stub", "--credentials-mode", "operator-only",
    "--credentials-home", credentialHome, "--credentials-file", join(credentialHome, ".credentials.yaml")], {
    cwd: root, env: { HOME: credentialHome, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass }, stdio: "pipe"
  });
  child.stderr.resume(); let buffer = "";
  const frames: Array<{ id?: number; error?: { code?: number }; result?: unknown }> = [];
  child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk: string) => {
    buffer += chunk; for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1); if (line.trim()) frames.push(JSON.parse(line));
    }
  });
  async function request(id: number, method: string, params: object) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    const deadline = Date.now() + 5000;
    while (!frames.some(frame => frame.id === id)) {
      if (Date.now() > deadline || child.exitCode !== null) throw new Error("Actual ACP scope fixture did not answer.");
      await new Promise(done => setTimeout(done, 20));
    }
    return frames.find(frame => frame.id === id)!;
  }
  try {
    expect((await request(1, "initialize", { protocolVersion: 1, clientCapabilities: {} })).result).toBeDefined();
    const before = rows();
    expect((await request(2, "session/new", { cwd: unrelated, mcpServers: [] })).error?.code).toBe(-32602);
    expect(rows()).toEqual(before);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>(done => { const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
        child.once("close", () => { clearTimeout(timer); done(); }); child.stdin.end(); });
    }
  }
}, 40_000);

test("fork (P2-13): an owned child task whose session names the verified parent, its phases reported, and an unverifiable parent refused by code", async () => {
  const s = service();
  let parent = await s.start(actor, input("Synthetic parent turn."));
  parent = await idle(s, parent.taskId);
  expect(parent.execution).toEqual({ sessionId: parent.sessionId, receiptStates: [],
    phases: { admission: "succeeded", "model-completion": "succeeded", "side-effect-completion": "succeeded", "evidence-verification": "pending" } });
  const request = { clientRequestId: randomUUID(), expectedRevision: parent.revision };
  const [child, again] = [await s.fork(actor, parent.taskId, request), await s.fork(actor, parent.taskId, request)];
  expect(again.taskId).toBe(child.taskId);
  expect(child).toMatchObject({ state: "idle", provider: "stub", tools: "none", revision: 1 });
  expect(child.sessionId).not.toBe(parent.sessionId);
  const opening = rows(child.sessionId).find(row => row.event_type === "session/open")!;
  expect((JSON.parse(opening.meta_json) as { parentSession: { sessionId: string } }).parentSession.sessionId).toBe(parent.sessionId);
  await s.turn(actor, child.taskId, { clientRequestId: randomUUID(), expectedRevision: 1, prompt: "Synthetic child turn." });
  expect((await idle(s, child.taskId)).execution?.phases["model-completion"]).toBe("succeeded");
  await expect(s.fork(actor, parent.taskId, { clientRequestId: randomUUID(), expectedRevision: 9 })).rejects.toMatchObject({ code: "NATIVE_STALE_REVISION" });
  await expect(s.fork({ ...actor, principalId: "studio-test:other" }, parent.taskId, request)).rejects.toMatchObject({ code: "NATIVE_TASK_NOT_FOUND" });
  await s.release(actor, child.taskId, 2); await s.release(actor, parent.taskId, parent.revision);

  // Tamper with the parent's signed rows: the runtime refuses the fork with the same coded reason every surface reports.
  const ledger = openLedger(root);
  try {
    for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) ledger.db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    ledger.db.prepare("UPDATE evidence_events SET payload_sha256 = ? WHERE id = (SELECT id FROM evidence_events WHERE session_id = ? ORDER BY rowid LIMIT 1 OFFSET 1)")
      .run("0".repeat(64), parent.sessionId);
  } finally { ledger.close(); }
  await expect(s.fork(actor, parent.taskId, { clientRequestId: randomUUID(), expectedRevision: parent.revision }))
    .rejects.toMatchObject({ code: "NATIVE_FORK_TAMPERED" });
}, 120_000);
