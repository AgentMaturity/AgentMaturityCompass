/**
 * Kernel Sandbox Maturity
 * Scores whether agent code execution is isolated at the OS/kernel level,
 * not just application-level sandboxing (which can be bypassed).
 * Source: HN — nono (kernel-enforced sandboxing for AI agents, 2026)
 * Linux: Landlock LSM; macOS: Seatbelt (sandbox_init)
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface KernelSandboxResult {
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
  hasOSLevelIsolation: boolean;         // Landlock/Seatbelt/seccomp, not just app sandbox
  hasFilesystemRestrictions: boolean;   // read/write scoped to declared paths only
  hasNetworkIsolation: boolean;         // network access controlled at OS level
  hasSecretInjection: boolean;          // secrets injected as env vars, not stored in files
  hasSandboxProfile: boolean;           // declarative sandbox profile per agent
  hasEscapeDetection: boolean;          // detects attempts to escape sandbox
  gaps: string[];
  recommendations: string[];
}

export function scoreKernelSandboxMaturity(cwd?: string): KernelSandboxResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // OS-level isolation
  const osIsolationPaths = [".amc/sandbox_profile.json", "sandbox.toml", ".nono", "Dockerfile"];
  const hasOSLevelIsolationOutcome = assessCriterion(root, osIsolationPaths);
  const hasOSLevelIsolation = hasOSLevelIsolationOutcome.met;

  // Filesystem restrictions
  const fsPaths = [".amc/sandbox_profile.json", "sandbox.toml", ".amc/fs_policy.json"];
  const hasFilesystemRestrictionsOutcome = assessCriterion(root, fsPaths);
  const hasFilesystemRestrictions = hasFilesystemRestrictionsOutcome.met;

  // Network isolation
  const netPaths = [".amc/network_policy.json", "sandbox.toml", ".amc/sandbox_profile.json"];
  const hasNetworkIsolationOutcome = assessCriterion(root, netPaths);
  const hasNetworkIsolation = hasNetworkIsolationOutcome.met;

  // Secret injection (keychain/secret service, not plaintext files)
  const secretPaths = [".amc/secret_policy.json", "src/vault", "src/secrets"];
  const hasSecretInjectionOutcome = assessCriterion(root, secretPaths);
  const hasSecretInjection = hasSecretInjectionOutcome.met;

  // Sandbox profile — declarative per-agent
  const profilePaths = [".amc/sandbox_profile.json", "sandbox.toml", ".amc/profiles"];
  const hasSandboxProfileOutcome = assessCriterion(root, profilePaths);
  const hasSandboxProfile = hasSandboxProfileOutcome.met;

  // Escape detection
  const escapePaths = ["src/assurance/packs/compoundThreatPack.ts", "src/monitor/escapeDetector.ts"];
  const hasEscapeDetectionOutcome = assessCriterion(root, escapePaths);
  const hasEscapeDetection = hasEscapeDetectionOutcome.met;

  if (hasOSLevelIsolationOutcome.assessable && !hasOSLevelIsolation) gaps.push("No OS-level isolation — application sandbox can be bypassed by code it sandboxes");
  if (hasFilesystemRestrictionsOutcome.assessable && !hasFilesystemRestrictions) gaps.push("No filesystem restrictions — agent can read ~/.ssh, .env, credentials");
  if (hasNetworkIsolationOutcome.assessable && !hasNetworkIsolation) gaps.push("No network isolation — agent can exfiltrate data to arbitrary hosts");
  if (hasSecretInjectionOutcome.assessable && !hasSecretInjection) gaps.push("No secure secret injection — secrets may be stored in plaintext files");
  if (hasSandboxProfileOutcome.assessable && !hasSandboxProfile) gaps.push("No declarative sandbox profile — isolation is ad-hoc and unverifiable");
  if (hasEscapeDetectionOutcome.assessable && !hasEscapeDetection) gaps.push("No sandbox escape detection — breakout attempts go unnoticed");

  if (hasOSLevelIsolationOutcome.assessable && !hasOSLevelIsolation) recommendations.push("Use OS-level isolation: Landlock LSM (Linux) or Seatbelt sandbox_init (macOS) for agent code execution");
  if (hasFilesystemRestrictionsOutcome.assessable && !hasFilesystemRestrictions) recommendations.push("Scope filesystem access to declared read/write paths only; deny all others at kernel level");
  if (hasSecretInjectionOutcome.assessable && !hasSecretInjection) recommendations.push("Inject secrets from keychain/secret service as env vars; zeroize after exec; never store in files");

  const outcomes = [hasOSLevelIsolationOutcome, hasFilesystemRestrictionsOutcome, hasNetworkIsolationOutcome, hasSecretInjectionOutcome, hasSandboxProfileOutcome, hasEscapeDetectionOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasOSLevelIsolation, hasFilesystemRestrictions, hasNetworkIsolation,
    hasSecretInjection, hasSandboxProfile, hasEscapeDetection,
    gaps, recommendations,
  };
}
