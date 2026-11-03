/**
 * The remaining AMC_NO_SIGN=1 writers (lane nosignrest, 2026-11-03). Flows whose output is a signed record refuse
 * before writing anything; record-only writers put plain "unsigned" rows in the unsigned store, never in
 * `.amc/evidence.sqlite`, where an unsigned row makes every later signed reader fail.
 */
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { agentToolset } from "../../src/agent/agentToolset.js";
import { handleWatchRoute } from "../../src/api/watchRouter.js";
import { signArtifactProvenance } from "../../src/artifact/artifactProvenance.js";
import { appendBridgeTelemetryEvent } from "../../src/bridge/bridgeTelemetry.js";
import { reserveNativeToolBudget } from "../../src/budgets/nativeBudgetAdmission.js";
import { createFreezeIncident } from "../../src/drift/freezeEngine.js";
import { evalImportCoverageStatus, importEvalResults } from "../../src/eval/evalImporters.js";
import { executeCaseTrials } from "../../src/experiments/trialExecutor.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { UNSIGNED_EVIDENCE_STORE } from "../../src/ledger/ledgerConnection.js";
import { exportReviewTimingCsv, recordReviewTiming } from "../../src/operator/reviewTiming.js";
import { writeEffectivePolicyReceipt } from "../../src/policy/effectivePolicyReceipt.js";
import { checkChangeEnvelopeAtOpen } from "../../src/runtime/changeEnvelope.js";
import { activateKillSwitch } from "../../src/runtime/killSwitch.js";
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

test("the kill switch refuses and writes no kill record", async () => {
  const dir = join(workspace, ".amc", "runtime", "kill-switch"), before = files(dir), rows = signedStore().size;
  await expect(activateKillSwitch({ workspace, issuedBy: "owner-1", scope: { kind: "workspace", id: "workspace" }, mode: "stop_all",
    reason: "probe", incidentId: null })).rejects.toThrow("no-sign mode does not authorize kill switch signing");
  expect(files(dir)).toEqual(before);
  expect(signedStore().size).toBe(rows);
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
  const unsigned = unsignedStore();
  expect(unsigned.get(telemetry.eventId)).toBe("unsigned");
  expect(unsigned.size).toBeGreaterThanOrEqual(4);
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
