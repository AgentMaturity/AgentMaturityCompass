/**
 * Adapters for results the CLI and reports print (P0-22). Like ../adapters.ts they only shape
 * inputs for evaluateClaimEligibility; every rule stays there. See docs/CLAIM_KINDS.md, "CLI and reports".
 */
import type { ComplianceCategoryResult, ComplianceReportJson } from "../../../compliance/mappingSchema.js";
import type { AssuranceReport, DiagnosticReport } from "../../../types.js";
import { envelopeForDiagnosticReport, envelopeForLegacyResult } from "../adapters.js";
import { evaluateClaimEligibility } from "../evaluate.js";
import {
  CLAIM_KINDS, type Applicability, type ClaimEnvelope, type ClaimKind, type ClaimReasonCode, type EvidenceState, type ResultState,
  type StatusDimensions
} from "../types.js";

/** True for a result stored by AMC 1.x: no version, an unparsable one, or one below 1.2.0. */
export function isLegacyAmcVersion(version: string | null | undefined): boolean {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version ?? "");
  if (!match) return true;
  const [major, minor] = [Number(match[1]), Number(match[2])];
  return major < 1 || (major === 1 && minor < 2);
}

function meanLevel(report: Pick<DiagnosticReport, "layerScores">): number | null {
  const layers = Array.isArray(report.layerScores) ? report.layerScores : [];
  return layers.length === 0 ? null : layers.reduce((sum, layer) => sum + layer.avgFinalLevel, 0) / layers.length;
}

/**
 * A diagnostic run read back from disk. A 1.x run is "Legacy (1.x), self-reported". A run whose seal does not
 * verify vouches for nothing: its own VALID status cannot sign for it, and it is never more than self-reported.
 */
export function envelopeForStoredRun(report: DiagnosticReport, options: { sealVerified: boolean; now: number }): ClaimEnvelope {
  const version = report.methodology?.amcVersion;
  if (isLegacyAmcVersion(version)) {
    const coverage = report.evidenceTrustCoverage;
    const hasEvidence = coverage ? coverage.observed + coverage.attested + coverage.selfReported > 0 : false;
    return envelopeForLegacyResult({
      producer: `diagnostic:${report.agentId}`, version: version ?? "none", originalTier: report.trustLabel,
      method: "runtime_observation", status: "NOT_EVALUATED", level: meanLevel(report), eventCount: hasEvidence ? 1 : 0,
      evidenceRefs: [report.runId], now: options.now
    });
  }
  const trusted = options.sealVerified || report.status !== "VALID" ? report : { ...report, status: "INVALID" as const };
  const envelope = envelopeForDiagnosticReport(trusted, options.now);
  return options.sealVerified ? envelope : { ...envelope, claimKind: "self_reported" };
}

/**
 * A result AMC computed from records it did not observe or verify: caller-supplied files and receipts, imports,
 * answers, workspace scans, and aggregates whose members were not checked. Always self-reported; with no
 * records it is not evaluated. A valid signature proves integrity only and never raises the kind.
 */
export function envelopeForUnverifiedResult(input: {
  producer: string; recordCount: number; result?: ResultState; level?: number | null; regulated?: boolean;
  applicability?: Applicability; signatureValid?: boolean | null; evidenceRefs?: readonly string[];
  /** A static scan of files or text is a keyword match: level 1 at most, never a regulated pass. */
  method?: "runtime_observation" | "keyword_match";
  now: number;
}): ClaimEnvelope {
  return evaluateClaimEligibility({
    producer: input.producer,
    method: input.method ?? "runtime_observation",
    regulated: input.regulated ?? false,
    proposed: { result: input.result ?? "not_evaluated", level: input.level ?? null },
    evidence: { eventCount: input.recordCount, tiers: ["SELF_REPORTED"], newestTs: null, boundToControl: true,
      sameScope: true, contradictory: false, signatureValid: input.signatureValid ?? null, issuerPinned: null },
    evidenceRefs: input.evidenceRefs,
    applicability: input.applicability,
    now: input.now
  });
}

/**
 * An executed test AMC ran against the agent (assurance packs, red-team plugins, benchmarks): observed when at
 * least one scenario reached the agent. A result read back from disk whose seal does not verify is untrusted and
 * self-reported; `sealVerified` is null for a result produced in this process.
 */
export function envelopeForExecutedTest(input: {
  producer: string; measured: number; result: ResultState; level?: number | null; sealVerified: boolean | null;
  evidenceRefs?: readonly string[]; now: number;
}): ClaimEnvelope {
  const envelope = evaluateClaimEligibility({
    producer: input.producer,
    method: "executed_test",
    regulated: false,
    proposed: { result: input.result, level: input.level ?? null },
    evidence: { eventCount: input.measured, tiers: ["OBSERVED"], newestTs: null, boundToControl: true, sameScope: true,
      contradictory: false, signatureValid: input.sealVerified === false ? false : null, issuerPinned: null },
    evidenceRefs: input.evidenceRefs,
    now: input.now
  });
  return input.sealVerified === false ? { ...envelope, claimKind: "self_reported" } : envelope;
}

/** An assurance run: one executed-test envelope per pack (inconclusive scenarios excluded), joined as an aggregate. */
export function envelopeForAssuranceReport(report: Pick<AssuranceReport, "assuranceRunId" | "packResults">,
  options: { sealVerified: boolean | null; now: number }): ClaimEnvelope {
  return envelopeForAggregate(`assurance:${report.assuranceRunId}`, report.packResults.map((pack) => envelopeForAssurancePack(
    report.assuranceRunId, pack, options)), options.now);
}

export function envelopeForAssurancePack(assuranceRunId: string, pack: AssuranceReport["packResults"][number],
  options: { sealVerified: boolean | null; now: number }): ClaimEnvelope {
  return envelopeForExecutedTest({ producer: `assurance:${pack.packId}`,
    measured: pack.scenarioResults.filter((scenario) => !scenario.inconclusive).length,
    result: pack.failCount > 0 ? "fail" : "pass", sealVerified: options.sealVerified, evidenceRefs: [assuranceRunId], now: options.now });
}

type ComplianceReportClaimInput = Pick<ComplianceReportJson, "framework" | "trustTierCoverage" | "configTrusted" | "windowEndTs">;

/**
 * A compliance category is a regulated result on control-bound runtime evidence. With no applicability decision it
 * cannot pass (rule 9), and untrusted compliance maps make its evidence untrusted.
 */
export function envelopeForComplianceCategory(report: ComplianceReportClaimInput, category: ComplianceCategoryResult,
  now: number): ClaimEnvelope {
  return evaluateClaimEligibility({
    producer: `compliance:${report.framework}:${category.id}`,
    method: "runtime_observation",
    regulated: true,
    proposed: { result: category.result, level: null },
    evidence: { eventCount: category.evidenceRefs.length, tiers: report.trustTierCoverage.observed > 0 ? ["OBSERVED"] : ["SELF_REPORTED"],
      newestTs: report.windowEndTs, boundToControl: true, sameScope: true, contradictory: category.evidence === "contradictory",
      signatureValid: report.configTrusted ? null : false, issuerPinned: null },
    evidenceRefs: category.evidenceRefs.map((ref) => ref.eventId),
    now
  });
}

export function envelopeForComplianceReport(report: ComplianceReportClaimInput & Pick<ComplianceReportJson, "categories">,
  now: number): ClaimEnvelope {
  return envelopeForAggregate(`compliance:${report.framework}`,
    report.categories.map((category) => envelopeForComplianceCategory(report, category, now)), now);
}

/**
 * A result that already carries the kind and dimensions the service decided (domain outcomes store those two
 * fields, not the envelope): rebuilt for the label. Reason codes are not stored, so "not evaluated" prints bare.
 */
export function envelopeFromDimensions(producer: string, claimKind: ClaimKind, statusDimensions: StatusDimensions): ClaimEnvelope {
  return { claimKind, statusDimensions,
    provenance: { producer, method: claimKind === "synthetic_example" ? "synthetic" : "runtime_observation", evidenceRefs: [] },
    eligibleLevel: null, reasons: [] };
}

const EVIDENCE_ORDER: readonly EvidenceState[] = ["sufficient", "incomplete", "stale", "contradictory", "untrusted"];

/**
 * A fleet, organisation or report total claims no more than its weakest member: the weakest kind, the worst
 * evidence, the lowest eligible level, a pass only when every member passes and a fail when any fails.
 */
export function envelopeForAggregate(producer: string, members: readonly ClaimEnvelope[], now: number): ClaimEnvelope {
  if (members.length === 0) return envelopeForUnverifiedResult({ producer, recordCount: 0, now });
  const weakest = members.reduce((a, b) => (CLAIM_KINDS.indexOf(b.claimKind) < CLAIM_KINDS.indexOf(a.claimKind) ? b : a));
  const results = members.map((member) => member.statusDimensions.result);
  const result: ResultState = results.includes("fail") ? "fail" : results.every((value) => value === "pass") ? "pass" : "not_evaluated";
  const evidence = members.map((member) => member.statusDimensions.evidence)
    .reduce((a, b) => (EVIDENCE_ORDER.indexOf(b) > EVIDENCE_ORDER.indexOf(a) ? b : a));
  const levels = members.map((member) => member.eligibleLevel);
  return {
    claimKind: weakest.claimKind,
    statusDimensions: { ...weakest.statusDimensions, result, evidence },
    provenance: { producer, method: weakest.provenance.method,
      evidenceRefs: [...new Set(members.flatMap((member) => member.provenance.evidenceRefs))] },
    eligibleLevel: levels.includes(null) ? null : Math.min(...(levels as number[])),
    reasons: [...new Set(members.flatMap((member) => member.reasons))] as ClaimReasonCode[]
  };
}
