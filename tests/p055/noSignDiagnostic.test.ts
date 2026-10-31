/**
 * P0-55 cases 4, 10, 11, 16 and 17 (85be32ba, 5b950fba, 5f27fa4b, 452f64d2): under AMC_NO_SIGN=1 the diagnostic
 * reads the signed store read-only with the unsigned store, reports UNSIGNED / integrity 0, and writes its run and its
 * derived audits only to `.amc/unsigned/evidence.sqlite`. `noSign: true` without AMC_NO_SIGN writes no run row at all.
 */
import Database from "better-sqlite3";
import { appendFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import { openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { UNSIGNED_EVIDENCE_STORE } from "../../src/ledger/ledgerConnection.js";
import { initWorkspace } from "../../src/workspace.js";

vi.setConfig({ testTimeout: 120_000 });
let root: string;
let workspace: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "amc-p055-diag-"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p055-diagnostic-fixture");
  vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "checkpoints"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
});
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

type Counts = { events: number; runs: number; audits: string[] };
function counts(relative: string): Counts {
  const path = join(workspace, relative);
  if (!existsSync(path)) return { events: 0, runs: 0, audits: [] };
  const db = new Database(path, { readonly: true });
  try {
    const audits = (db.prepare("SELECT meta_json FROM evidence_events WHERE event_type = 'audit'").all() as Array<{ meta_json: string }>)
      .map((row) => String((JSON.parse(row.meta_json) as { auditType?: unknown }).auditType));
    return { events: (db.prepare("SELECT COUNT(*) AS n FROM evidence_events").get() as { n: number }).n,
      runs: (db.prepare("SELECT COUNT(*) AS n FROM runs").get() as { n: number }).n, audits };
  } finally { db.close(); }
}
const signedStore = () => counts(".amc/evidence.sqlite");
const unsignedStore = () => counts(UNSIGNED_EVIDENCE_STORE);
const diagnose = (noSign = false) => runDiagnostic({ workspace, window: "30d", agentId: "default", ...(noSign ? { noSign: true } : {}) });

/** One signed OBSERVED llm exchange in the signed store, written before no-sign mode. */
function signedEvidence(): void {
  const ledger = openLedger(workspace);
  try {
    const sessionId = "p055-signed-session";
    ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "p055", binarySha256: "0".repeat(64) });
    ledger.appendEvidence({ sessionId, runtime: "gateway", eventType: "llm_request", payload: "{}", payloadExt: "json", inline: true,
      meta: { agentId: "default", trustTier: "OBSERVED", source: "gateway" } });
    ledger.sealSession(sessionId);
  } finally { ledger.close(); }
}

test("case 4: AMC_NO_SIGN=1 on a fresh workspace leaves the signed store's events and runs unchanged; one run in the unsigned store", async () => {
  const before = signedStore();
  vi.stubEnv("AMC_NO_SIGN", "1");
  await diagnose();
  expect(signedStore()).toEqual(before);
  expect(unsignedStore().runs).toBe(1);
});

test("case 17: a clean fresh workspace reads UNSIGNED, integrity 0, not verified, and no FLAG_LEDGER_INVALID", async () => {
  vi.stubEnv("AMC_NO_SIGN", "1");
  const report = await diagnose();
  expect(report.status).toBe("UNSIGNED");
  expect(report.integrityIndex).toBe(0);
  expect(report.verificationPassed).toBe(false);
  expect(report.questionScores.filter((score) => score.flags.includes("FLAG_LEDGER_INVALID"))).toEqual([]);
});

test("case 17: with the signed gateway.yaml edited, every question carries FLAG_LEDGER_INVALID, as the signed run", async () => {
  appendFileSync(join(workspace, ".amc", "gateway.yaml"), "\n# edited after signing\n");
  vi.stubEnv("AMC_NO_SIGN", "1");
  const report = await diagnose();
  expect(report.questionScores.length).toBeGreaterThan(0);
  expect(report.questionScores.every((score) => score.flags.includes("FLAG_LEDGER_INVALID"))).toBe(true);
});

test("case 16: the derived audits of an edited gateway.yaml go to the unsigned store; the signed store's rows are unchanged", async () => {
  appendFileSync(join(workspace, ".amc", "gateway.yaml"), "\n# edited after signing\n");
  const before = signedStore();
  vi.stubEnv("AMC_NO_SIGN", "1");
  await diagnose();
  expect(signedStore()).toEqual(before);
  expect(unsignedStore().audits).toEqual(expect.arrayContaining(["UNSIGNED_GATEWAY_CONFIG", "MISSING_LLM_EVIDENCE"]));
});

test("case 10: signed evidence is still scored, the report is UNSIGNED with integrity 0, and the signed store is unchanged", async () => {
  signedEvidence();
  const before = signedStore();
  vi.stubEnv("AMC_NO_SIGN", "1");
  const report = await diagnose();
  expect(report.status).toBe("UNSIGNED");
  expect(report.status).not.toBe("VALID");
  expect(report.integrityIndex).toBe(0);
  expect(JSON.stringify(report)).not.toContain("Verified evidence chain");
  expect(report.evidenceTrustCoverage.observed).toBe(1); // the signed OBSERVED row is read and counted
  expect(signedStore()).toEqual(before);
  expect(unsignedStore().runs).toBe(1);
});

test("case 11: noSign: true without AMC_NO_SIGN writes the report but no runs row, and the signed ledger still verifies", async () => {
  const report = await diagnose(true);
  expect(existsSync(join(workspace, ".amc", "runs", `${report.runId}.json`))).toBe(true);
  expect(signedStore().runs).toBe(0);
  expect(verifyLedgerIntegrity(workspace).ok).toBe(true);
});
