import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { builtInComplianceMappings } from "../../src/compliance/builtInMappings.js";
import { generateComplianceReport, initComplianceMaps } from "../../src/compliance/complianceEngine.js";
import { generateCoverageMatrix } from "../../src/compliance/complianceMatrix.js";
import { complianceReportToMarkdown } from "../../src/compliance/complianceReport.js";
import { openLedger } from "../../src/ledger/ledger.js";
import type { EvidenceEventType } from "../../src/types.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P1-45: ISO/IEC 42005 is descoped (licensed text unavailable). Its three ISO_42001 categories stay listed but are never
 * evaluated or counted, even with bound evidence that would let them pass.
 *
 * Test seam (as in tests/crosswalkNoAutoPass.test.ts): every control applies, so sufficient observed evidence passes.
 */
vi.mock("../../src/catalog/evidence/dimensions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/catalog/evidence/dimensions.js")>();
  return { ...actual, decideApplicability: () => ({ state: "applicable" as const }) };
});

const AGENT = "agent-a";
const roots: string[] = [];
const DESCOPED = ["iso42005_scope_and_stakeholders", "iso42005_severity_likelihood_uncertainty", "iso42005_mitigation_traceability"];
const REASON = "not evaluated: descoped (licensed text unavailable)";

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function workspaceWithBoundEvidence(mappingIds: string[]): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-iso42005-descoped-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "iso42005-descoped-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initComplianceMaps(workspace);
  const ledger = openLedger(workspace);
  try {
    for (const id of mappingIds) {
      const mapping = builtInComplianceMappings.find((row) => row.id === id)!;
      for (const requirement of mapping.evidenceRequirements) {
        if (requirement.type !== "requires_evidence_event") continue;
        for (const eventType of requirement.eventTypes as EvidenceEventType[]) {
          const sessionId = `iso-${randomUUID()}`;
          ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
          ledger.appendEvidence({ sessionId, runtime: "unknown", eventType, inline: true, payloadExt: "json",
            payload: JSON.stringify({ auditType: "ISO_FIXTURE_SIGNAL" }), meta: { trustTier: "OBSERVED", agentId: AGENT, controlIds: [id] } });
          ledger.sealSession(sessionId);
        }
      }
    }
  } finally {
    ledger.close();
  }
  return workspace;
}

describe("ISO/IEC 42005 descope in the compliance report", () => {
  test("the three iso42005 categories are listed, never evaluated and never counted, even with passing evidence", () => {
    const workspace = workspaceWithBoundEvidence([...DESCOPED, "iso42006_conformity_evidence_package"]);
    const out = generateComplianceReport({ workspace, framework: "ISO_42001", window: "14d", agentId: AGENT });

    // The contrast: an events-only ISO_42001 category with the same kind of evidence passes under the seam.
    expect(out.categories.find((row) => row.id === "iso42006_conformity_evidence_package")!.result).toBe("pass");

    for (const id of DESCOPED) {
      const row = out.categories.find((entry) => entry.id === id)!;
      expect({ status: row.status, result: row.result, descoped: row.descoped }).toEqual({ status: "NOT_EVALUATED", result: "not_evaluated", descoped: REASON });
      expect(row.notEvaluatedReasons).toEqual([REASON]);
      expect(row.admitted).toEqual([]);
    }
    const counted = out.categories.length - DESCOPED.length;
    const { satisfied, partial, missing, unknown, notEvaluated } = out.coverage;
    expect(satisfied + partial + missing + unknown + notEvaluated).toBe(counted);
    expect(out.coverage.satisfied).toBe(1);
    expect(out.coverage.score).toBe(Number((1 / counted).toFixed(4)));

    const markdown = complianceReportToMarkdown(out);
    expect(markdown).toContain(`- Coverage score: ${(Number((1 / counted).toFixed(4)) * 100).toFixed(1)}%`);
    expect(markdown).toContain("- Descoped: 3 categories are listed but not evaluated or counted (licensed text unavailable).");

    const matrix = generateCoverageMatrix({ workspace, agentId: AGENT, window: "14d", frameworks: ["ISO_42001"] });
    expect(matrix.frameworks[0]!.total).toBe(counted);
    expect(matrix.notEvaluated.filter((row) => row.reasons.includes(REASON)).length).toBe(DESCOPED.length);
  }, 300_000);
});
