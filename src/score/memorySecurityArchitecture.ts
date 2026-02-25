/**
 * Memory Security Architecture Maturity
 * Scores zero-trust security of the agent memory layer.
 * Source: MemTrust (arXiv:2601.07004)
 * Memory layer needs hardware isolation, crypto provenance, access pattern obfuscation.
 */

import { existsSync } from "fs";
import { join } from "path";

export interface MemorySecurityArchitectureResult {
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

  const hasMemoryIsolation = ["src/sandbox", ".amc/sandbox_profile.json", "Dockerfile"]
    .some(f => existsSync(join(root, f)));

  const hasCryptoProvenance = ["src/receipts", "src/crypto", "src/claims"]
    .some(f => existsSync(join(root, f)));

  const hasAccessPatternProtection = ["src/monitor/accessPatterns.ts", ".amc/access_policy.json"]
    .some(f => existsSync(join(root, f)));

  const hasMemoryAuditTrail = [".amc/audit_log.jsonl", "src/ledger"]
    .some(f => existsSync(join(root, f)));

  const hasMemoryVersioning = [".amc/snapshots", ".amc/state/versions"]
    .some(f => existsSync(join(root, f)));

  const hasMemoryIntegrityVerification = ["src/score/memoryIntegrity.ts", "src/verify/memoryVerifier.ts"]
    .some(f => existsSync(join(root, f)));

  if (!hasMemoryIsolation) gaps.push("No memory isolation — agent memory is not sandboxed or containerized");
  if (!hasCryptoProvenance) gaps.push("No crypto provenance — memory entries lack cryptographic proof of origin");
  if (!hasAccessPatternProtection) gaps.push("No access pattern protection — memory access patterns are observable");
  if (!hasMemoryAuditTrail) gaps.push("No memory audit trail — cannot reconstruct who accessed what memory and when");
  if (!hasMemoryVersioning) gaps.push("No memory versioning — cannot roll back to known-good memory state");
  if (!hasMemoryIntegrityVerification) gaps.push("No memory integrity verification — tampered memory goes undetected");

  if (!hasMemoryIsolation) recommendations.push("Isolate agent memory via sandboxing or containerization");
  if (!hasCryptoProvenance) recommendations.push("Add cryptographic provenance to memory entries for tamper evidence");
  if (!hasMemoryVersioning) recommendations.push("Version memory snapshots to enable rollback on integrity failures");
  if (!hasMemoryIntegrityVerification) recommendations.push("Verify memory integrity on read to detect tampering");

  const checks = [hasMemoryIsolation, hasCryptoProvenance, hasAccessPatternProtection,
    hasMemoryAuditTrail, hasMemoryVersioning, hasMemoryIntegrityVerification];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasMemoryIsolation, hasCryptoProvenance, hasAccessPatternProtection,
    hasMemoryAuditTrail, hasMemoryVersioning, hasMemoryIntegrityVerification,
    gaps, recommendations,
  };
}
