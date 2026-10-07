import type { ComplianceCategoryStatus } from "../../compliance/mappingSchema.js";
import type { ClaimTier } from "../../score/claimProvenance.js";
import type { TrustTier as IngestTrustTier } from "../../score/evidenceIngestion.js";
import {
  evaluateDiagnosticEvidenceReadiness,
  type DiagnosticEvidenceReadinessInput
} from "../../diagnostic/evidenceReadiness.js";
import type { DiagnosticReport, TrustTier } from "../../types.js";
import { evaluateClaimEligibility } from "./evaluate.js";
import type {
  Applicability,
  ClaimEligibilityInput,
  ClaimEnvelope,
  ClaimKind,
  ClaimMethod,
  ClaimReasonCode,
  ResultState
} from "./types.js";

// A new tier in either union is a compile error here until it is mapped.
const TRUST_TIER_KINDS = {
  OBSERVED: "observed",
  OBSERVED_HARDENED: "observed",
  ATTESTED: "self_reported",
  SELF_REPORTED: "self_reported",
  UNVERIFIED: "self_reported"
} as const satisfies Record<TrustTier | IngestTrustTier, ClaimKind>;

// USER_VERIFIED is an operator's own statement, not an observation.
const CLAIM_TIER_KINDS = {
  USER_VERIFIED: "self_reported",
  DERIVED: "self_reported",
  HYPOTHESIS: "self_reported",
  SESSION_LOCAL: "self_reported",
  REFERENCE_ONLY: "self_reported"
} as const satisfies Record<ClaimTier, ClaimKind>;

/** The F3 certification-evidence statuses on the 2.x candidate. */
type CertificationEvidenceStatus = "PASS" | "FAIL" | "NOT_EVALUATED";

// PARTIAL is not a result: missing evidence means not evaluated.
const UPPERCASE_STATUS = {
  PASS: { result: "pass" },
  FAIL: { result: "fail" },
  NOT_EVALUATED: { result: "not_evaluated" },
  SATISFIED: { result: "pass" },
  PARTIAL: { result: "not_evaluated", evidence: "incomplete" },
  MISSING: { result: "not_evaluated", evidence: "incomplete" },
  UNKNOWN: { result: "not_evaluated", evidence: "incomplete" }
} as const satisfies Record<CertificationEvidenceStatus | ComplianceCategoryStatus,
  { result: ResultState; evidence?: "incomplete" }>;

interface MappedKind { claimKind: ClaimKind; reasons: ClaimReasonCode[] }

export function claimKindFromTrustTier(tier: TrustTier | IngestTrustTier): MappedKind {
  // ATTESTED stays self-reported until P0-18 ties it to a pinned third-party key.
  return { claimKind: TRUST_TIER_KINDS[tier], reasons: tier === "ATTESTED" ? ["REVIEW_NOT_INDEPENDENT"] : [] };
}

export function claimKindFromClaimTier(tier: ClaimTier): MappedKind {
  return { claimKind: CLAIM_TIER_KINDS[tier], reasons: [] };
}

/** An unrecognised stored status (1.x results are untrusted input) is not evaluated. */
export function fromUppercaseStatus(status: CertificationEvidenceStatus | ComplianceCategoryStatus):
  { result: ResultState; evidence?: "incomplete" } {
  return Object.hasOwn(UPPERCASE_STATUS, status)
    ? { ...UPPERCASE_STATUS[status] } : { result: "not_evaluated", evidence: "incomplete" };
}

function evidence(eventCount: number, tiers: ClaimEligibilityInput["evidence"]["tiers"],
  newestTs: number | null = null): ClaimEligibilityInput["evidence"] {
  return { eventCount, tiers, newestTs, boundToControl: true, sameScope: true, contradictory: false,
    signatureValid: null, issuerPinned: null };
}

export type DiagnosticReportClaimInput = DiagnosticEvidenceReadinessInput
  & Pick<DiagnosticReport, "agentId" | "runId" | "windowEndTs" | "layerScores" | "contradictionCount">;

/**
 * Keeps a diagnostic run's real level. A run proposes a pass only when AMC's own evidence-readiness gate
 * marks it claim-eligible; otherwise the result is not evaluated and the reason says so.
 */
export function envelopeForDiagnosticReport(report: DiagnosticReportClaimInput, now: number): ClaimEnvelope {
  const coverage = report.evidenceTrustCoverage;
  const layers = report.layerScores;
  const level = layers.length === 0 ? null : layers.reduce((sum, layer) => sum + layer.avgFinalLevel, 0) / layers.length;
  const readiness = evaluateDiagnosticEvidenceReadiness(report);
  const envelope = evaluateClaimEligibility({
    producer: `diagnostic:${report.agentId}`,
    method: "runtime_observation",
    regulated: false,
    proposed: { result: readiness.claimEligible ? "pass" : "not_evaluated", level },
    // The report carries coverage fractions, not counts; the rules only need empty versus not empty.
    evidence: {
      ...evidence(coverage.observed + coverage.attested + coverage.selfReported > 0 ? 1 : 0,
        coverage.observed > 0 ? ["OBSERVED"] : ["SELF_REPORTED"], report.windowEndTs),
      contradictory: report.contradictionCount > 0,
      signatureValid: report.status === "VALID"
    },
    evidenceRefs: [report.runId],
    now
  });
  if (readiness.claimEligible) return envelope;
  const untrusted = readiness.status === "UNVERIFIED" || report.trustLabel === "UNRELIABLE — DO NOT USE FOR CLAIMS";
  const current = envelope.statusDimensions.evidence;
  const evidenceState = untrusted ? "untrusted" : current === "sufficient" ? "incomplete" : current;
  return { ...envelope, statusDimensions: { ...envelope.statusDimensions, evidence: evidenceState },
    reasons: [...envelope.reasons, "EVIDENCE_NOT_CLAIM_READY"] };
}

interface AdapterBase { producer: string; regulated?: boolean; applicability?: Applicability;
  evidenceRefs?: readonly string[]; now: number }

export function envelopeForSelfAssessment(input: AdapterBase & { answers: readonly number[] }): ClaimEnvelope {
  const answered = input.answers.length > 0;
  return evaluateClaimEligibility({
    ...input,
    method: "numeric_self_answer",
    regulated: input.regulated ?? false,
    proposed: { result: answered ? "pass" : "not_evaluated", level: answered ? Math.min(...input.answers) : null },
    evidence: evidence(input.answers.length, ["SELF_REPORTED"])
  });
}

/**
 * A surface result no adapter binds to evidence yet: never a pass and never a level. The reason says so,
 * rather than suggesting the producer recorded nothing.
 */
export function envelopeForUnboundResult(input: AdapterBase & { method: ClaimMethod }): ClaimEnvelope {
  const envelope = evaluateClaimEligibility({
    ...input,
    regulated: input.regulated ?? false,
    proposed: { result: "not_evaluated", level: null },
    evidence: evidence(0, [])
  });
  return { ...envelope, reasons: ["RESULT_NOT_BOUND", ...envelope.reasons] };
}

export function envelopeForSyntheticExample(input: AdapterBase & { level?: number }): ClaimEnvelope {
  return evaluateClaimEligibility({
    ...input,
    method: "synthetic",
    regulated: input.regulated ?? false,
    proposed: { result: "not_evaluated", level: input.level ?? null },
    evidence: evidence(0, [])
  });
}

export function envelopeForPathPresence(input: AdapterBase & { found: boolean; level: number | null }): ClaimEnvelope {
  const refs = input.evidenceRefs ?? [];
  return evaluateClaimEligibility({
    ...input,
    method: "path_presence",
    regulated: input.regulated ?? false,
    proposed: { result: input.found ? "pass" : "fail", level: input.level },
    evidence: evidence(refs.length, ["OBSERVED"])
  });
}

export function envelopeForLegacyResult(input: AdapterBase & {
  version: string; originalTier?: string; method: ClaimMethod;
  status: CertificationEvidenceStatus | ComplianceCategoryStatus; level: number | null; eventCount: number;
}): ClaimEnvelope {
  const mapped = fromUppercaseStatus(input.status);
  const legacy = input.originalTier === undefined
    ? { version: input.version } : { version: input.version, originalTier: input.originalTier };
  const envelope = evaluateClaimEligibility({
    producer: input.producer,
    method: input.method,
    regulated: input.regulated ?? false,
    proposed: { result: mapped.result, level: input.level },
    evidence: evidence(input.eventCount, []),
    evidenceRefs: input.evidenceRefs,
    applicability: input.applicability,
    legacy,
    now: input.now
  });
  if (!mapped.evidence || envelope.statusDimensions.evidence !== "sufficient") return envelope;
  return { ...envelope, statusDimensions: { ...envelope.statusDimensions, evidence: mapped.evidence } };
}
