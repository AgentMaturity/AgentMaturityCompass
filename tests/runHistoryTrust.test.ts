import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runFleetIndices } from "../src/assurance/indices.js";
import { createBenchArtifact } from "../src/bench/benchArtifact.js";
import { initBenchPolicy } from "../src/bench/benchPolicyStore.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { collectForecastSignals } from "../src/forecast/forecastSignals.js";
import { listTrustedRuns, scanTrustedRuns } from "../src/governor/runTrust.js";
import { startTrustDriftMonitor } from "../src/monitor/trustDriftMonitor.js";
import type { DiagnosticReport } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";
import { writeAnchoredRun } from "./helpers/sealedRun.js";

/**
 * History readers (bench, forecast, indices, trust drift) read runs through `scanTrustedRuns`: a sealed run copied from
 * another agent, a sealed run with no ledger row, or a history thinned by deleting run files must not count silently.
 */
const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspace(): string {
  process.env.AMC_VAULT_PASSPHRASE ??= "run-history-trust-pass";
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "amc-run-history-")));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initBenchPolicy(dir);
  return dir;
}

function report(agentId: string, runId: string, ts: number, integrityIndex = 0.9): DiagnosticReport {
  const level = integrityIndex * 5;
  return {
    agentId, runId, ts, windowStartTs: ts - 86_400_000, windowEndTs: ts, status: "VALID", verificationPassed: true,
    trustBoundaryViolated: false, trustBoundaryMessage: null, integrityIndex, trustLabel: "HIGH TRUST", targetProfileId: "default",
    layerScores: (["Strategic Agent Operations", "Leadership & Autonomy", "Culture & Alignment", "Resilience", "Skills"] as const)
      .map((layerName) => ({ layerName, avgFinalLevel: level, confidenceWeightedFinalLevel: level })),
    questionScores: [], inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 0.95,
    invalidReceiptsCount: 0, correlationWarnings: [], evidenceCoverage: 0.9, evidenceTrustCoverage: { observed: 0.9, attested: 0.1, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [], runSealSig: "", reportJsonSha256: ""
  } as DiagnosticReport;
}

const runsDir = (ws: string, agentId: string) => getAgentPaths(ws, agentId).runsDir;
const own = (ws: string, runId: string, ts: number, integrityIndex?: number) =>
  writeAnchoredRun(ws, runsDir(ws, "default"), report("default", runId, ts, integrityIndex));
/** Agent B's genuine, anchored run copied into the default agent's runs dir: sealed and anchored, but not the default agent's. */
function plantCopy(ws: string, runId: string, ts: number, integrityIndex?: number): void {
  const file = writeAnchoredRun(ws, runsDir(ws, "agent-b"), report("agent-b", runId, ts, integrityIndex));
  mkdirSync(runsDir(ws, "default"), { recursive: true });
  copyFileSync(file, join(runsDir(ws, "default"), `${runId}.json`));
}
const bench = (ws: string) => createBenchArtifact({ workspace: ws, scope: "agent", id: "default", outFile: join(ws, "out.amcbench"), windowDays: 30 });

describe("trusted run history", () => {
  test("bench export signs anchored own runs, and refuses a sealed run copied from another agent", () => {
    const ws = workspace(), now = Date.now();
    own(ws, "run_own", now - 2 * 86_400_000);
    expect(bench(ws).outFile).toBe(join(ws, "out.amcbench"));

    plantCopy(ws, "run_copied", now - 86_400_000);
    expect(() => bench(ws)).toThrow(/run history for agent default is not trusted: .*run_copied is sealed for agent agent-b, not default/);
  });

  test("forecast signals refuse a sealed run with no ledger row", () => {
    const ws = workspace(), now = Date.now();
    own(ws, "run_own", now - 2 * 86_400_000);
    expect(collectForecastSignals({ workspace: ws, scope: { type: "AGENT", id: "default" } }).runRefs).toContain("run_own");

    writeAnchoredRun(ws, runsDir(ws, "default"), report("default", "run_unanchored", now - 86_400_000), { anchor: false });
    expect(() => collectForecastSignals({ workspace: ws, scope: { type: "AGENT", id: "default" } }))
      .toThrow(/run_unanchored is not anchored in the ledger/);
  });

  test("fleet failure-risk indices refuse a copied run", () => {
    // The fleet reader walks .amc/agents/<id>, so the victim here is agent-b and the copy is the default agent's run.
    const ws = workspace(), now = Date.now(), window = { workspace: ws, windowStartTs: now - 30 * 86_400_000, windowEndTs: now };
    writeAnchoredRun(ws, runsDir(ws, "agent-b"), report("agent-b", "run_b", now - 2 * 86_400_000));
    expect(runFleetIndices(window).map((row) => row.runId)).toEqual(["run_b"]);

    const copied = own(ws, "run_copied", now - 86_400_000);
    copyFileSync(copied, join(runsDir(ws, "agent-b"), "run_copied.json"));
    expect(() => runFleetIndices(window)).toThrow(/run_copied is sealed for agent default, not agent-b/);
  });

  test("a ledger run deleted from disk refuses the history instead of thinning it", () => {
    const ws = workspace();
    own(ws, "run_1", 1000);
    const deleted = own(ws, "run_2", 2000);
    own(ws, "run_3", 3000);
    expect(listTrustedRuns(ws, "default").map((run) => run.runId)).toEqual(["run_3", "run_2", "run_1"]);

    rmSync(deleted);
    expect(scanTrustedRuns(ws, "default").untrusted).toEqual(["the ledger records run run_2 with no matching run file on disk"]);
    expect(() => listTrustedRuns(ws, "default")).toThrow(/run_2 with no matching run file on disk/);
  });

  test("a sealed ledger run whose file was stripped to look unsigned refuses the history", () => {
    const ws = workspace();
    // Older than the newest trusted run, so it does not block as a newer unsigned file would; the ledger still has its seal.
    const stripped = own(ws, "run_1", 1000);
    own(ws, "run_2", 2000);
    writeFileSync(stripped, JSON.stringify({ ...JSON.parse(readFileSync(stripped, "utf8")), runSealSig: "unsigned" }));
    expect(() => listTrustedRuns(ws, "default")).toThrow(/ledger records run run_1 for default but its run file is not trusted/);
  });

  test("another agent's runs on disk do not refuse this agent's history", () => {
    const ws = workspace();
    own(ws, "run_1", 1000);
    writeAnchoredRun(ws, runsDir(ws, "agent-b"), report("agent-b", "run_b", 2000));
    expect(scanTrustedRuns(ws, "agent-b")).toMatchObject({ untrusted: [], blocking: [] });
    expect(listTrustedRuns(ws, "default").map((run) => run.runId)).toEqual(["run_1"]);
  });

  test("planted copies cannot smooth a trust drop below the alert threshold; they are reported as UNVERIFIED", () => {
    const ws = workspace();
    own(ws, "run_high", 1000, 0.9);
    plantCopy(ws, "run_mid_a", 2000, 0.75);
    plantCopy(ws, "run_mid_b", 3000, 0.6);
    own(ws, "run_low", 4000, 0.5);
    const result = startTrustDriftMonitor({ workspace: ws, agentId: "default", alertThreshold: 30, nowTs: 5000 });
    expect(result.alerts.map((alert) => alert.message)).toEqual([expect.stringContaining("(run_high -> run_low)")]);
    expect(result.evidenceStatus).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.unverifiedRuns).toEqual([
      "UNVERIFIED: diagnostic run run_mid_b is sealed for agent agent-b, not default",
      "UNVERIFIED: diagnostic run run_mid_a is sealed for agent agent-b, not default"
    ]);
  });
});
