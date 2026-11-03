/**
 * The remaining AMC_NO_SIGN=1 writers (lane nosignrest, 2026-11-03). Flows whose output is a signed record refuse
 * before writing anything; record-only writers put plain "unsigned" rows in the unsigned store, never in
 * `.amc/evidence.sqlite`, where an unsigned row makes every later signed reader fail.
 */
import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { signArtifactProvenance } from "../../src/artifact/artifactProvenance.js";
import { appendBridgeTelemetryEvent } from "../../src/bridge/bridgeTelemetry.js";
import { reserveNativeToolBudget } from "../../src/budgets/nativeBudgetAdmission.js";
import { createFreezeIncident } from "../../src/drift/freezeEngine.js";
import { importEvalResults } from "../../src/eval/evalImporters.js";
import { executeCaseTrials } from "../../src/experiments/trialExecutor.js";
import { UNSIGNED_EVIDENCE_STORE } from "../../src/ledger/ledgerConnection.js";
import { writeEffectivePolicyReceipt } from "../../src/policy/effectivePolicyReceipt.js";
import { recordEnvelopeTestResult } from "../../src/runtime/changeEnvelope.js";
import { activateKillSwitch } from "../../src/runtime/killSwitch.js";
import { recordFenceRefusal } from "../../src/session/writerFence.js";
import { checkpointLedger, completePendingCheckpoints } from "../../src/time/checkpoint.js";
import { initWorkspace } from "../../src/workspace.js";

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

test("ledger checkpoints refuse before reading config or signing", async () => {
  await expect(checkpointLedger(workspace)).rejects.toThrow("no-sign mode does not authorize ledger checkpoint signing");
  await expect(completePendingCheckpoints(workspace)).rejects.toThrow("no-sign mode does not authorize ledger checkpoint signing");
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

test("change envelope test results, effective-policy receipts and provenance refuse", async () => {
  await expect(recordEnvelopeTestResult(workspace, { sessionTokenFile: join(root, "none"), envelopeId: "e", testId: "t", passed: true, manifest: {} as never }))
    .rejects.toThrow("no-sign mode does not authorize change envelope test result signing");
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
