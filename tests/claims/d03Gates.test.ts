import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { evaluateClaimEligibility, renderClaimLabel, type ClaimEligibilityInput, type ClaimEnvelope } from "../../src/claims/eligibility/index.js";
import { envelopeForAggregate, envelopeForComplianceReport } from "../../src/claims/eligibility/adapters/results.js";
import { coverageScore } from "../../src/compliance/coverageScorer.js";
import type { ComplianceCategoryResult } from "../../src/compliance/mappingSchema.js";
import { readSignedControlResults, writeSignedControlResults } from "../../src/catalog/evidence/signedResults.js";
import type { ControlResult } from "../../src/catalog/evidence/types.js";
import type { CompiledPlan } from "../../src/catalog/compiler/types.js";
import { toOscalAssessmentResults } from "../../src/exports/oscal/oscalAssessmentResults.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P0-28 security follow-up: D-03 lets a regulated self-reported result DISPLAY "pass" when AMC's own signed workspace
 * flow captured its records. Legacy, imported and unsigned input never takes that path, and a D-03 pass never satisfies
 * a gate, a score or an aggregate that needs verified evidence.
 */
const NOW = Date.UTC(2026, 9, 11, 12, 0, 0);
const applicable = { state: "applicable" } as const;

function regulatedSelfReported(evidence: Partial<ClaimEligibilityInput["evidence"]> = {}, extra: Partial<ClaimEligibilityInput> = {}) {
  return evaluateClaimEligibility({
    producer: "test", method: "runtime_observation", regulated: true, applicability: applicable,
    proposed: { result: "pass", level: null },
    evidence: { eventCount: 3, tiers: ["SELF_REPORTED"], newestTs: NOW, boundToControl: true, sameScope: true,
      contradictory: false, signatureValid: true, issuerPinned: null, ...evidence },
    now: NOW, ...extra
  });
}
const d03 = (): ClaimEnvelope => regulatedSelfReported();
const observed = (): ClaimEnvelope => regulatedSelfReported({ tiers: ["OBSERVED"] });

describe("only AMC's own signed records take the D-03 path", () => {
  test("signed records captured through the workspace: a self-reported pass", () => {
    expect(d03()).toMatchObject({ claimKind: "self_reported", statusDimensions: { result: "pass", evidence: "sufficient" } });
  });

  test.each<[string, Partial<ClaimEligibilityInput["evidence"]>, Partial<ClaimEligibilityInput>]>([
    ["imported or unsigned records (no verified signature)", { signatureValid: null }, {}],
    ["a legacy 1.x result, whatever its signature", {}, { legacy: { version: "1.1.1" } }]
  ])("%s: no pass", (_, evidence, extra) => {
    const envelope = regulatedSelfReported(evidence, extra);
    expect(envelope.statusDimensions).toMatchObject({ result: "not_evaluated", evidence: "incomplete" });
    expect(envelope.reasons).toContain("SELF_REPORTED_NO_POSITIVE_STATUS");
  });
});

describe("a D-03 pass satisfies no gate, score or aggregate that needs verified evidence", () => {
  test("an aggregate takes the worst member: a self-reported pass never lifts it to sufficient or to a pass", () => {
    for (const total of [envelopeForAggregate("total", [observed(), d03()], NOW), envelopeForAggregate("total", [d03()], NOW)]) {
      expect(total.claimKind).toBe("self_reported");
      expect(total.statusDimensions.evidence).not.toBe("sufficient");
      expect(total.statusDimensions.result).not.toBe("pass");
    }
    expect(envelopeForAggregate("total", [observed(), observed()], NOW).statusDimensions).toMatchObject({ result: "pass", evidence: "sufficient" });
  });

  const category = (claim: ClaimEnvelope, id: string): ComplianceCategoryResult => ({
    id, framework: "SOC2", category: id, description: id, status: claim.statusDimensions.result === "pass" ? "SATISFIED" : "NOT_EVALUATED",
    result: claim.statusDimensions.result, evidence: claim.statusDimensions.evidence, dimensions: claim.statusDimensions,
    claimKind: claim.claimKind, claimReasons: claim.reasons, notEvaluatedReasons: [], reasons: [], evidenceRefs: [], admitted: [],
    rejected: [], neededToSatisfy: []
  } as ComplianceCategoryResult);

  test("the compliance coverage score credits only a verified pass", () => {
    const coverage = coverageScore([category(d03(), "self"), category(observed(), "seen")]);
    expect(coverage.satisfied).toBe(1);
    expect(coverage.score).toBe(0.5);
    expect(coverageScore([category(d03(), "self")])).toMatchObject({ satisfied: 0, score: null });
  });

  test("a compliance report total is no pass when one category passed only on self-reported evidence", () => {
    const report = envelopeForComplianceReport({ framework: "SOC2", categories: [category(observed(), "seen"), category(d03(), "self")] }, NOW);
    expect(report.statusDimensions.result).not.toBe("pass");
    expect(report.statusDimensions.evidence).not.toBe("sufficient");
  });

  test("the OSCAL export records a self-reported pass as an observation, never a satisfied finding", () => {
    const claim = d03();
    const result = { resultVersion: 1, controlId: "test.control", controlVersion: "1", controlDigest: "c".repeat(64), planDigest: "p".repeat(64),
      subject: { tenantId: null, workspaceId: "ws", deploymentId: null, agentId: "a", subjectId: null },
      window: { start: new Date(NOW - 86_400_000).toISOString(), end: new Date(NOW).toISOString() },
      dimensions: claim.statusDimensions, claimKind: claim.claimKind, claimReasons: claim.reasons, admitted: [], rejected: [], reasons: [],
      evaluatedAt: new Date(NOW).toISOString(), evaluator: { name: "amc", version: "test" }, digest: "d".repeat(64) } satisfies ControlResult;
    const plan = { digest: "p".repeat(64), profile: { profileId: "test" }, runtimePolicy: { policyDigest: "x" }, status: "ready" } as unknown as CompiledPlan;
    const { document } = toOscalAssessmentResults([result], plan, "s".repeat(64));
    const [oscal] = (document as { "assessment-results": { results: Array<{ findings?: unknown[]; observations: Array<{ props: Array<{ name: string; value: string }> }> }> } })["assessment-results"].results;
    expect(oscal?.findings).toBeUndefined();
    expect(oscal?.observations[0]?.props).toContainEqual(expect.objectContaining({ name: "claim-kind", value: "self_reported" }));
  });

  test("its label says it is self-reported and not independently verified", () => {
    expect(renderClaimLabel(d03()).line).toContain("Claim: Self-reported · Result: pass (self-reported, evidence attached, not independently verified)");
  });
});

describe("the signed CONTROL_RESULT carries the claim kind inside its signature", () => {
  const roots: string[] = [];
  afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  test("relabelling a self-reported result as observed breaks the signature", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-d03-sign-"));
    roots.push(workspace);
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const claim = d03();
    const result = { resultVersion: 1, controlId: "test.control", claimKind: claim.claimKind, dimensions: claim.statusDimensions } as unknown as ControlResult;
    const { path } = writeSignedControlResults(workspace, "results.json", [result]);
    expect((readSignedControlResults(workspace, "results.json").value as ControlResult[])[0]?.claimKind).toBe("self_reported");
    writeFileSync(path, readFileSync(path, "utf8").replace("\"claimKind\": \"self_reported\"", "\"claimKind\": \"observed\""));
    expect(readFileSync(path, "utf8")).toContain("\"claimKind\": \"observed\"");
    expect(() => readSignedControlResults(workspace, "results.json")).toThrow(/changed after signing/);
  });
});
