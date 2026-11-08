import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { openLedger } from "../src/ledger/ledger.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * LIVE-INTEGRITY-02 (D-INT-2): the gateway's heartbeat and recovery-marker rows are signed OBSERVED `gateway` rows, so
 * unless the runner drops them they would pad trust coverage and AMC-1.7's gateway gates. Two workspaces with the same
 * evidence, one with 300 heartbeats and a marker, must score the same.
 */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } vi.unstubAllEnvs(); });

function workspace(withLivenessRows: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "amc-heartbeat-scoring-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const ledger = openLedger(root);
  try {
    ledger.startSession({ sessionId: "baseline", runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "baseline", runtime: "unknown", eventType: "stdout", payload: "a self-reported row", inline: true });
    ledger.appendEvidence({ sessionId: "baseline", runtime: "unknown", eventType: "stdout", payload: "another row", inline: true });
    ledger.sealSession("baseline");
    ledger.startSession({ sessionId: "gw-idle", runtime: "gateway", binaryPath: "gateway", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "gw-idle", runtime: "gateway", eventType: "gateway", payload: '{"stage":"start"}', meta: { stage: "start", trustTier: "OBSERVED" } });
    if (withLivenessRows) {
      for (let beat = 0; beat < 300; beat += 1) {
        ledger.appendEvidence({ sessionId: "gw-idle", runtime: "gateway", eventType: "gateway", meta: { stage: "heartbeat", trustTier: "OBSERVED" } });
      }
      ledger.appendEvidence({ sessionId: "gw-idle", runtime: "gateway", eventType: "gateway",
        meta: { stage: "interrupted-sealed", lastEventTs: Date.now(), recoveredBy: "gw-next", trustTier: "OBSERVED" } });
    }
    ledger.sealSession("gw-idle");
  } finally { ledger.close(); }
  return root;
}

test("300 heartbeats and a recovery marker change neither trust coverage nor AMC-1.7's score", { timeout: 120_000 }, async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-heartbeat-scoring");
  const score = async (root: string) => {
    const report = await runDiagnostic({ workspace: root, window: "14d", targetName: "default", claimMode: "auto" });
    const q17 = report.questionScores.find((question) => question.questionId === "AMC-1.7")!;
    return { status: report.status, coverage: report.evidenceTrustCoverage, evidenceCoverage: report.evidenceCoverage,
      q17: { supportedMaxLevel: q17.supportedMaxLevel, finalLevel: q17.finalLevel, evidence: q17.evidenceEventIds.length, flags: q17.flags } };
  };
  const without = await score(workspace(false));
  const withRows = await score(workspace(true));
  expect(without.status).toBe("VALID");
  expect(without.coverage.observed).toBeGreaterThan(0);
  expect(without.coverage.selfReported).toBeGreaterThan(0);
  expect(withRows).toEqual(without);
});
