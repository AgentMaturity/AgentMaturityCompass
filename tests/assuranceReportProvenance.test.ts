import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { loadAssuranceSummary } from "../src/diagnostic/assuranceSummary.js";

/**
 * Assurance reports feed maturity scoring, and until this module existed the
 * loader read them as PLAIN JSON AND BELIEVED EVERY FIELD: a hand-written file
 * in reports/assurance/ could claim `trustTier: "OBSERVED"` and a score of 100
 * and both flowed into the diagnostic as measured evidence. The runner signs
 * every report it writes (reportJsonSha256 + runSealSig) and the ledger
 * verifier checks those signatures — the scoring path was the one consumer
 * that never looked.
 *
 * The rule pinned here: a report contributes to scoring only when its hash
 * recomputes and its seal verifies against the workspace auditor keys.
 * Everything else contributes nothing and is named in `unverifiableReports`.
 */

const roots: string[] = [];
const AGENT = "default";

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-assurance-prov-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "assurance-prov-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function reportsDir(workspace: string): string {
  const dir = join(getAgentPaths(workspace, AGENT).reportsDir, "assurance");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function baseReport(now: number) {
  return {
    assuranceRunId: "run-prov-1",
    agentId: AGENT,
    ts: now,
    mode: "supervise",
    windowStartTs: now - 1000,
    windowEndTs: now,
    trustTier: "OBSERVED",
    status: "VALID",
    verificationPassed: true,
    sessionId: "session-prov-1",
    packResults: [
      {
        packId: "toolGovernance",
        score0to100: 88,
        scenarioResults: [{ auditEventTypes: ["TOOL_GOVERNANCE_SUCCEEDED"] }]
      }
    ],
    overallScore0to100: 88,
    integrityIndex: 1,
    trustLabel: "MEASURED",
    reportJsonSha256: "",
    runSealSig: ""
  };
}

/** Sign the way the runner does: hash the canonical report with empty seal fields. */
function writeSignedReport(workspace: string, now: number, mutate?: (r: Record<string, unknown>) => void): void {
  const base = baseReport(now);
  const hash = sha256Hex(canonicalize(base));
  const ledger = openLedger(workspace);
  const sig = ledger.signRunHash(hash);
  ledger.close();
  const report: Record<string, unknown> = { ...base, reportJsonSha256: hash, runSealSig: sig };
  if (mutate) mutate(report);
  writeFileSync(join(reportsDir(workspace), `${String(report.assuranceRunId)}.json`), JSON.stringify(report, null, 2));
}

describe("assurance report provenance gate", () => {
  test("a genuine signed report contributes its scores and tier", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    writeSignedReport(workspace, now);
    const summary = loadAssuranceSummary(workspace, AGENT, now - 5000, now + 5000);
    expect(summary.packScores.get("toolGovernance")).toBe(88);
    expect(summary.packObserved.has("toolGovernance")).toBe(true);
    expect(summary.unverifiableReports).toEqual([]);
  });

  test("a fabricated report contributes nothing, whatever it claims", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const fake = { ...baseReport(now), reportJsonSha256: "0".repeat(64), runSealSig: "not-a-signature" };
    fake.packResults[0]!.score0to100 = 100;
    writeFileSync(join(reportsDir(workspace), "fabricated.json"), JSON.stringify(fake, null, 2));

    const summary = loadAssuranceSummary(workspace, AGENT, now - 5000, now + 5000);
    expect(summary.packScores.has("toolGovernance")).toBe(false);
    expect(summary.packObserved.has("toolGovernance")).toBe(false);
    expect(summary.unverifiableReports).toHaveLength(1);
  });

  test("editing one field of a signed report voids the whole report", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    writeSignedReport(workspace, now, (report) => {
      (report.packResults as Array<{ score0to100: number }>)[0]!.score0to100 = 100;
    });
    const summary = loadAssuranceSummary(workspace, AGENT, now - 5000, now + 5000);
    expect(summary.packScores.has("toolGovernance")).toBe(false);
    expect(summary.unverifiableReports).toHaveLength(1);
  });

  test("an unsigned report is not scoreable evidence", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const base = baseReport(now);
    const hash = sha256Hex(canonicalize(base));
    writeFileSync(
      join(reportsDir(workspace), "unsigned.json"),
      JSON.stringify({ ...base, reportJsonSha256: hash, runSealSig: "unsigned" }, null, 2)
    );
    const summary = loadAssuranceSummary(workspace, AGENT, now - 5000, now + 5000);
    expect(summary.packScores.has("toolGovernance")).toBe(false);
    expect(summary.unverifiableReports).toHaveLength(1);
  });

  test("a report outside the window is ignored quietly — absent, not fraudulent", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    writeSignedReport(workspace, now - 500_000);
    const summary = loadAssuranceSummary(workspace, AGENT, now - 5000, now + 5000);
    expect(summary.packScores.has("toolGovernance")).toBe(false);
    expect(summary.unverifiableReports).toEqual([]);
  });
});
