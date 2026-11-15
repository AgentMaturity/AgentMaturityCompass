import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";

// CLI-01: a recorded run that no question accepts must still change what the score tells the user.
describe("score after a recorded run that no question accepts", () => {
  let workspace: string;
  let previousPass: string | undefined;

  beforeEach(() => {
    previousPass = process.env.AMC_VAULT_PASSPHRASE;
    process.env.AMC_VAULT_PASSPHRASE = "synthetic-recorded-activity-passphrase";
    workspace = mkdtempSync(join(tmpdir(), "amc-recorded-activity-"));
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  });

  afterEach(() => {
    lockVault(workspace);
    rmSync(workspace, { recursive: true, force: true });
    if (previousPass === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
    else process.env.AMC_VAULT_PASSPHRASE = previousPass;
  });

  test("an empty workspace says nothing was seen; a recorded run says it was seen but not accepted", async () => {
    const empty = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    expect(empty.recordedActivity).toEqual({ events: 0, sessions: 0 });
    expect(empty.evidenceReadiness?.label).toBe("No accepted evidence");

    const sessionId = "synthetic-wrapped-run";
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({ sessionId, runtime: "any", binaryPath: "node", binarySha256: sha256Hex("node") });
      ledger.appendEvidence({ sessionId, runtime: "any", eventType: "stdout", payload: "hello", meta: { trustTier: "OBSERVED", mode: "wrap-any", agentId: "default" } });
      ledger.sealSession(sessionId);
    } finally { ledger.close(); }

    const recorded = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    expect(recorded.evidenceCoverage).toBe(0); // the output alone is not scored: no inflation
    expect(recorded.layerScores.every((layer) => layer.avgFinalLevel === 0)).toBe(true);
    expect(recorded.recordedActivity).toEqual({ events: 1, sessions: 1 });
    expect(recorded.evidenceReadiness?.label).toBe("Recorded activity, no accepted evidence");
    expect(recorded.evidenceReadiness?.nextStep).toContain("recorded but not scored");
    expect(recorded.evidenceReadiness?.claimEligible).toBe(false);
  }, 120_000);
});
