import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import { generateComplianceReport, initComplianceMaps } from "../src/compliance/complianceEngine.js";
import { frameworkControls } from "../src/compliance/frameworks/controls.js";
import type { ComplianceFramework } from "../src/compliance/frameworks.js";
import type { ComplianceReportJson } from "../src/compliance/mappingSchema.js";
import { openLedger } from "../src/ledger/ledger.js";
import type { EvidenceEventType } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P1-45: a result for one framework never sets a result for another. Evidence bound to DORA controls
 * only must leave every NIS2 category exactly as it is without that binding, although DORA and NIS2
 * mappings share clause-level crosswalk links.
 */

const AGENT = "agent-a";
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

const doraMappings = builtInComplianceMappings.filter((row) => row.framework === "DORA");

/** One OBSERVED runtime event per (DORA mapping, required event type), bound to that mapping when `bind`. */
function workspaceWithDoraEvidence(bind: boolean): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-crosswalk-no-auto-pass-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "crosswalk-no-auto-pass-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initComplianceMaps(workspace);
  const ledger = openLedger(workspace);
  try {
    for (const mapping of doraMappings) {
      for (const requirement of mapping.evidenceRequirements) {
        if (requirement.type !== "requires_evidence_event") continue;
        for (const eventType of requirement.eventTypes as EvidenceEventType[]) {
          const sessionId = `dora-${randomUUID()}`;
          ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
          ledger.appendEvidence({
            sessionId, runtime: "unknown", eventType, inline: true, payloadExt: "json",
            payload: JSON.stringify({ auditType: "DORA_FIXTURE_SIGNAL", info: mapping.id }),
            meta: { trustTier: "OBSERVED", agentId: AGENT, ...(bind ? { controlIds: [mapping.id] } : {}) }
          });
          ledger.sealSession(sessionId);
        }
      }
    }
  } finally {
    ledger.close();
  }
  return workspace;
}

function report(workspace: string, framework: ComplianceFramework): ComplianceReportJson {
  return generateComplianceReport({ workspace, framework, window: "14d", agentId: AGENT });
}

/** What a category says, without per-workspace ids. */
function view(out: ComplianceReportJson) {
  return out.categories.map((row) => ({
    id: row.id, status: row.status, result: row.result, evidence: row.evidence, claimKind: row.claimKind,
    admitted: row.admitted.length, rejected: row.rejected.map((entry) => entry.reason).sort(), reasons: row.notEvaluatedReasons
  }));
}

describe("no auto-pass across crosswalk links", () => {
  test("DORA and NIS2 mappings share clause-level links, so the rule is not vacuous", () => {
    const pairs = frameworkControls.filter((control) => {
      const frameworks = new Set(control.mappings.map((link) => builtInComplianceMappings.find((row) => row.id === link.mappingId)?.framework));
      return frameworks.has("DORA") && frameworks.has("NIS2");
    });
    expect(pairs.length).toBeGreaterThan(0);
  });

  test("evidence bound to DORA controls only leaves every NIS2 result as it is without the binding: not evaluated", () => {
    const bound = workspaceWithDoraEvidence(true);
    const unbound = workspaceWithDoraEvidence(false);

    // The binding is real: DORA admits the bound evidence and only the bound evidence.
    const doraBound = report(bound, "DORA");
    expect(doraBound.categories.length).toBe(doraMappings.length);
    for (const row of doraBound.categories) expect(row.admitted.length, row.id).toBeGreaterThan(0);
    const reportingOnly = doraBound.categories.find((row) => row.id === "dora_art19_major_incident_reporting")!;
    expect(reportingOnly.evidence).toBe("sufficient");
    expect(report(unbound, "DORA").categories.find((row) => row.id === "dora_art19_major_incident_reporting")!.evidence).toBe("incomplete");

    // NIS2 sees exactly what it would see if the evidence were bound to nothing.
    const nis2Bound = report(bound, "NIS2");
    const nis2Unbound = report(unbound, "NIS2");
    expect(nis2Bound.categories.length).toBeGreaterThan(0);
    expect(view(nis2Bound)).toEqual(view(nis2Unbound));
    expect(nis2Bound.coverage).toEqual(nis2Unbound.coverage);
    for (const row of nis2Bound.categories) {
      expect({ id: row.id, status: row.status, result: row.result }).toEqual({ id: row.id, status: "NOT_EVALUATED", result: "not_evaluated" });
    }
    expect(nis2Bound.coverage.score).toBeNull();
  }, 300_000);
});
