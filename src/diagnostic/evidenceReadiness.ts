import type {
  DiagnosticEvidenceReadiness,
  DiagnosticReport,
  EvidenceReadinessReasonCode
} from "../types.js";

import type { ParsedEvidenceEvent } from "./gates.js";

/** CLI-01: what the agent did in the window, so an empty score can say it saw the run but accepted none of it. */
export function recordedActivityOf(events: readonly ParsedEvidenceEvent[]): { events: number; sessions: number } {
  const rows = events.filter((event) => event.event_type !== "audit");
  return { events: rows.length, sessions: new Set(rows.map((event) => event.session_id)).size };
}

export const CLAIM_READY_INTEGRITY = 0.6 as const;
export const INSUFFICIENT_INTEGRITY_BELOW = 0.4 as const;

export type DiagnosticEvidenceReadinessInput = Pick<
  DiagnosticReport,
  | "status"
  | "verificationPassed"
  | "trustBoundaryViolated"
  | "trustBoundaryMessage"
  | "integrityIndex"
  | "trustLabel"
  | "evidenceCoverage"
  | "evidenceTrustCoverage"
  | "importProvenance"
> & Partial<Pick<DiagnosticReport, "recordedActivity">>;

function readiness(
  status: DiagnosticEvidenceReadiness["status"],
  label: string,
  reasonCodes: EvidenceReadinessReasonCode[],
  claimBoundary: string,
  nextStep: string
): DiagnosticEvidenceReadiness {
  return {
    schemaVersion: "2026-07-10",
    status,
    claimEligible: status === "READY",
    label,
    reasonCodes,
    claimBoundary,
    nextStep,
    thresholds: {
      readyIntegrity: CLAIM_READY_INTEGRITY,
      insufficientIntegrityBelow: INSUFFICIENT_INTEGRITY_BELOW
    }
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateDiagnosticEvidenceReadiness(
  report: DiagnosticEvidenceReadinessInput
): DiagnosticEvidenceReadiness {
  if (report.importProvenance) {
    return readiness(
      "UNVERIFIED",
      "External import — not evaluated",
      ["NO_ACCEPTED_EVIDENCE"],
      "Imported content is SELF_REPORTED. Importing or signing an artifact does not verify source claims or perform a maturity evaluation.",
      "Capture observed evidence or obtain a named attestation, then run a full AMC assessment."
    );
  }
  if (report.status === "UNSIGNED") {
    return readiness(
      "UNVERIFIED",
      "Unsigned local preview",
      ["ARTIFACT_UNSIGNED"],
      "Vault signing was skipped. Use this run for local diagnosis only; it is not verifier-ready or claim-eligible.",
      "Unlock or initialize the vault, rerun AMC, and then satisfy the evidence-readiness gate."
    );
  }

  if (report.trustBoundaryViolated) {
    return readiness(
      "UNVERIFIED",
      "Trust boundary violation",
      ["TRUST_BOUNDARY_VIOLATION"],
      "The evidence path crossed the configured trust boundary, so this run is not client-ready, auditor-ready, or claim-eligible.",
      report.trustBoundaryMessage ?? "Resolve the trust-boundary finding, then rerun the assessment."
    );
  }

  if (report.status === "INVALID" || !report.verificationPassed) {
    const reasons: EvidenceReadinessReasonCode[] = [];
    if (report.status === "INVALID") reasons.push("ARTIFACT_INVALID");
    if (!report.verificationPassed) reasons.push("ARTIFACT_VERIFICATION_FAILED");
    return readiness(
      "UNVERIFIED",
      "Unverified evidence chain",
      reasons,
      "This report is useful for local diagnosis, but it is not client-ready or auditor-ready because the evidence chain did not verify.",
      "Run amc verify, repair invalid receipts or missing seals, and rerun the assessment."
    );
  }

  const trustCoverage = report.evidenceTrustCoverage;
  const metadataComplete = finiteNumber(report.integrityIndex)
    && finiteNumber(report.evidenceCoverage)
    && typeof report.trustLabel === "string"
    && finiteNumber(trustCoverage?.observed)
    && finiteNumber(trustCoverage?.attested)
    && finiteNumber(trustCoverage?.selfReported);
  if (!metadataComplete) {
    return readiness(
      "UNVERIFIED",
      "Missing evidence metadata",
      ["MISSING_EVIDENCE_METADATA"],
      "The artifact verifies, but required evidence coverage, integrity, or trust metadata is missing or malformed, so claims fail closed.",
      "Regenerate the report with the current AMC methodology before relying on it."
    );
  }

  if (report.evidenceCoverage <= 0 && (report.recordedActivity?.events ?? 0) > 0) {
    return readiness(
      "INSUFFICIENT_EVIDENCE",
      "Recorded activity, no accepted evidence",
      ["NO_ACCEPTED_EVIDENCE", "LOW_INTEGRITY"],
      "AMC recorded what this agent did, but none of it is evidence any question accepts, so every level stays L0. A signature shows who wrote a record and that it is unchanged, not that the score is supported. Use this only as a local baseline.",
      "A run's own output is recorded but not scored. Scored evidence comes from tool calls AMC carries out or checks: run the agent through AMC (amc, then watch Claude Code or Codex, or chat with a model), then rerun amc. amc explain AMC-1.1 shows what one question accepts."
    );
  }

  if (report.evidenceCoverage <= 0) {
    return readiness(
      "INSUFFICIENT_EVIDENCE",
      "No accepted evidence",
      ["NO_ACCEPTED_EVIDENCE", "LOW_INTEGRITY"],
      "The artifact seal is valid, but no accepted evidence supports the score. A signature shows the record is unchanged, not that there is enough evidence. Use this only as a local baseline.",
      "Connect or capture an agent run, ingest accepted evidence, and rerun amc before making maturity, compliance, or deployment claims."
    );
  }

  if (report.integrityIndex < INSUFFICIENT_INTEGRITY_BELOW) {
    return readiness(
      "INSUFFICIENT_EVIDENCE",
      "Insufficient evidence integrity",
      ["LOW_INTEGRITY"],
      "The artifact seal is valid, but evidence integrity is below AMC's minimum claim threshold. A signature shows the record is unchanged, not that there is enough evidence.",
      "Collect stronger observed or attested evidence, resolve integrity penalties, and rerun amc."
    );
  }

  if (report.integrityIndex < CLAIM_READY_INTEGRITY || report.trustLabel !== "HIGH TRUST") {
    const reasons: EvidenceReadinessReasonCode[] = ["LIMITED_INTEGRITY"];
    if (report.trustLabel !== "HIGH TRUST") reasons.push("TRUST_LABEL_BLOCKED");
    return readiness(
      "LIMITED",
      "Limited evidence",
      reasons,
      "The evidence chain verifies, but current evidence is too limited for strong external claims. Use the result for scoped internal decisions and remediation only.",
      "Increase accepted evidence coverage, clear trust penalties, and rerun amc until evidence readiness is READY."
    );
  }

  return readiness(
    "READY",
    "Claim-ready verified evidence",
    [],
    "This report is claim-eligible within its configured agent, trust boundary, evidence window, and methodology version. Verify the bundle before relying on it and apply any required legal or compliance review.",
    "Keep evidence current and rerun after material agent, policy, model, tool, or environment changes."
  );
}

export function summarizeDiagnosticEvidenceReadiness(report: DiagnosticEvidenceReadinessInput): {
  evidenceStatus: DiagnosticEvidenceReadiness["status"];
  claimEligible: boolean;
} {
  const readiness = evaluateDiagnosticEvidenceReadiness(report);
  return { evidenceStatus: readiness.status, claimEligible: readiness.claimEligible };
}
