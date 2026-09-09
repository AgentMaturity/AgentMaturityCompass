import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { lockVault } from "../src/vault/vault.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { initApprovalPolicy } from "../src/approvals/approvalPolicyEngine.js";
import { writeRuntimeFirewallPolicy } from "../src/runtime/firewall.js";
import { defaultToolsConfig } from "../src/toolhub/toolsSchema.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { openLedger } from "../src/ledger/ledger.js";
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
});
let root: string, credentialHome: string, prior: string | undefined;
const services: NativeTaskService[] = [];
const actor: NativeTaskActor = { principalId: "studio-test:owner", agentId: "default", demo: true };
const pass = "synthetic-studio-service-vault";
beforeEach(() => {
  prior = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = pass;
  root = mkdtempSync(join(tmpdir(), "amc-studio-service-"));
  credentialHome = join(root, "operator-home"); mkdirSync(credentialHome, { mode: 0o700 });
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
});
afterEach(async () => {
  const outcomes = await Promise.allSettled(services.splice(0).map(service => service.close()));
  lockVault(root); rmSync(root, { recursive: true, force: true });
  if (prior === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = prior;
  expect(outcomes.filter(outcome => outcome.status === "rejected")).toEqual([]);
});
function service(workspace = root): NativeTaskService {
  const value = createService({ workspace, credentialsHome: credentialHome, credentialsFile: join(credentialHome, ".credentials.yaml"),
    environment: { HOME: credentialHome, PATH: process.env.PATH, AMC_VAULT_PASSPHRASE: pass } });
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
  expect(verified.verification).toBe("workspace-key-consistency");
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
  await expect(s.turn(actor, task.taskId, { clientRequestId: randomUUID(), expectedRevision: 0, prompt: "stale" })).rejects.toMatchObject({ code: "NATIVE_STALE_REVISION" });
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
