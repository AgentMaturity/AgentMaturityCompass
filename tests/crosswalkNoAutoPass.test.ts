import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import { generateComplianceReport, initComplianceMaps } from "../src/compliance/complianceEngine.js";
import { frameworkControls } from "../src/compliance/frameworks/controls.js";
import type { ComplianceFramework } from "../src/compliance/frameworks.js";
import type { ComplianceMapping, ComplianceReportJson } from "../src/compliance/mappingSchema.js";
import { openLedger } from "../src/ledger/ledger.js";
import type { EvidenceEventType } from "../src/types.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * P1-45: a result for one framework never sets a result for another, although mappings of different frameworks share
 * clause-level crosswalk links.
 *
 * Test seam: AMC has no compiled plan yet, so the engine leaves applicability unresolved and no category can pass
 * (src/catalog/evidence/mappingAdapter.ts passes `plan: null`). This file replaces decideApplicability for its own
 * module graph so that every control applies: a category with sufficient observed evidence then passes. Product code
 * is unchanged; the seam exists only here.
 */
vi.mock("../src/catalog/evidence/dimensions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/catalog/evidence/dimensions.js")>();
  return { ...actual, decideApplicability: () => ({ state: "applicable" as const }) };
});

const AGENT = "agent-a";
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

const byId = new Map(builtInComplianceMappings.map((row) => [row.id, row]));
const ofFramework = (framework: string) => builtInComplianceMappings.filter((row) => row.framework === framework);
/** A mapping whose requirements bound runtime events alone can meet (no assurance run needed). */
const eventsOnly = (mapping: ComplianceMapping) => mapping.evidenceRequirements.every((req) => req.type !== "requires_assurance_pack");

/** One OBSERVED runtime event per (mapping, required event type), bound to that mapping when `bind`. */
function workspaceWithEvidence(mappings: readonly ComplianceMapping[], bind: boolean): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-crosswalk-no-auto-pass-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "crosswalk-no-auto-pass-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initComplianceMaps(workspace);
  const ledger = openLedger(workspace);
  try {
    for (const mapping of mappings) {
      for (const requirement of mapping.evidenceRequirements) {
        if (requirement.type !== "requires_evidence_event") continue;
        for (const eventType of requirement.eventTypes as EvidenceEventType[]) {
          const sessionId = `fixture-${randomUUID()}`;
          ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
          ledger.appendEvidence({
            sessionId, runtime: "unknown", eventType, inline: true, payloadExt: "json",
            payload: JSON.stringify({ auditType: "CROSSWALK_FIXTURE_SIGNAL", info: mapping.id }),
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

/** Frameworks other than `framework` whose mappings share a clause-level control with one of `mappingIds`. */
function linkedFrameworks(framework: string, mappingIds: ReadonlySet<string>): ComplianceFramework[] {
  const linked = new Set<ComplianceFramework>();
  for (const control of frameworkControls) {
    if (!control.mappings.some((link) => mappingIds.has(link.mappingId))) continue;
    for (const link of control.mappings) {
      const other = byId.get(link.mappingId)!;
      if (other.framework !== framework) linked.add(other.framework as ComplianceFramework);
    }
  }
  return [...linked].sort();
}

describe("no auto-pass across crosswalk links", () => {
  test("DORA and NIS2 mappings share clause-level links, so the rule is not vacuous", () => {
    const pairs = frameworkControls.filter((control) => {
      const frameworks = new Set(control.mappings.map((link) => byId.get(link.mappingId)?.framework));
      return frameworks.has("DORA") && frameworks.has("NIS2");
    });
    expect(pairs.length).toBeGreaterThan(0);
  });

  test("evidence bound to DORA controls only leaves every NIS2 result as it is without the binding: not evaluated", () => {
    const dora = ofFramework("DORA");
    const bound = workspaceWithEvidence(dora, true);
    const unbound = workspaceWithEvidence(dora, false);

    // The binding is real: DORA admits the bound evidence, and under the seam an events-only DORA category passes.
    const doraBound = report(bound, "DORA");
    expect(doraBound.categories.length).toBe(dora.length);
    for (const row of doraBound.categories) expect(row.admitted.length, row.id).toBeGreaterThan(0);
    const reporting = doraBound.categories.find((row) => row.id === "dora_art19_major_incident_reporting")!;
    expect({ status: reporting.status, result: reporting.result, evidence: reporting.evidence })
      .toEqual({ status: "SATISFIED", result: "pass", evidence: "sufficient" });
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

  test("passing EU AI Act categories never change a linked framework's status, result, evidence or coverage", () => {
    const passing = ofFramework("EU_AI_ACT").filter(eventsOnly);
    const bound = workspaceWithEvidence(passing, true);
    const unbound = workspaceWithEvidence(passing, false);

    const eu = report(bound, "EU_AI_ACT");
    const passed = new Set(eu.categories.filter((row) => row.result === "pass").map((row) => row.id));
    expect(passed.size).toBeGreaterThan(0);
    const targets = linkedFrameworks("EU_AI_ACT", passed);
    // FEDRAMP, GDPR, ISO_27001 and the S6 families among them: the links exist for the passing categories.
    expect(targets.length).toBeGreaterThan(3);

    for (const framework of targets) {
      const withLinkedPass = report(bound, framework);
      const baseline = report(unbound, framework);
      expect(view(withLinkedPass), framework).toEqual(view(baseline));
      expect(withLinkedPass.coverage, framework).toEqual(baseline.coverage);
    }
  }, 600_000);
});
