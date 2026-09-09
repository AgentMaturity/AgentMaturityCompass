import { fork, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { JsonlWriterLock } from "../src/persistence/jsonl/jsonlWriterLock.js";
import { jsonlEventsPath, jsonlSessionsPath, jsonlLockPath } from "../src/persistence/jsonl/jsonlEventLog.js";
import { SessionService } from "../src/session/sessionService.js";
import { resumeSession } from "../src/session/sessionResume.js";
import { recoverSession } from "../src/session/sessionRecovery.js";
import { authenticateJsonlContinuation, inspectJsonlSessionRecovery } from "../src/session/jsonlContinuation.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { openLedger } from "../src/ledger/ledger.js";
import { projectBudgetUsage, readBudgetEvents } from "../src/budgets/nativeBudgetUsage.js";
import { sha256Hex } from "../src/utils/hash.js";

const OPEN = { agentId: "default", harnessVersion: "jsonl-recovery-test", compositionDigest: sha256Hex("jsonl-recovery-composition"), policyDigest: sha256Hex("jsonl-recovery-policy") };
const claimant = { pid: process.pid, hostId: hostname(), bootId: "jsonl-resume-parent", startedAt: Date.now() };
const children: ChildProcess[] = [], services: SessionService[] = [];
let workspace: string, previous: string | undefined;
let originalEnvironment: Record<string, string | undefined>;
type Message = Record<string, unknown>;
function receive(child: ChildProcess): Promise<Message> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`owned fixture ${child.pid} timed out`)); }, 15000);
    const message = (value: Message) => { cleanup(); resolve(value); };
    const exit = (code: unknown) => { cleanup(); reject(new Error(`fixture exited before receipt: ${code}`)); };
    const cleanup = () => { clearTimeout(timer); child.off("message", message); child.off("exit", exit); };
    child.once("message", message); child.once("exit", exit);
  });
}
async function start(mode: string, sessionId?: string) {
  const child = fork(fileURLToPath(new URL("./fixtures/jsonlWriterResumeWorker.ts", import.meta.url)), [workspace, mode, ...(sessionId ? [sessionId] : [])],
    { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "pipe", "ipc"], env: { ...process.env } });
  children.push(child); child.stderr?.on("data", bytes => process.stderr.write(bytes));
  return { child, ready: await receive(child), command(value: string) { const response = receive(child); child.send(value); return response; } };
}
async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`owned fixture ${child.pid} did not exit`)), 10000);
    child.once("exit", () => { clearTimeout(timer); resolve(); }); child.kill("SIGKILL");
  });
}
function resume(sessionId: string, extra = {}) {
  const result = resumeSession({ workspace, sessionId, ...OPEN, claimant, ...extra }); services.push(result.service); return result;
}
function released(ending: "complete" | "cancelled" = "complete", parentStop = false): string {
  const service = new SessionService(workspace, openSessionEventStore(workspace, "jsonl")); services.push(service);
  service.open(OPEN); service.startTurn({ trigger: "user" }); service.recordUserMessage("original");
  service.endTurn({ reason: ending, ...(ending === "cancelled" ? { cause: parentStop ? { kind: "parent" as const } : { kind: "user" as const } } : {}) });
  service.sealTurn(); service.releaseWithoutClosing(); return service.sessionId;
}
function usage() {
  const ledger = openLedger(workspace, { readonly: true });
  try { return projectBudgetUsage(readBudgetEvents(workspace, ledger), "default", Date.now()); } finally { ledger.close(); }
}
beforeEach(() => {
  previous = process.env.AMC_VAULT_PASSPHRASE; process.env.AMC_VAULT_PASSPHRASE = "isolated-jsonl-resume-test-only";
  const root = process.env.AMC_JSONL_RESUME_TEST_ROOT ?? tmpdir(); mkdirSync(root, { recursive: true });
  workspace = mkdtempSync(join(root, "amc-jsonl-resume-"));
  const environment: Record<string, string | undefined> = { AMC_SESSION_STORE: undefined, AMC_NO_SIGN: undefined,
    AMC_EXPECTED_MONITOR_FINGERPRINT: undefined, AMC_HOME: join(workspace, "operator-home"),
    AMC_CONTROL_CHECKPOINT_DIR: join(workspace, "control-checkpoints"), AMC_VAULT_REMEMBER: "0" };
  originalEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  initBudgets(workspace, "default");
});
afterEach(async () => {
  for (const service of services.splice(0)) { try { service.disposeWithoutClosing(); } catch { /* child cleanup still runs */ } }
  await Promise.all(children.splice(0).map(kill));
  if (previous === undefined) delete process.env.AMC_VAULT_PASSPHRASE; else process.env.AMC_VAULT_PASSPHRASE = previous;
  for (const [key, value] of Object.entries(originalEnvironment ?? {})) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  // Retain new test workspaces, including failed runs; no old erasure lane is used.
});

describe("authenticated native JSONL writer recovery", () => {
  test("real killed writer: original prefix, acknowledged effects and pending usage survive genuine resume", async () => {
    const owner = await start("create"), id = String(owner.ready.sessionId);
    const before = readFileSync(jsonlEventsPath(workspace)), lifecycle = readFileSync(jsonlSessionsPath(workspace));
    const effects = readFileSync(join(workspace, "effects.log")), spent = usage();
    expect(() => resume(id)).toThrow(/writer is live|writer is live, unknown/i);
    await kill(owner.child);
    expect(inspectJsonlSessionRecovery({ workspace, sessionId: id }).state).toBe("interrupted");
    const { service, report } = resume(id);
    expect(report.recovery?.verdict).toBe("RECOVERED"); expect(report.recovery?.unknownToolOutcomes).toBe(1);
    expect(service.sessionId).toBe(id);
    expect(readFileSync(jsonlEventsPath(workspace)).subarray(0, before.length)).toEqual(before);
    expect(readFileSync(jsonlSessionsPath(workspace))).toEqual(lifecycle);
    expect(readFileSync(join(workspace, "effects.log"))).toEqual(effects);
    expect(usage()).toEqual(spent); expect(spent.daily.toolPending.WRITE_LOW).toBe(1);
    const unknown = service.readEvents().filter(row => row.event_type === "tool/result" && JSON.parse(row.meta_json).outcome === "TOOL_OUTCOME_UNKNOWN");
    expect(unknown.map(row => JSON.parse(row.meta_json).toolCallId)).toEqual(["uncertain-effect"]);
    service.startTurn({ trigger: "resume" }); service.recordUserMessage("new explicit admitted input"); service.startStep();
    const output = service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", content: "authentic new recorded output", stopReason: "end_turn" });
    service.endStep({ stopReason: "end_turn", usage: null }); service.endTurn({ reason: "complete" }); service.sealTurn(); service.close({ reason: "completed" });
    const history = loadSessionEventHistory({ workspace, sessionId: id, verifyPayloads: true, requireSealed: true });
    expect(history.events.some(row => row.id === output.eventId)).toBe(true);
    expect(history.events.filter(row => row.event_type === "tool/call")).toHaveLength(2);
    expect(history.events.filter(row => row.event_type === "session/open")).toHaveLength(1);
    expect(readFileSync(join(workspace, "effects.log"))).toEqual(effects);
    expect(() => resume(id)).toThrow(/closed or archived/);
  });

  test("two real resumers cannot acquire the same abandoned writer", async () => {
    const owner = await start("create"), id = String(owner.ready.sessionId); await kill(owner.child);
    const [one, two] = await Promise.all([start("resume", id), start("resume", id)]);
    const results = await Promise.all([one.command("go"), two.command("go")]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toHaveLength(1);
    expect(loadSessionEventHistory({ workspace, sessionId: id }).events.filter(row => row.event_type === "session/resume")).toHaveLength(1);
  });

  test("an empty replacement operations journal cannot authorize uncertain dispatch recovery", async () => {
    const owner = await start("create"), id = String(owner.ready.sessionId); await kill(owner.child);
    const before = readFileSync(jsonlEventsPath(workspace));
    const abandonedLock = readFileSync(jsonlLockPath(workspace));
    const journal = join(workspace, ".amc", "evidence.sqlite"), moved: string[] = [];
    for (const path of [journal, `${journal}-wal`, `${journal}-shm`]) {
      if (existsSync(path)) { renameSync(path, `${path}.original-test-journal`); moved.push(path); }
    }
    try {
      const empty = openLedger(workspace); empty.close();
      expect(() => resume(id)).toThrow(/Original usage or unresolved-dispatch reservations/);
      expect(readFileSync(jsonlEventsPath(workspace))).toEqual(before);
      expect(readFileSync(jsonlLockPath(workspace))).toEqual(abandonedLock);
    } finally {
      // Retain both the original and deliberately empty NEW fixture journals;
      // no prior consumer, erasure operation or evidence deletion is involved.
      for (const path of [journal, `${journal}-wal`, `${journal}-shm`]) {
        if (existsSync(path)) renameSync(path, `${path}.empty-test-journal`);
      }
      for (const path of moved) renameSync(`${path}.original-test-journal`, path);
    }
  });

  test("kernel mutex excludes contenders even with an absent advisory owner record", async () => {
    // Own coordinator held directly: no writer.lock and no signed-session owner
    // can make this test pass instead of the exclusive kernel mutex.
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(join(workspace, "writer.lock.coordination.sqlite")); db.exec("BEGIN EXCLUSIVE");
    try {
      const contender = await start("mutex"); expect((await contender.command("go")).ok).toBe(false);
    } finally { db.close(); }
    const lock = new JsonlWriterLock(join(workspace, "writer.lock")); lock.release();
  });

  test.each(["complete", "cancelled"] as const)("a released %s turn resumes only as a new explicit turn", ending => {
    const id = released(ending), prior = loadSessionEventHistory({ workspace, sessionId: id }).events;
    const { service } = resume(id);
    expect(service.readEvents().filter(row => row.event_type === "turn/start")).toHaveLength(1);
    expect(service.readEvents().slice(0, prior.length)).toEqual(prior);
    service.releaseWithoutClosing();
  });

  test("a parent cancellation cannot be promoted to a standalone resumed agent", () => {
    const id = released("cancelled", true), before = readFileSync(jsonlEventsPath(workspace));
    expect(() => resume(id)).toThrow(/parent or policy control/);
    expect(readFileSync(jsonlEventsPath(workspace))).toEqual(before);
  });

  test.each(["agent", "composition", "policy", "head", "trust"])("changed %s refuses before new writer rights or append", kind => {
    const id = released(), before = readFileSync(jsonlEventsPath(workspace));
    const extras = kind === "agent" ? { agentId: "different" } : kind === "composition" ? { compositionDigest: sha256Hex("changed") }
      : kind === "policy" ? { policyDigest: sha256Hex("changed") } : kind === "head" ? { expectedHeadEventHash: "0".repeat(64) } : { expectedMonitorFingerprint: "0".repeat(64) };
    expect(() => authenticateJsonlContinuation({ workspace, sessionId: id, ...OPEN, ...extras })).toThrow();
    expect(readFileSync(jsonlEventsPath(workspace))).toEqual(before); expect(existsSync(jsonlLockPath(workspace))).toBe(false);
  });

  test.each(["torn", "unterminated", "signature", "future"])("%s history refuses without rewriting its bytes", mutation => {
    const id = released(), path = jsonlEventsPath(workspace), bytes = readFileSync(path, "utf8");
    if (mutation === "torn") appendFileSync(path, '{"torn":');
    else if (mutation === "unterminated") writeFileSync(path, bytes.slice(0, -1));
    else {
      const lines = bytes.trimEnd().split("\n"), last = JSON.parse(lines.at(-1)!);
      if (mutation === "signature") last.writer_sig = "AAAA";
      else { const meta = JSON.parse(last.meta_json); meta.amcSession.v = 999; last.meta_json = JSON.stringify(meta); }
      lines[lines.length - 1] = JSON.stringify(last); writeFileSync(path, lines.join("\n") + "\n");
    }
    const changed = readFileSync(path); expect(() => resume(id)).toThrow();
    expect(readFileSync(path)).toEqual(changed); expect(existsSync(jsonlLockPath(workspace))).toBe(false);
  });

  test.each(["unreadable", "foreign", "live"])("%s workspace owner is not stolen", owner => {
    const id = released(), path = jsonlLockPath(workspace), before = readFileSync(jsonlEventsPath(workspace));
    const record = owner === "unreadable" ? "not-json" : JSON.stringify({ pid: process.pid, hostId: owner === "foreign" ? "not-this-host" : hostname(), acquiredTs: 0 });
    writeFileSync(path, record);
    expect(() => resume(id)).toThrow(/locked by another writer/);
    expect(readFileSync(path, "utf8")).toBe(record); expect(readFileSync(jsonlEventsPath(workspace))).toEqual(before);
  });

  test("direct recovery cannot steal a handle dropped by a live process", () => {
    const service = new SessionService(workspace, openSessionEventStore(workspace, "jsonl")); services.push(service);
    service.open(OPEN); service.startTurn({ trigger: "user" }); service.recordUserMessage("not dead"); service.disposeWithoutClosing();
    const before = readFileSync(jsonlEventsPath(workspace));
    expect(() => recoverSession({ workspace, sessionId: service.sessionId, claimant, force: true })).toThrow(/writer is live/);
    expect(readFileSync(jsonlEventsPath(workspace))).toEqual(before);
  });
});
