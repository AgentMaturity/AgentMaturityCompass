import type { ValidationResult } from "../validators.js";
import { INDUSTRY_EVIDENCE_MISSING } from "../packs/industryPackManifest.js";

/** Legacy callers cannot turn a reply into an executed regulated result. */
export function refuseUnexecutedEvidence(): ValidationResult {
  return {
    pass: false,
    reasons: ["NOT GRADED: executed effect evidence is required; a reply cannot establish a regulated result."],
    auditTypes: [INDUSTRY_EVIDENCE_MISSING]
  };
}
