import type { GuardCheckResult, RiskTier, TargetProfile } from "../types.js";
import type { ContextGraph } from "../context/contextGraph.js";

export interface GuardCheckInput {
  contextGraph: ContextGraph;
  signedTargetProfile: TargetProfile;
  proposedActionOrOutput: string;
  taskMetadata?: {
    riskTier?: RiskTier;
    actionType?: string;
  };
}

function hasEvidenceRefs(text: string): boolean {
  return /\[ev:[a-z0-9-]+\]/i.test(text);
}

function hasKnownUnknownAssumptions(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("known") && lowered.includes("unknown") && lowered.includes("assumption");
}

function hasConsentMarker(text: string): boolean {
  return /(consent|approved|approval|authorized)/i.test(text);
}

function hasVerificationMarker(text: string): boolean {
  return /(test_result|verification plan|simulate verification|validated by test)/i.test(text);
}

export function guardCheck(input: GuardCheckInput): GuardCheckResult {
  const result: GuardCheckResult = {
    pass: true,
    requiredRemediations: [],
    requiredEscalations: [],
    requiredVerificationSteps: [],
    requiredEvidenceToProceed: []
  };

  const text = input.proposedActionOrOutput;
  const riskTier = input.taskMetadata?.riskTier ?? input.contextGraph.riskTier;

  const targetQ26 = input.signedTargetProfile.mapping["AMC-3.3.1"] ?? 0;
  if (targetQ26 >= 4) {
    if (!hasKnownUnknownAssumptions(text)) {
      result.pass = false;
      result.requiredRemediations.push("Add explicit Known / Unknown / Assumptions section.");
    }
    if (!hasEvidenceRefs(text)) {
      result.pass = false;
      result.requiredEvidenceToProceed.push("Attach evidence references for factual claims using [ev:<eventId>].");
    }
  }

  const targetQ23 = input.signedTargetProfile.mapping["AMC-3.2.3"] ?? 0;
  if (targetQ23 >= 4 && (riskTier === "high" || riskTier === "critical")) {
    if (!hasConsentMarker(text)) {
      result.pass = false;
      result.requiredEscalations.push("High-risk compliance target requires explicit consent marker before action.");
    }
    result.requiredEvidenceToProceed.push("Create COMPLIANCE_CHECK and PERMISSION_CHECK_PASS audit events.");
  }

  const targetQ12 = input.signedTargetProfile.mapping["AMC-2.3"] ?? 0;
  if (targetQ12 >= 4) {
    if (!hasVerificationMarker(text)) {
      result.pass = false;
      result.requiredVerificationSteps.push("Include test_result evidence or a simulated verification plan.");
    }
  }

  if (/\b(delete|drop|revoke|transfer)\b/i.test(text) && (riskTier === "high" || riskTier === "critical")) {
    result.requiredEscalations.push("Irreversible high-risk action detected: require owner approval checkpoint.");
    if (!hasConsentMarker(text)) {
      result.pass = false;
    }
  }

  return result;
}
