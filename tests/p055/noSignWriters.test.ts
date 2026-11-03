/**
 * The remaining AMC_NO_SIGN=1 writers (lane nosignrest, 2026-11-03). Flows whose output is a signed record refuse
 * before writing anything; record-only writers put plain "unsigned" rows in the unsigned store, never in
 * `.amc/evidence.sqlite`, where an unsigned row makes every later signed reader fail.
 */
import Database from "better-sqlite3";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { agentToolset } from "../../src/agent/agentToolset.js";
import { handleIncidentRoute } from "../../src/api/incidentRouter.js";
import { handleWatchRoute } from "../../src/api/watchRouter.js";
import { signArtifactProvenance } from "../../src/artifact/artifactProvenance.js";
import { appendBridgeTelemetryEvent } from "../../src/bridge/bridgeTelemetry.js";
import { reserveNativeToolBudget } from "../../src/budgets/nativeBudgetAdmission.js";
import { createFreezeIncident } from "../../src/drift/freezeEngine.js";
import { evalImportCoverageStatus, importEvalResults } from "../../src/eval/evalImporters.js";
import { executeCaseTrials } from "../../src/experiments/trialExecutor.js";
import { createIncidentStore, unsignedIncidents } from "../../src/incidents/incidentStore.js";
import { revokeKeyAsync } from "../../src/keys/purposeKeys.js";
import { signPurposeRevocationList, signWithPurposeKey } from "../../src/keys/purposeProviders.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { controlCheckpointDir } from "../../src/lifecycle/signedControlJournalRecords.js";
import { UNSIGNED_EVIDENCE_STORE } from "../../src/ledger/ledgerConnection.js";
import { exportReviewTimingCsv, recordReviewTiming } from "../../src/operator/reviewTiming.js";
import { appendOpsAuditEvent } from "../../src/ops/audit.js";
import { writeEffectivePolicyReceipt } from "../../src/policy/effectivePolicyReceipt.js";
import { checkChangeEnvelopeAtOpen } from "../../src/runtime/changeEnvelope.js";
import { activateKillSwitch, killSwitchDenial, killSwitchStatus, releaseKillSwitch } from "../../src/runtime/killSwitch.js";
import { runKillSwitchDrill } from "../../src/runtime/killSwitchDrill.js";
import { runProviderExitDrill } from "../../src/runtime/providerExit.js";
import { recordFenceRefusal } from "../../src/session/writerFence.js";
import { checkpointLedger, checkpointsDir, completePendingCheckpoints } from "../../src/time/checkpoint.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig, signAmcConfig } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string;
let workspace: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "amc-nosign-writers-")));
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  vi.stubEnv("AMC_NO_SIGN", "1");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** Writer signatures in one store, keyed by event id; empty when the store does not exist. */
function signatures(rel: string): Map<string, string> {
  const path = join(workspace, rel);
  if (!existsSync(path)) return new Map();
  const db = new Database(path, { readonly: true });
  try {
    return new Map((db.prepare("SELECT id, writer_sig FROM evidence_events").all() as Array<{ id: string; writer_sig: string }>).map(r => [r.id, r.writer_sig]));
  } finally { db.close(); }
}
const signedStore = () => signatures(".amc/evidence.sqlite");
const unsignedStore = () => signatures(UNSIGNED_EVIDENCE_STORE);
const files = (dir: string) => { try { return readdirSync(dir).sort(); } catch { return []; } };
/** A signed config change, made with signing on, then back to no-sign. */
function signedConfig(change: (config: ReturnType<typeof loadAMCConfig>) => void): void {
  vi.stubEnv("AMC_NO_SIGN", "0");
  const config = loadAMCConfig(workspace); change(config); saveAMCConfig(workspace, config); signAmcConfig(workspace);
  vi.stubEnv("AMC_NO_SIGN", "1");
}
async function postWatch(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  req.method = "POST"; req.url = path;
  let status = 0, text = "";
  const res = { writeHead(code: number) { status = code; }, end(chunk?: string) { text = chunk ?? ""; }, setHeader() {} } as unknown as ServerResponse;
  expect(await handleWatchRoute(path, "POST", req, res, workspace)).toBe(true);
  const parsed = JSON.parse(text) as { data?: Record<string, unknown> } & Record<string, unknown>;
  return { status, data: parsed.data ?? parsed };
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = "GET"; req.url = path;
  let text = "";
  const res = { writeHead() {}, end(chunk?: string) { text = chunk ?? ""; }, setHeader() {} } as unknown as ServerResponse;
  expect(await handleIncidentRoute(path.split("?")[0]!, "GET", req, res, workspace)).toBe(true);
  const parsed = JSON.parse(text) as { data?: Record<string, unknown> } & Record<string, unknown>;
  return parsed.data ?? parsed;
}

test("ledger checkpoints with a configured TSA refuse before signing or writing a checkpoint", async () => {
  signedConfig(config => { config.time = { required: false, tsa: [{ name: "probe-tsa", url: "https://tsa.invalid/", anchorIds: ["probe-anchor"] }] }; });
  // A signed ledger head to checkpoint, written with signing on.
  vi.stubEnv("AMC_NO_SIGN", "0");
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "seed", runtime: "unknown", binaryPath: "seed", binarySha256: "seed" });
    ledger.appendEvidence({ sessionId: "seed", runtime: "unknown", eventType: "audit", payload: "{}", inline: true, meta: { auditType: "SEED" } });
    ledger.sealSession("seed");
  } finally { ledger.close(); }
  vi.stubEnv("AMC_NO_SIGN", "1");
  await expect(checkpointLedger(workspace)).rejects.toThrow("no-sign mode does not authorize ledger checkpoint signing");
  await expect(completePendingCheckpoints(workspace)).rejects.toThrow("no-sign mode does not authorize ledger checkpoint signing");
  expect(files(checkpointsDir(workspace))).toEqual([]);
});

test("the retained sync freeze incident refuses and publishes no incident", () => {
  const dir = join(workspace, ".amc", "agents", "default", "incidents"), before = files(dir);
  expect(() => createFreezeIncident({ workspace, agentId: "default", ruleId: "nosign", previousRunId: "a", currentRunId: "b",
    deltas: { overallDrop: 1, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 1 }, actionClasses: ["WRITE_LOW"], reason: "probe" }))
    .toThrow("no-sign mode does not authorize policy signing");
  expect(files(dir)).toEqual(before);
});

describe("the kill switch under no-sign", () => {
  const killDir = () => join(workspace, ".amc", "runtime", "kill-switch");
  const write = (row: object) => writeFileSync(join(killDir(), `planted-${Math.random().toString(16).slice(2)}.json`), JSON.stringify(row));
  const tool = (agentId: string, actionClass: "READ_ONLY" | "WRITE_LOW") => ({ kind: "tool" as const, agentId, actionClass });

  test("an unsigned kill stops the scope it names, is recorded unsigned, and cannot be released under no-sign", async () => {
    const rows = signedStore().size;
    const kill = await activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "agent", id: "agent-a" }, mode: "stop_new_effects",
      reason: "emergency", incidentId: "inc-1" });
    expect(kill.signature).toBe("unsigned");
    expect(killSwitchDenial(workspace, tool("agent-a", "WRITE_LOW"))).toContain(`kill_switch_active: ${kill.killId}`);
    expect(killSwitchDenial(workspace, tool("agent-a", "READ_ONLY"))).toBeNull();
    expect(killSwitchDenial(workspace, tool("agent-b", "WRITE_LOW"))).toBeNull();
    expect(signedStore().size).toBe(rows);
    expect([...unsignedStore().values()]).toEqual(["unsigned"]);
    const before = files(killDir());
    await expect(releaseKillSwitch({ workspace, releasedBy: "owner-1", killId: kill.killId, incidentId: "inc-1" }))
      .rejects.toThrow("no-sign mode cannot release a kill");
    expect(files(killDir())).toEqual(before);
    // A signing session's signed OWNER release lifts it.
    vi.stubEnv("AMC_NO_SIGN", "0");
    await releaseKillSwitch({ workspace, releasedBy: "owner-1", killId: kill.killId, incidentId: "inc-1" });
    expect(killSwitchDenial(workspace, tool("agent-a", "WRITE_LOW"))).toBeNull();
  });

  test("an unsigned kill opens an incident that the incident list shows, labelled unsigned", async () => {
    const kill = await activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "agent", id: "agent-a" }, mode: "stop_new_effects",
      reason: "emergency", incidentId: null });
    const listed = await getJson("/api/v1/incidents?agent=agent-a");
    expect(listed).toMatchObject({ count: 0, incidents: [] });
    expect((listed.unsigned as Record<string, unknown>).incidents).toEqual([expect.objectContaining({ agentId: "agent-a", state: "OPEN", unsigned: true,
      title: "Kill switch activated (KILL_SWITCH_ACTIVATED)" })]);
    expect(unsignedIncidents(workspace, "agent-a").incidents[0]?.triggerId).toBe(`kill_switch:${kill.killId}`);
    const cli = spawnSync(process.execPath, [resolve("dist/cli.js"), "incident", "list", "--agent", "agent-a"], { cwd: workspace, encoding: "utf8",
      env: { ...process.env, AMC_NO_SIGN: "1", AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"), NO_COLOR: "1" }, timeout: 60_000 });
    expect(cli.stdout, cli.stderr).toMatch(/\[CRITICAL\/OPEN\]  Kill switch activated \(KILL_SWITCH_ACTIVATED\)  \(unsigned\)/);
    // The signed store holds no incident: an unsigned one there would fail every signed incident reader.
    vi.stubEnv("AMC_NO_SIGN", "0");
    const signed = openLedger(workspace);
    try { const store = createIncidentStore(signed.db); store.initTables(); expect(store.getIncidentsByAgent("agent-a")).toEqual([]); }
    finally { signed.close(); }
    // A signing session lists it too, so the kill it still enforces stays visible.
    expect((await getJson("/api/v1/incidents?agent=agent-a")).unsigned).toMatchObject({ count: 1, unreadable: false });
  });

  /** Incidents written straight into a store, signed or unsigned: the list reads, never verifies, them. */
  function seedIncidents(store: string, rows: Array<{ id: string; createdTs: number; severity?: "WARN" | "CRITICAL" }>): void {
    mkdirSync(join(workspace, store, ".."), { recursive: true });
    const db = new Database(join(workspace, store));
    try {
      const incidents = createIncidentStore(db); incidents.initTables();
      for (const row of rows) incidents.insertIncident({ incidentId: row.id, agentId: "agent-a", severity: row.severity ?? "WARN", state: "OPEN", title: row.id,
        description: "seeded", triggerType: "MANUAL", triggerId: row.id, rootCauseClaimIds: [], affectedQuestionIds: [], causalEdges: [],
        timelineEventIds: [], createdTs: row.createdTs, updatedTs: row.createdTs, resolvedTs: null, postmortemRef: null,
        prev_incident_hash: "0", incident_hash: row.id, signature: "seeded" });
    } finally { db.close(); }
  }
  const titles = (listed: Record<string, unknown>) => (listed.incidents as Array<{ title: string }>).map((row) => row.title);
  const KILL_TITLE = "Kill switch activated (KILL_SWITCH_ACTIVATED)";

  const section = (listed: Record<string, unknown>) => listed.unsigned as Record<string, unknown>;
  const cliEnv = () => ({ ...process.env, AMC_NO_SIGN: "1", AMC_CONTROL_CHECKPOINT_DIR: join(root, "checkpoints"), NO_COLOR: "1" });
  const listCli = (...args: string[]) => spawnSync(process.execPath, [resolve("dist/cli.js"), "incident", "list", "--agent", "agent-a", ...args],
    { cwd: workspace, encoding: "utf8", env: cliEnv(), timeout: 30_000 });

  test("unsigned incidents are listed apart: planted future-dated rows never displace a signed one, and OPEN CRITICAL passes the limit", async () => {
    await activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "agent", id: "agent-a" }, mode: "stop_new_effects",
      reason: "emergency", incidentId: null });
    const now = Date.now();
    // Planted: three far in the future, one before the workspace existed, two in the clock-skew window above the kill's.
    seedIncidents(UNSIGNED_EVIDENCE_STORE, [{ id: "future-1", createdTs: now + 1e9 }, { id: "future-2", createdTs: now + 2e9 },
      { id: "future-3", createdTs: now + 3e9 }, { id: "ancient", createdTs: 1_000 }, { id: "skew-1", createdTs: now + 60_000 },
      { id: "skew-2", createdTs: now + 120_000 }]);
    vi.stubEnv("AMC_NO_SIGN", "0");
    openLedger(workspace).close();
    seedIncidents(".amc/evidence.sqlite", [{ id: "signed-new", createdTs: now - 1_000 }, { id: "signed-mid", createdTs: now - 2_000 },
      { id: "signed-critical", createdTs: 2_000, severity: "CRITICAL" }]);
    const all = await getJson("/api/v1/incidents?agent=agent-a");
    expect(titles(all)).toEqual(["signed-new", "signed-mid", "signed-critical"]);
    expect(titles(section(all))).toEqual(["skew-2", "skew-1", KILL_TITLE]);
    expect(section(all)).toMatchObject({ rejected: 4, unreadable: false });
    expect(all.warnings).toEqual(["4 unsigned incident(s) dated in the future or before the workspace are not shown"]);
    const limited = await getJson("/api/v1/incidents?agent=agent-a&limit=1");
    expect(titles(limited)).toEqual(["signed-new", "signed-critical"]);
    expect(limited).toMatchObject({ count: 2, pinnedPastLimit: 1 });
    expect(titles(section(limited))).toEqual(["skew-2", KILL_TITLE]);
    expect(section(limited)).toMatchObject({ count: 2, pinnedPastLimit: 1 });
    // A limit that is not a positive integer falls back to 50.
    for (const bad of ["-1", "0", "abc", "2x", "1.5"]) expect(titles(await getJson(`/api/v1/incidents?agent=agent-a&limit=${bad}`)), bad).toHaveLength(3);
    const cli = listCli("--limit", "1");
    expect(cli.stdout, cli.stderr).toMatch(/signed-new[\s\S]*signed-critical\n1 OPEN CRITICAL incident\(s\) shown past --limit\.\nUnsigned incidents[^\n]*\n.*skew-2.*\(unsigned\)\n.*\[CRITICAL\/OPEN\]  Kill switch activated.*\(unsigned\)\n1 unsigned OPEN CRITICAL incident\(s\) shown past --limit\./);
    expect(cli.stdout).not.toMatch(/future|ancient|signed-mid/);
    expect(cli.stderr).toContain("Warning: 4 unsigned incident(s) dated in the future or before the workspace are not shown.");
    for (const bad of ["0", "-1", "2x", "1.5"]) {
      const refused = listCli("--limit", bad);
      expect(refused.status, bad).not.toBe(0);
      expect(refused.stderr, bad).toContain("limit must be a positive integer");
    }
  });

  test("an unsigned store that is a FIFO, or a symlink, is never opened", async () => {
    vi.stubEnv("AMC_NO_SIGN", "0");
    openLedger(workspace).close();
    seedIncidents(".amc/evidence.sqlite", [{ id: "signed", createdTs: 1_000 }]);
    const path = join(workspace, UNSIGNED_EVIDENCE_STORE);
    mkdirSync(join(path, ".."), { recursive: true });
    // A real store with an incident, outside the workspace: a symlink to it must not be followed.
    const outside = join(root, "outside.sqlite");
    seedIncidents(UNSIGNED_EVIDENCE_STORE, [{ id: "outside", createdTs: Date.now() }]);
    renameSync(path, outside);
    const plants: Array<[string, () => void]> = [
      ["a FIFO", () => execFileSync("mkfifo", [path])],
      ["a symlink out of the workspace", () => symlinkSync(outside, path)],
      ["a symlink inside the workspace", () => { copyFileSync(outside, `${path}.real`); symlinkSync(`${path}.real`, path); }]
    ];
    for (const [name, plant] of plants) {
      rmSync(path, { force: true }); plant();
      // In a child process with a timeout: a blocking open would hang this worker past any test timeout.
      const cli = listCli();
      expect(cli.status, `${name}: ${cli.stderr}`).toBe(0);
      expect(cli.stdout, name).toContain("signed");
      expect(cli.stdout, name).not.toContain("outside");
      expect(cli.stderr, name).toContain("Warning: the unsigned evidence store could not be read");
      if (name.startsWith("a symlink")) {
        expect(await getJson("/api/v1/incidents?agent=agent-a"), name).toMatchObject({ count: 1, unsigned: { count: 0, unreadable: true } });
      }
    }
  });

  test("an unreadable unsigned store never fails the signed incident list, in either mode", async () => {
    vi.stubEnv("AMC_NO_SIGN", "0");
    openLedger(workspace).close();
    seedIncidents(".amc/evidence.sqlite", [{ id: "signed", createdTs: 1_000 }]);
    const path = join(workspace, UNSIGNED_EVIDENCE_STORE);
    mkdirSync(join(path, ".."), { recursive: true });
    const plants: Array<[string, () => void]> = [
      ["not a database", () => writeFileSync(path, "not a database".repeat(1_000))],
      ["no transition table", () => { const db = new Database(path); db.exec("CREATE TABLE incidents (incident_id TEXT)"); db.close(); }],
      ["a transition table without to_state", () => { seedIncidents(UNSIGNED_EVIDENCE_STORE, [{ id: "u", createdTs: Date.now() }]);
        const db = new Database(path); db.exec("DROP TABLE incident_transitions; CREATE TABLE incident_transitions (incident_id TEXT, ts INTEGER)"); db.close(); }],
      ["a malformed row", () => { seedIncidents(UNSIGNED_EVIDENCE_STORE, [{ id: "u", createdTs: Date.now() }]);
        const db = new Database(path);
        for (const { name: trigger } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all() as Array<{ name: string }>) db.exec(`DROP TRIGGER "${trigger}"`);
        db.exec("UPDATE incidents SET causal_edges_json = '{'"); db.close(); }]
    ];
    for (const [name, plant] of plants) {
      rmSync(path, { force: true }); plant();
      for (const mode of ["0", "1"]) {
        vi.stubEnv("AMC_NO_SIGN", mode);
        const listed = await getJson("/api/v1/incidents?agent=agent-a");
        expect(listed, `${name}, AMC_NO_SIGN=${mode}`).toMatchObject({ count: 1, unsigned: { unreadable: true }, incidents: [{ title: "signed" }] });
        expect(listed.warnings).toEqual(["the unsigned evidence store could not be read; unsigned incidents are not shown"]);
      }
    }
  });

  test("the unsigned store is read newest first and at most 500 incidents deep", () => {
    seedIncidents(UNSIGNED_EVIDENCE_STORE, Array.from({ length: 600 }, (_, index) => ({ id: `u-${index}`, createdTs: Date.now() - 100_000 + index })));
    const listed = unsignedIncidents(workspace, "agent-a");
    expect(listed.unreadable).toBe(false);
    expect(listed.incidents).toHaveLength(500);
    expect(listed.incidents[0]?.incidentId).toBe("u-599");
  });

  test("no unsigned record releases or narrows a signed kill", async () => {
    vi.stubEnv("AMC_NO_SIGN", "0");
    const signed = await activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "workspace", id: "workspace" }, mode: "stop_all",
      reason: "signed", incidentId: "inc-1" });
    vi.stubEnv("AMC_NO_SIGN", "1");
    // The reader takes the workspace directory before the mirror, so with the mirror holding only the unsigned twin it
    // is read after the signed copy whatever order the file system lists names in.
    const mirror = controlCheckpointDir(workspace, "kill-switch");
    for (const name of readdirSync(mirror)) rmSync(join(mirror, name));
    writeFileSync(join(mirror, "planted.json"),
      JSON.stringify({ ...signed, scope: { kind: "agent", id: "nobody" }, mode: "stop_new_effects", signature: "unsigned" }));
    expect(killSwitchDenial(workspace, tool("default", "READ_ONLY"))).toContain(`kill_switch_active: ${signed.killId} (workspace:workspace, stop_all)`);
    write({ v: 1, release: true, killId: signed.killId, incidentId: "inc-1", releasedBy: "owner-1", releasedTs: Date.now(), signature: "unsigned" });
    expect(killSwitchStatus(workspace).unverifiable).toHaveLength(1);
    expect(killSwitchDenial(workspace, tool("default", "READ_ONLY"))).toContain("unverifiable kill-switch record treated as an active stop_all");
  });

  test("an unsigned kill whose scope is not a plain id stops everything", () => {
    mkdirSync(killDir(), { recursive: true });
    write({ v: 1, killId: "kill_x", scope: { kind: "agent", id: "" }, mode: "stop_new_effects", reason: "r", incidentId: null,
      issuedBy: "o", issuedTs: Date.now(), signature: "unsigned" });
    expect(killSwitchDenial(workspace, tool("default", "READ_ONLY"))).toContain("treated as an active stop_all");
  });

  test("the drills refuse before activating a kill they could not release", async () => {
    await expect(runKillSwitchDrill({ workspace, actions: 1 })).rejects.toThrow("no-sign mode does not authorize drills");
    await expect(runProviderExitDrill({ workspace, agentId: "default", provider: "openai" })).rejects.toThrow("no-sign mode does not authorize drills");
    expect(files(killDir())).toEqual([]);
  });
});

test("the shared purpose signer refuses every purpose but the session credential", async () => {
  await expect(signWithPurposeKey(workspace, "artifact-seal", Buffer.from("probe"))).rejects.toThrow("no-sign mode does not authorize artifact-seal signing");
  await expect(signWithPurposeKey(workspace, "receipt", Buffer.from("probe"))).rejects.toThrow("no-sign mode does not authorize receipt signing");
  expect((await signWithPurposeKey(workspace, "session", Buffer.from("probe"))).signature.length).toBeGreaterThan(0);
});

test("key revocation and the shared revocation-list signer refuse", async () => {
  await expect(signPurposeRevocationList(workspace, {} as never)).rejects.toThrow("no-sign mode does not authorize revocation-list signing");
  await expect(revokeKeyAsync(workspace, "receipt", "probe-key", "superseded", "passphrase")).rejects.toThrow("Key revocation is unavailable in no-sign mode");
});

// Change envelope test results refuse too; that case needs an authenticated tester and an active envelope (tests/runtime/changeEnvelope.test.ts).
test("effective-policy receipts and provenance refuse", () => {
  expect(() => writeEffectivePolicyReceipt({ workspace, record: () => null } as never)).toThrow("no-sign mode does not authorize effective-policy receipt signing");
  expect(existsSync(join(workspace, ".amc", "effective-policy"))).toBe(false);
  const file = join(workspace, "artifact.txt"); writeFileSync(file, "hello");
  expect(() => signArtifactProvenance({ workspace, file, agentId: "default", modelId: "m" })).toThrow("artifact provenance signing is unavailable in no-sign mode");
  expect(existsSync(`${file}.amcprov.json`) || existsSync(`${file}.amcprov.sig.json`)).toBe(false);
});

test("native budget admission and executed trials refuse before writing a row", async () => {
  const rows = signedStore().size;
  expect(reserveNativeToolBudget({ workspace, agentId: "default", effectiveMode: "EXECUTE", token: "t", callId: "c", actionClass: "WRITE_LOW" } as never, "s1"))
    .toContain("AMC_NO_SIGN=1 cannot reserve");
  await expect(executeCaseTrials({ workspace, casebookId: "book", caseIds: ["c"], mode: "supervise", runTrial: async () => ({ ok: true }) as never,
    arms: [{ side: "baseline" }, { side: "candidate" }] as never })).rejects.toThrow("no-sign mode does not authorize executed trials");
  expect(signedStore().size).toBe(rows);
  expect(unsignedStore().size).toBe(0);
});

test("record-only writers put unsigned rows in the unsigned store only", () => {
  const signedBefore = signedStore();
  expect(recordFenceRefusal(workspace, { sessionId: "s", code: "STALE", stage: "append", eventType: null, writerToken: "w", writerEpoch: 1,
    currentToken: null, currentEpoch: null })).toBeNull();
  const telemetry = appendBridgeTelemetryEvent({ workspace, agentId: "default", event: { sessionId: "bridge-s", eventType: "agent_stdout", payload: "out" } });
  const evalFile = join(workspace, "eval.json");
  writeFileSync(evalFile, JSON.stringify({ results: [{ id: "oa-1", name: "probe", pass: true, score: 1 }] }));
  importEvalResults({ workspace, format: "openai", file: evalFile });
  // Ops audits: the deletion gate's record and the kill switch's alerts.
  const ops = appendOpsAuditEvent({ workspace, auditType: "KILL_SWITCH_UNVERIFIABLE", severity: "CRITICAL", payload: { files: [] } });
  const unsigned = unsignedStore();
  expect(unsigned.get(telemetry.eventId)).toBe("unsigned");
  expect(unsigned.get(ops.eventId)).toBe("unsigned");
  expect(unsigned.size).toBeGreaterThanOrEqual(5);
  expect([...unsigned.values()].every(sig => sig === "unsigned")).toBe(true);
  const signedAfter = signedStore();
  expect(signedAfter.size).toBe(signedBefore.size);
  expect([...signedAfter.values()].includes("unsigned")).toBe(false);
});

test("eval import status reads the unsigned store the import wrote", () => {
  const evalFile = join(workspace, "eval.json");
  writeFileSync(evalFile, JSON.stringify({ results: [{ id: "oa-1", name: "probe", pass: true, score: 1 }] }));
  importEvalResults({ workspace, format: "openai", file: evalFile });
  expect(evalImportCoverageStatus({ workspace })).toMatchObject({ totalImportedCases: 1 });
});

test("review timing start and complete write unsigned rows, and the export reads them back", () => {
  signedConfig(config => { config.operator = { reviewTiming: { enabled: true } }; });
  const signedBefore = signedStore().size, t0 = Date.parse("2026-11-03T10:00:00.000Z");
  const started = recordReviewTiming({ workspace, subject: "reviewer", nowTs: t0, input: { event: "review_session_started", noticeAccepted: true, packetId: "rp_probe" } });
  // Each later event reads the start back, from the store it was written to.
  recordReviewTiming({ workspace, subject: "reviewer", nowTs: t0 + 500, input: { event: "review_item_decided", sessionId: started.sessionId, itemId: "i", decision: "disputed", activeSeconds: 1 } });
  const completed = recordReviewTiming({ workspace, subject: "reviewer", nowTs: t0 + 1000, input: { event: "review_session_completed", sessionId: started.sessionId, activeSeconds: 1 } });
  const unsigned = unsignedStore();
  expect([unsigned.get(started.eventId), unsigned.get(completed.eventId)]).toEqual(["unsigned", "unsigned"]);
  expect(signedStore().size).toBe(signedBefore);
  expect(exportReviewTimingCsv(workspace, t0 - 1, t0 + 60_000)).toContain(started.sessionId);
});

test("watch attest and oversight write unsigned rows to the unsigned store", async () => {
  const signedBefore = signedStore().size;
  const attest = await postWatch("/api/v1/watch/attest", { output: "agent output" });
  const oversight = await postWatch("/api/v1/watch/oversight", { event: "human_review" });
  expect([attest.status, oversight.status]).toEqual([200, 200]);
  const unsigned = unsignedStore();
  expect([unsigned.get(String(attest.data.eventId)), unsigned.get(String(oversight.data.eventId))]).toEqual(["unsigned", "unsigned"]);
  expect(signedStore().size).toBe(signedBefore);
});

test("the change envelope session-open audit writes an unsigned row to the unsigned store", () => {
  const signedBefore = signedStore().size, live = { v: 1, agentId: "default" } as never;
  checkChangeEnvelopeAtOpen({ workspace, agentId: "default", live,
    decision: { outcome: "allow_in_envelope", envelopeId: "env-probe", changed: ["prompt"], reasons: [], unpinned: false } as never });
  const db = new Database(join(workspace, UNSIGNED_EVIDENCE_STORE), { readonly: true });
  try {
    expect(db.prepare("SELECT writer_sig FROM evidence_events WHERE json_extract(meta_json, '$.auditType') = 'CHANGE_ENVELOPE_APPLIED'").all()).toEqual([{ writer_sig: "unsigned" }]);
  } finally { db.close(); }
  expect(signedStore().size).toBe(signedBefore);
});

test("a toolset without a writer records into its session in the unsigned store", () => {
  const sessionId = "nosign-toolset-session", ledger = openLedger(workspace, { store: "unsigned" });
  try { ledger.startSession({ sessionId, runtime: "amc", binaryPath: "test", binarySha256: "test" }); } finally { ledger.close(); }
  const signedBefore = signedStore().size, toolset = agentToolset({ workspace, agentId: "default", sessionId });
  try {
    const eventId = toolset.recordAudit!({ auditType: "NOSIGN_PROBE" });
    expect(unsignedStore().get(String(eventId))).toBe("unsigned");
  } finally { void toolset.close(); }
  expect(signedStore().size).toBe(signedBefore);
});
