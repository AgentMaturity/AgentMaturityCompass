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
import { renderAssuranceMarkdown } from "../src/assurance/report.js";
import { renderClaimLegend } from "../src/claims/eligibility/render.js";
import type { AssuranceReport } from "../src/types.js";

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

function renderableReport(now: number): AssuranceReport {
  const base = baseReport(now);
  const pack = base.packResults[0]!;
  return { ...base, mode: "supervise", trustTier: "OBSERVED", status: "VALID", trustLabel: "HIGH TRUST",
    packResults: [{ ...pack, title: "Tool governance", scenarioCount: 1, passCount: 1, failCount: 0, trustTier: "OBSERVED",
      scenarioResults: [{ scenarioId: "governance-1", title: "Governed tool use", category: "governance", riskTier: "all",
        prompt: "Use an approved tool", response: "Approved tool used", pass: true, score0to5: 4.4, score0to100: 88,
        reasons: [], correlatedRequestIds: [], evidenceEventIds: [], auditEventTypes: pack.scenarioResults[0]!.auditEventTypes }]
    }] };
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
  test.each([true, false])("rendered pack claims reflect sealVerified=%s without reviewer promotion", (sealVerified) => {
    const report = renderableReport(Date.UTC(2026, 9, 14));
    const markdown = renderAssuranceMarkdown(report, sealVerified);
    expect(markdown).toContain(`**Claim:** ${sealVerified ? "Observed" : "Self-reported"}`);
    expect(markdown).toContain(`**Result:** ${sealVerified ? "pass" : "not evaluated"}`);
    const row = markdown.split("\n").find((line) => line.startsWith("| toolGovernance |"));
    expect(row).toMatch(new RegExp(`\\| ${sealVerified ? "observed" : "self_reported"} \\|$`));
    expect(markdown).not.toContain("**Claim:** Independently reviewed");
    expect(markdown.split("\n").filter((line) => line.startsWith("**Claim:**") || line.startsWith("| toolGovernance |"))).toMatchSnapshot();
    expect(markdown).toContain(renderClaimLegend("markdown"));
  });

  test("empty and inconclusive-only assurance reports cannot render a passing claim", () => {
    const report = renderableReport(Date.UTC(2026, 9, 14));
    const pack = report.packResults[0]!;
    const inconclusive = { ...pack, passCount: 0, score0to100: 0,
      scenarioResults: pack.scenarioResults.map((scenario) => ({ ...scenario, pass: false, score0to5: 0, score0to100: 0, inconclusive: true })) };
    for (const packResults of [[], [inconclusive]]) {
      const markdown = renderAssuranceMarkdown({ ...report, packResults, overallScore0to100: 0 }, true);
      expect(markdown).toContain("**Result:** not evaluated");
      expect(markdown).not.toContain("**Result:** pass");
      expect(markdown.split("\n").find((line) => line.startsWith("**Claim:**"))).toMatchSnapshot();
      expect(markdown).toContain(renderClaimLegend("markdown"));
    }
  });

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
