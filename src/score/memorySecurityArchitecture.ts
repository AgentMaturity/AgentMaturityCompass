/**
 * Memory Security Architecture Maturity
 * Scores zero-trust security of the agent memory layer.
 * Source: MemTrust (arXiv:2601.07004)
 * Memory layer needs hardware isolation, crypto provenance, access pattern obfuscation.
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface MemorySecurityArchitectureResult {
  /**
   * How many criteria this score was actually computed over.
   *
   * Criteria whose only evidence paths are AMC's own source modules cannot be
   * judged against a real agent. Counting them as failures silently capped the
   * achievable score, so they are excluded from the denominator and reported
   * here instead: a score of 71 over 4 assessed criteria is a different claim
   * from 71 over 7.
   */
  assessedCriteria?: number;
  totalCriteria?: number;
  notAssessableCriteria?: number;
  score: number; // 0-100
  level: number; // 0-5
  hasMemoryIsolation: boolean;
  hasCryptoProvenance: boolean;
  hasAccessPatternProtection: boolean;
  hasMemoryAuditTrail: boolean;
  hasMemoryVersioning: boolean;
  hasMemoryIntegrityVerification: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreMemorySecurityArchitecture(cwd?: string): MemorySecurityArchitectureResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const hasMemoryIsolationOutcome = assessCriterion(root, ["src/sandbox", ".amc/sandbox_profile.json", "Dockerfile"]);
  const hasMemoryIsolation = hasMemoryIsolationOutcome.met;

  const hasCryptoProvenanceOutcome = assessCriterion(root, ["src/receipts", "src/crypto", "src/claims"]);
  const hasCryptoProvenance = hasCryptoProvenanceOutcome.met;

  const hasAccessPatternProtectionOutcome = assessCriterion(root, ["src/monitor/accessPatterns.ts", ".amc/access_policy.json"]);
  const hasAccessPatternProtection = hasAccessPatternProtectionOutcome.met;

  const hasMemoryAuditTrailOutcome = assessCriterion(root, [".amc/audit_log.jsonl", "src/ledger"]);
  const hasMemoryAuditTrail = hasMemoryAuditTrailOutcome.met;

  const hasMemoryVersioningOutcome = assessCriterion(root, [".amc/snapshots", ".amc/state/versions"]);
  const hasMemoryVersioning = hasMemoryVersioningOutcome.met;

  const hasMemoryIntegrityVerificationOutcome = assessCriterion(root, ["src/score/memoryIntegrity.ts", "src/verify/memoryVerifier.ts"]);
  const hasMemoryIntegrityVerification = hasMemoryIntegrityVerificationOutcome.met;

  if (hasMemoryIsolationOutcome.assessable && !hasMemoryIsolation) gaps.push("No memory isolation — agent memory is not sandboxed or containerized");
  if (hasCryptoProvenanceOutcome.assessable && !hasCryptoProvenance) gaps.push("No crypto provenance — memory entries lack cryptographic proof of origin");
  if (hasAccessPatternProtectionOutcome.assessable && !hasAccessPatternProtection) gaps.push("No access pattern protection — memory access patterns are observable");
  if (hasMemoryAuditTrailOutcome.assessable && !hasMemoryAuditTrail) gaps.push("No memory audit trail — cannot reconstruct who accessed what memory and when");
  if (hasMemoryVersioningOutcome.assessable && !hasMemoryVersioning) gaps.push("No memory versioning — cannot roll back to known-good memory state");
  if (hasMemoryIntegrityVerificationOutcome.assessable && !hasMemoryIntegrityVerification) gaps.push("No memory integrity verification — tampered memory goes undetected");

  if (hasMemoryIsolationOutcome.assessable && !hasMemoryIsolation) recommendations.push("Isolate agent memory via sandboxing or containerization");
  if (hasCryptoProvenanceOutcome.assessable && !hasCryptoProvenance) recommendations.push("Add cryptographic provenance to memory entries for tamper evidence");
  if (hasMemoryVersioningOutcome.assessable && !hasMemoryVersioning) recommendations.push("Version memory snapshots to enable rollback on integrity failures");
  if (hasMemoryIntegrityVerificationOutcome.assessable && !hasMemoryIntegrityVerification) recommendations.push("Verify memory integrity on read to detect tampering");

  const outcomes = [hasMemoryIsolationOutcome, hasCryptoProvenanceOutcome, hasAccessPatternProtectionOutcome, hasMemoryAuditTrailOutcome, hasMemoryVersioningOutcome, hasMemoryIntegrityVerificationOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasMemoryIsolation, hasCryptoProvenance, hasAccessPatternProtection,
    hasMemoryAuditTrail, hasMemoryVersioning, hasMemoryIntegrityVerification,
    gaps, recommendations,
  };
}
