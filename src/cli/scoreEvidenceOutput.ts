import type { EvidenceOutcome } from "../types.js";
import type { ClaimEnvelope } from "../claims/eligibility/types.js";
import { emitClaimResult } from "./claimOutput.js";

/** Preserve claim fields while withholding scores for unevaluated evidence. */
export function emitScoreEvidenceResult<T extends object & { outcome: EvidenceOutcome; length?: never }>(
  title: string, result: T, claim: ClaimEnvelope, opts: { json?: boolean },
): boolean {
  if (result.outcome !== "measured") process.exitCode = 1;
  if (emitClaimResult(title, result, claim, opts)) return true;
  if (result.outcome === "measured") return false;
  console.log(`No data: ${result.outcome}.`);
  return true;
}
