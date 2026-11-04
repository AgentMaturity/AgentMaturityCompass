/**
 * The two configuration-witness records of `amc verify all` (an evidence-ledger audit row and a transparency entry): every
 * explicit writer leaves both, each is restored on its own after a rollback, and verify all reads the ledger witnesses from
 * the rows its verification checked, never from a second open of the file.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { verifyAll } from "../src/verify/verifyAll.js";
import { passportPolicyPath, savePassportPolicy } from "../src/passport/passportStore.js";
import { savePassportPolicyAsync } from "../src/index.js";
import { defaultPassportPolicy } from "../src/passport/passportPolicySchema.js";
import { promptSchedulerTickAsync } from "../src/prompt/promptSchedulerAsync.js";
import { promptLatestPackPath, promptSchedulerPath } from "../src/prompt/promptPolicyStore.js";
import { buildPromptPackForApi } from "../src/prompt/promptPackApi.js";
import { buildPromptPackForApiAsync } from "../src/prompt/promptPackAsync.js";
import { openLedger } from "../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../src/storage/sqlitePool.js";
import { verifiedTransparencyLog } from "../src/transparency/logChain.js";
import { witnessingEnabled } from "../src/transparency/configWitness.js";
import { passportInitForApi } from "../src/passport/passportApi.js";
import { workspaceKeyTrust } from "./helpers/trustContext.js";
import Database from "better-sqlite3";
import { openA4Store } from "../src/a4/a4Store.js";
import { A4_RUNTIME } from "../src/a4/a4RuntimeLifecycle.js";
import { a4, A4Project, a4Workspace, requestId } from "./a4/a4Harness.js";

const hook = vi.hoisted(() => ({ afterLedgerVerify: null as null | (() => void), failWitness: false }));
vi.mock("../src/transparency/configWitness.js", async (original) => {
  const actual = await original<typeof import("../src/transparency/configWitness.js")>();
  return { ...actual, witnessA4Project: (...args: Parameters<typeof actual.witnessA4Project>) => {
    if (hook.failWitness) throw new Error("simulated crash after the project committed, before its witness");
    return actual.witnessA4Project(...args);
  } };
});
vi.mock("../src/ledger/ledger.js", async (original) => {
  const actual = await original<typeof import("../src/ledger/ledger.js")>();
  return { ...actual, verifyLedgerIntegrity: (...args: Parameters<typeof actual.verifyLedgerIntegrity>) => {
    const result = actual.verifyLedgerIntegrity(...args);
    hook.afterLedgerVerify?.();
    return result;
  } };
});

vi.setConfig({ testTimeout: 60_000 });

const roots: string[] = [];
afterEach(() => {
  hook.afterLedgerVerify = null;
  hook.failWitness = false;
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
function fresh(): string {
  const root = temp("amc-verify-witness-");
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
const run = (workspace: string) => verifyAll({ workspace, trust: workspaceKeyTrust(workspace) });
const check = (report: Awaited<ReturnType<typeof run>>, id: string) => report.checks.find((row) => row.id === id);
const transparencyDir = (ws: string) => join(ws, ".amc", "transparency");
const ledgerFiles = (ws: string) => ["evidence.sqlite", "evidence.sqlite-wal", "evidence.sqlite-shm"].map((name) => join(ws, ".amc", name));

/** Copies the transparency directory and the ledger files aside; `restore` puts the chosen record back as it was. */
function snapshot(ws: string) {
  const dir = temp("amc-verify-witness-snap-"), log = join(dir, "transparency"), ledger = join(dir, "ledger");
  cpSync(transparencyDir(ws), log, { recursive: true });
  for (const file of ledgerFiles(ws)) if (existsSync(file)) cpSync(file, join(ledger, file.split("/").pop()!));
  return {
    restoreLog() { rmSync(transparencyDir(ws), { recursive: true, force: true }); cpSync(log, transparencyDir(ws), { recursive: true }); },
    restoreLedger() {
      closeAllSqlitePools(); // pooled writers would keep writing to the replaced file
      for (const file of ledgerFiles(ws)) {
        rmSync(file, { force: true });
        const copy = join(ledger, file.split("/").pop()!);
        if (existsSync(copy)) cpSync(copy, file);
      }
    }
  };
}
function ledgerRows(ws: string, type: string): number {
  const ledger = openLedger(ws, { readonly: true });
  try {
    return (ledger.db.prepare("SELECT COUNT(*) AS n FROM evidence_events WHERE event_type = 'audit' AND json_extract(meta_json, '$.auditType') = ?")
      .get(type) as { n: number }).n;
  } finally {
    ledger.close();
  }
}
const logRows = (ws: string, type: string) => verifiedTransparencyLog(ws, { readOnly: true }).entries.filter((entry) => entry.type === type).length;
const removePair = (path: string) => { rmSync(path); rmSync(`${path}.sig`); };

describe("verify all configuration witnesses", () => {
  test("a passport policy saved through the async SDK and then deleted with its signature fails", async () => {
    const ws = fresh();
    await savePassportPolicyAsync(ws, defaultPassportPolicy());
    removePair(passportPolicyPath(ws));
    const report = await run(ws);
    expect(check(report, "passport-policy-signature")?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("the scheduler state an async tick writes on its error branch is witnessed", async () => {
    const ws = fresh();
    expect(await promptSchedulerTickAsync({ workspace: ws, workspaceReady: false })).toMatchObject({ ran: false, reason: "workspace_not_ready" });
    removePair(promptSchedulerPath(ws));
    const report = await run(ws);
    expect(check(report, "prompt-scheduler-signature")?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("each record is restored on the next save after only it was rolled back", async () => {
    const ws = fresh(), before = snapshot(ws);
    savePassportPolicy(ws, defaultPassportPolicy());
    expect([ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED"), logRows(ws, "PASSPORT_POLICY_CONFIGURED")]).toEqual([1, 1]);
    before.restoreLedger();
    expect(ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED")).toBe(0);
    savePassportPolicy(ws, defaultPassportPolicy());
    expect([ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED"), logRows(ws, "PASSPORT_POLICY_CONFIGURED")]).toEqual([1, 1]);
    before.restoreLog();
    expect(check(await run(ws), "transparency-log")?.status).toBe("FAIL");
    savePassportPolicy(ws, defaultPassportPolicy());
    expect([ledgerRows(ws, "PASSPORT_POLICY_CONFIGURED"), logRows(ws, "PASSPORT_POLICY_CONFIGURED")]).toEqual([1, 1]);
    expect(check(await run(ws), "transparency-log")?.status).toBe("PASS");
  });

  test("the ledger witnesses are those verification checked: a ledger swapped after verification changes nothing", async () => {
    const ws = fresh(), before = snapshot(ws);
    savePassportPolicy(ws, defaultPassportPolicy());
    removePair(passportPolicyPath(ws));
    before.restoreLog();
    hook.afterLedgerVerify = () => before.restoreLedger();
    const report = await run(ws);
    expect(check(report, "passport-policy-signature")?.status).toBe("FAIL");
    expect(check(report, "passport-policy-signature")?.details.join(" ")).toContain("evidence ledger");
  });

  test.each([
    ["synchronously", async (ws: string) => { buildPromptPackForApi({ workspace: ws, agentId: "default" }); }],
    ["asynchronously", async (ws: string) => { await buildPromptPackForApiAsync({ workspace: ws, agentId: "default" }); }]
  ])("a pack built %s is witnessed in the ledger: deleted with the log rolled back, it still fails", async (_how, build) => {
    const ws = fresh(), before = snapshot(ws);
    await build(ws);
    await build(ws);
    expect(ledgerRows(ws, "PROMPT_PACK_CREATED")).toBe(1);
    before.restoreLog();
    rmSync(dirname(promptLatestPackPath(ws, "default")), { recursive: true, force: true });
    const report = await run(ws);
    expect(check(report, "prompt-packs")?.status).toBe("FAIL");
    expect(check(report, "prompt-packs")?.details.join(" ")).toContain("the evidence ledger records a pack built for this agent");
    expect(check(report, "transparency-log")?.status).toBe("FAIL");
    expect(report.notConfigured).not.toContain("prompt-packs");
  });

  /** A preview workspace with one A4 project created after `before` was taken; verification then runs without the preview flag. */
  async function a4Created() {
    const { workspace, alice, sessionId } = a4Workspace();
    const ledger = openLedger(workspace);
    try { ledger.sealSession(sessionId); } finally { ledger.close(); }
    const before = snapshot(workspace);
    await A4Project.create(workspace, alice);
    expect([ledgerRows(workspace, "A4_PROJECT_CREATED"), logRows(workspace, "A4_PROJECT_CREATED")]).toEqual([1, 1]);
    vi.unstubAllEnvs();
    return { workspace, before };
  }

  test("an A4 project rolled out of the ledger alone fails: the transparency log records it was created", async () => {
    const { workspace, before } = await a4Created();
    expect(check(await run(workspace), "a4-projects")?.status).toBe("PASS");
    before.restoreLedger();
    const report = await run(workspace);
    expect(check(report, "a4-projects")?.status).toBe("FAIL");
    expect(check(report, "a4-projects")?.details.join(" ")).toContain("transparency log");
    expect(report.notConfigured).not.toContain("a4-projects");
    expect(report.status).toBe("FAIL");
  });

  test("an A4 project with only the log rolled back fails the transparency log", async () => {
    const { workspace, before } = await a4Created();
    before.restoreLog();
    const report = await run(workspace);
    expect(check(report, "a4-projects")?.status).toBe("PASS");
    expect(check(report, "transparency-log")?.details.join(" ")).toContain("A4_PROJECT_CREATED");
  });

  test("the A4 projects and their witnesses are read on the verified handle: both records rolled back after verification change nothing", async () => {
    const { workspace, before } = await a4Created();
    before.restoreLog();
    hook.afterLedgerVerify = () => before.restoreLedger();
    const report = await run(workspace);
    expect(check(report, "a4-projects")?.status).toBe("PASS");
    expect(check(report, "transparency-log")?.details.join(" ")).toContain("A4_PROJECT_CREATED");
    expect(report.status).toBe("FAIL");
  });

  test("an A4 chain that fails on the verified ledger still fails when a clean copy is swapped in after verification", async () => {
    const { workspace, alice, sessionId } = a4Workspace();
    const project = await A4Project.create(workspace, alice);
    { const ledger = openLedger(workspace); try { ledger.sealSession(sessionId); } finally { ledger.close(); } }
    vi.unstubAllEnvs();
    const clean = snapshot(workspace);
    closeAllSqlitePools();
    const db = new Database(join(workspace, ".amc", "evidence.sqlite"));
    try {
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name LIKE 'a4_%'").all() as Array<{ name: string }>) db.exec(`DROP TRIGGER ${name}`);
      expect(db.prepare("DELETE FROM a4_transitions WHERE project_id = ?").run(project.projectId).changes).toBeGreaterThan(0);
    } finally { db.close(); }
    hook.afterLedgerVerify = () => clean.restoreLedger();
    const report = await run(workspace);
    expect(check(report, "a4-projects")?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test("a project of an agent whose first project was retired is witnessed on its own: rolled out of the ledger, it fails", async () => {
    const { workspace, alice, sessionId } = a4Workspace();
    const first = await A4Project.create(workspace, alice, "first", "a4-again");
    const store = openA4Store(workspace);
    try { store.transition(first.projectId, A4_RUNTIME, () => ({ kind: "STEP", payload: { fixture: "retire" }, head: { stage: "retired" } })); } finally { store.close(); }
    { const ledger = openLedger(workspace); try { ledger.sealSession(sessionId); } finally { ledger.close(); } }
    const before = snapshot(workspace);
    const second = await A4Project.create(workspace, alice, "second", "a4-again");
    expect([ledgerRows(workspace, "A4_PROJECT_CREATED"), logRows(workspace, "A4_PROJECT_CREATED")]).toEqual([2, 2]);
    vi.unstubAllEnvs();
    before.restoreLedger();
    const rows = (await run(workspace)).checks.filter((row) => row.id === "a4-projects");
    expect(rows.map((row) => row.status)).toEqual(["PASS", "FAIL"]);
    expect(rows[1]!.details.join(" ")).toContain(`A4 project ${second.projectId}`);
  });

  test("a create interrupted after its commit and before its witness writes the witness when the request is replayed", async () => {
    const { workspace, alice } = a4Workspace();
    const body = { clientRequestId: requestId(), name: "interrupted", expertise: "practitioner", agentId: "a4-replayed" };
    hook.failWitness = true;
    expect((await a4(workspace, alice, "POST", "/api/v1/a4/projects", body)).status).toBeGreaterThanOrEqual(500);
    hook.failWitness = false;
    expect([ledgerRows(workspace, "A4_PROJECT_CREATED"), logRows(workspace, "A4_PROJECT_CREATED")]).toEqual([0, 0]);
    const replay = await a4(workspace, alice, "POST", "/api/v1/a4/projects", body);
    expect(replay.status).toBeLessThan(300);
    expect([ledgerRows(workspace, "A4_PROJECT_CREATED"), logRows(workspace, "A4_PROJECT_CREATED")]).toEqual([1, 1]);
    expect(verifiedTransparencyLog(workspace, { readOnly: true }).entries.find((entry) => entry.type === "A4_PROJECT_CREATED")?.artifact.id)
      .toBe(replay.body.data?.projectId);
  });

  test("a second A4 project rolled out of the ledger fails while the first still verifies", async () => {
    const { workspace, alice } = a4Workspace();
    await A4Project.create(workspace, alice, "first", "a4-first");
    const before = snapshot(workspace);
    const second = await A4Project.create(workspace, alice, "second", "a4-second");
    vi.unstubAllEnvs();
    before.restoreLedger();
    const rows = (await run(workspace)).checks.filter((row) => row.id === "a4-projects");
    expect(rows.map((row) => row.status)).toEqual(["PASS", "FAIL"]);
    expect(rows[1]!.details.join(" ")).toContain(`A4 project ${second.projectId}`);
  });

  /** A workspace created before witnessing existed: no WITNESSING_ENABLED pair in either record. */
  function preMarker(): string {
    const ws = temp("amc-verify-witness-");
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated", witnessing: false });
    expect([ledgerRows(ws, "WITNESSING_ENABLED"), logRows(ws, "WITNESSING_ENABLED")]).toEqual([0, 0]);
    return ws;
  }

  test("a fresh workspace records WITNESSING_ENABLED in both records and passes with its parts not configured", async () => {
    const ws = fresh();
    expect([ledgerRows(ws, "WITNESSING_ENABLED"), logRows(ws, "WITNESSING_ENABLED")]).toEqual([1, 1]);
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    expect([ledgerRows(ws, "WITNESSING_ENABLED"), logRows(ws, "WITNESSING_ENABLED")]).toEqual([1, 1]);
    const report = await run(ws);
    expect(report.status).toBe("PASS");
    expect(report.notConfigured).toContain("passport-policy-signature");
  });

  test("a workspace without the marker reads INCOMPLETE, not PASS, for a passport policy that is absent", async () => {
    const ws = preMarker();
    // Re-running init on the existing workspace never backfills the marker.
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    const report = await run(ws);
    expect(report.status).toBe("INCOMPLETE");
    expect(report.skippedCritical).toEqual(["passport-policy-signature", "a4-projects"]);
    for (const id of ["prompt-scheduler-signature", "prompt-packs", "forecast-signatures"]) expect(check(report, id)?.status).toBe("SKIP");
    expect(report.notConfigured).not.toContain("passport-policy-signature");
  });

  test("a workspace without the marker fails once amc passport init witnessed the policy and it was then deleted", async () => {
    const ws = preMarker();
    passportInitForApi(ws);
    removePair(passportPolicyPath(ws));
    const report = await run(ws);
    expect(check(report, "passport-policy-signature")?.status).toBe("FAIL");
    expect(report.status).toBe("FAIL");
  });

  test.each([
    ["the log rolled back", (records: ReturnType<typeof snapshot>) => records.restoreLog(), "evidence ledger records WITNESSING_ENABLED"],
    ["the ledger rolled back", (records: ReturnType<typeof snapshot>) => records.restoreLedger(), "transparency log records WITNESSING_ENABLED"]
  ])("the marker in one record only fails the transparency log (%s)", async (_how, rollBack, detail) => {
    const ws = preMarker(), before = snapshot(ws);
    witnessingEnabled(ws);
    expect(check(await run(ws), "transparency-log")?.status).toBe("PASS");
    rollBack(before);
    const report = await run(ws);
    expect(check(report, "transparency-log")?.status).toBe("FAIL");
    expect(check(report, "transparency-log")?.details.join(" ")).toContain(detail);
    expect(report.notConfigured).not.toContain("passport-policy-signature");
  });
});
