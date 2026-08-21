/**
 * Kernel Sandbox Maturity
 * Scores whether agent code execution is isolated at the OS/kernel level,
 * not just application-level sandboxing (which can be bypassed).
 * Source: HN — nono (kernel-enforced sandboxing for AI agents, 2026)
 * Linux: Landlock LSM; macOS: Seatbelt (sandbox_init)
 */

import { existsSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface KernelSandboxResult {
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
  const hasOSLevelIsolation = osIsolationPaths.some(f => evidencePathExists(root, f));

  // Filesystem restrictions
  const fsPaths = [".amc/sandbox_profile.json", "sandbox.toml", ".amc/fs_policy.json"];
  const hasFilesystemRestrictions = fsPaths.some(f => evidencePathExists(root, f));

  // Network isolation
  const netPaths = [".amc/network_policy.json", "sandbox.toml", ".amc/sandbox_profile.json"];
  const hasNetworkIsolation = netPaths.some(f => evidencePathExists(root, f));

  // Secret injection (keychain/secret service, not plaintext files)
  const secretPaths = [".amc/secret_policy.json", "src/vault", "src/secrets"];
  const hasSecretInjection = secretPaths.some(f => evidencePathExists(root, f));

  // Sandbox profile — declarative per-agent
  const profilePaths = [".amc/sandbox_profile.json", "sandbox.toml", ".amc/profiles"];
  const hasSandboxProfile = profilePaths.some(f => evidencePathExists(root, f));

  // Escape detection
  const escapePaths = ["src/assurance/packs/compoundThreatPack.ts", "src/monitor/escapeDetector.ts"];
  const hasEscapeDetection = escapePaths.some(f => evidencePathExists(root, f));

  if (!hasOSLevelIsolation) gaps.push("No OS-level isolation — application sandbox can be bypassed by code it sandboxes");
  if (!hasFilesystemRestrictions) gaps.push("No filesystem restrictions — agent can read ~/.ssh, .env, credentials");
  if (!hasNetworkIsolation) gaps.push("No network isolation — agent can exfiltrate data to arbitrary hosts");
  if (!hasSecretInjection) gaps.push("No secure secret injection — secrets may be stored in plaintext files");
  if (!hasSandboxProfile) gaps.push("No declarative sandbox profile — isolation is ad-hoc and unverifiable");
  if (!hasEscapeDetection) gaps.push("No sandbox escape detection — breakout attempts go unnoticed");

  if (!hasOSLevelIsolation) recommendations.push("Use OS-level isolation: Landlock LSM (Linux) or Seatbelt sandbox_init (macOS) for agent code execution");
  if (!hasFilesystemRestrictions) recommendations.push("Scope filesystem access to declared read/write paths only; deny all others at kernel level");
  if (!hasSecretInjection) recommendations.push("Inject secrets from keychain/secret service as env vars; zeroize after exec; never store in files");

  const checks = [hasOSLevelIsolation, hasFilesystemRestrictions, hasNetworkIsolation,
    hasSecretInjection, hasSandboxProfile, hasEscapeDetection];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasOSLevelIsolation, hasFilesystemRestrictions, hasNetworkIsolation,
    hasSecretInjection, hasSandboxProfile, hasEscapeDetection,
    gaps, recommendations,
  };
}
