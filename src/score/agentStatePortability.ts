/**
 * Agent State Portability
 * Scores whether agent cognitive state (memory, intent graph, session context) can be
 * serialized, transferred, and rehydrated across models/frameworks without loss.
 * Source: HN — VNOL pattern, "Agent State is the new vendor lock-in" (2026)
 */

import { existsSync } from "fs";
import { join } from "path";
import { evidencePathExists } from "./controlSurfaceScope.js";

export interface AgentStatePortabilityResult {
  score: number; // 0-100
  level: number; // 0-5
  hasSerializableState: boolean;
  hasVendorNeutralFormat: boolean;
  hasStateVersioning: boolean;
  hasRehydrationTest: boolean;
  hasIntegrityOnTransfer: boolean;
  hasFrameworkAbstraction: boolean;
  gaps: string[];
  recommendations: string[];
}

export function scoreAgentStatePortability(cwd?: string): AgentStatePortabilityResult {
  const root = cwd ?? process.cwd();
  const gaps: string[] = [];
  const recommendations: string[] = [];

  let hasSerializableState = false;
  let hasVendorNeutralFormat = false;
  let hasStateVersioning = false;
  let hasRehydrationTest = false;
  let hasIntegrityOnTransfer = false;
  let hasFrameworkAbstraction = false;

  // Serializable state — snapshot files
  const snapshotPaths = [".amc/snapshots", ".amc/state", "agent_state.json", "session_state.yaml"];
  for (const f of snapshotPaths) {
    if (evidencePathExists(root, f)) hasSerializableState = true;
  }

  // Vendor-neutral format — YAML/JSON spec, not framework-specific binary
  const neutralPaths = [".amc/state_spec.yaml", ".amc/state_spec.json", "STATE_SCHEMA.md"];
  for (const f of neutralPaths) {
    if (evidencePathExists(root, f)) hasVendorNeutralFormat = true;
  }

  // State versioning
  const versionPaths = [".amc/snapshots", ".amc/state/versions"];
  for (const f of versionPaths) {
    if (evidencePathExists(root, f)) hasStateVersioning = true;
  }

  // Rehydration test — test files that verify state restore
  const testPaths = ["tests/state", "tests/portability", "tests/rehydration"];
  for (const f of testPaths) {
    if (evidencePathExists(root, f)) hasRehydrationTest = true;
  }

  // Integrity on transfer — HMAC/signature on snapshots
  const integrityPaths = [".amc/state_signatures", ".amc/snapshot_hashes.json"];
  for (const f of integrityPaths) {
    if (evidencePathExists(root, f)) hasIntegrityOnTransfer = true;
  }

  // Framework abstraction — adapter layer
  const adapterPaths = ["src/adapters", "src/integrations", "ADAPTERS.md"];
  for (const f of adapterPaths) {
    if (evidencePathExists(root, f)) hasFrameworkAbstraction = true;
  }

  if (!hasSerializableState) gaps.push("Agent state cannot be serialized — sessions start from zero every time");
  if (!hasVendorNeutralFormat) gaps.push("No vendor-neutral state format — locked to current framework");
  if (!hasStateVersioning) gaps.push("No state versioning — cannot roll back or audit state evolution");
  if (!hasRehydrationTest) gaps.push("No rehydration tests — state portability is unverified");
  if (!hasIntegrityOnTransfer) gaps.push("No integrity verification on state transfer — tamper risk");
  if (!hasFrameworkAbstraction) gaps.push("No framework abstraction layer — migration requires full rewrite");

  if (!hasSerializableState) recommendations.push("Implement state snapshots: serialize memory, intent graph, and session context to JSON/YAML");
  if (!hasVendorNeutralFormat) recommendations.push("Define a vendor-neutral state schema (YAML spec) decoupled from any specific LLM framework");
  if (!hasIntegrityOnTransfer) recommendations.push("Sign state snapshots with HMAC before transfer; verify on rehydration");

  const checks = [hasSerializableState, hasVendorNeutralFormat, hasStateVersioning,
    hasRehydrationTest, hasIntegrityOnTransfer, hasFrameworkAbstraction];
  const passed = checks.filter(Boolean).length;
  const score = Math.round((passed / checks.length) * 100);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level,
    hasSerializableState, hasVendorNeutralFormat, hasStateVersioning,
    hasRehydrationTest, hasIntegrityOnTransfer, hasFrameworkAbstraction,
    gaps, recommendations,
  };
}
