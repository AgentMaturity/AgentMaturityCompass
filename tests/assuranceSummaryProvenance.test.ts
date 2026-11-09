import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { loadAssuranceSummary } from "../src/diagnostic/assuranceSummary.js";
import { latestReadonlyBenchAssuranceByPack } from "../src/bench/benchReadOnlyInputs.js";
import { writeProvenancedAssuranceReport } from "./helpers/provenancedAssurance.js";
import { writeSealedReport } from "./helpers/sealedRun.js";

/**
 * SH-TRUST-02: the maturity scorer's assurance summary (AMC-1.8 caps) and the read-only bench reader take a pack score
 * only from a sealed report whose graded rows live in its runner session; a sealed report with a score and no rows
 * behind it is named as unverifiable and feeds nothing.
 */
describe("maturity and bench assurance readers refuse unbacked sealed reports", () => {
  const roots: string[] = [];
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }); });

  test("only the provenance-backed report's packs are read", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-summary-provenance-"));
    roots.push(ws);
    process.env.AMC_VAULT_PASSPHRASE = "summary-provenance-passphrase";
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
    const now = Date.now();
    const unbacked = writeSealedReport(ws, join(getAgentPaths(ws, "default").reportsDir, "assurance"), "unbacked", {
      assuranceRunId: "unbacked", agentId: "default", ts: now, windowStartTs: now - 1000, windowEndTs: now, trustTier: "OBSERVED", status: "VALID",
      verificationPassed: true, evidenceStatus: "MEASURED", packResults: [{ packId: "pii", score0to100: 99, scenarioResults: [] }] });
    writeProvenancedAssuranceReport(ws, { name: "backed", ts: now, packs: [{ packId: "injection", scenarios: [{ scenarioId: "s1", pass: true }], score0to100: 80 }] });

    const summary = loadAssuranceSummary(ws, "default", now - 10_000, now + 10_000);
    expect([...summary.packScores.entries()]).toEqual([["injection", 80]]);
    expect(summary.unverifiableReports).toEqual([unbacked]);

    const bench = latestReadonlyBenchAssuranceByPack({ workspace: ws, agentId: "default", windowStartTs: now - 10_000, windowEndTs: now + 10_000 });
    expect([...bench.keys()]).toEqual(["injection"]);
  });
});
