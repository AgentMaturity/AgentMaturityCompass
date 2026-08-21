/**
 * Agent State Portability
 * Scores whether agent cognitive state (memory, intent graph, session context) can be
 * serialized, transferred, and rehydrated across models/frameworks without loss.
 * Source: HN — VNOL pattern, "Agent State is the new vendor lock-in" (2026)
 */

import { existsSync } from "fs";
import { join } from "path";
import { assessCriterion, scoreAssessableCriteria, notAssessableNote } from "./controlSurfaceScope.js";

export interface AgentStatePortabilityResult {
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
  const hasSerializableStateOutcome = assessCriterion(root, snapshotPaths);
  hasSerializableState = hasSerializableStateOutcome.met;

  // Vendor-neutral format — YAML/JSON spec, not framework-specific binary
  const neutralPaths = [".amc/state_spec.yaml", ".amc/state_spec.json", "STATE_SCHEMA.md"];
  const hasVendorNeutralFormatOutcome = assessCriterion(root, neutralPaths);
  hasVendorNeutralFormat = hasVendorNeutralFormatOutcome.met;

  // State versioning
  const versionPaths = [".amc/snapshots", ".amc/state/versions"];
  const hasStateVersioningOutcome = assessCriterion(root, versionPaths);
  hasStateVersioning = hasStateVersioningOutcome.met;

  // Rehydration test — test files that verify state restore
  const testPaths = ["tests/state", "tests/portability", "tests/rehydration"];
  const hasRehydrationTestOutcome = assessCriterion(root, testPaths);
  hasRehydrationTest = hasRehydrationTestOutcome.met;

  // Integrity on transfer — HMAC/signature on snapshots
  const integrityPaths = [".amc/state_signatures", ".amc/snapshot_hashes.json"];
  const hasIntegrityOnTransferOutcome = assessCriterion(root, integrityPaths);
  hasIntegrityOnTransfer = hasIntegrityOnTransferOutcome.met;

  // Framework abstraction — adapter layer
  const adapterPaths = ["src/adapters", "src/integrations", "ADAPTERS.md"];
  const hasFrameworkAbstractionOutcome = assessCriterion(root, adapterPaths);
  hasFrameworkAbstraction = hasFrameworkAbstractionOutcome.met;

  if (hasSerializableStateOutcome.assessable && !hasSerializableState) gaps.push("Agent state cannot be serialized — sessions start from zero every time");
  if (hasVendorNeutralFormatOutcome.assessable && !hasVendorNeutralFormat) gaps.push("No vendor-neutral state format — locked to current framework");
  if (hasStateVersioningOutcome.assessable && !hasStateVersioning) gaps.push("No state versioning — cannot roll back or audit state evolution");
  if (hasRehydrationTestOutcome.assessable && !hasRehydrationTest) gaps.push("No rehydration tests — state portability is unverified");
  if (hasIntegrityOnTransferOutcome.assessable && !hasIntegrityOnTransfer) gaps.push("No integrity verification on state transfer — tamper risk");
  if (hasFrameworkAbstractionOutcome.assessable && !hasFrameworkAbstraction) gaps.push("No framework abstraction layer — migration requires full rewrite");

  if (hasSerializableStateOutcome.assessable && !hasSerializableState) recommendations.push("Implement state snapshots: serialize memory, intent graph, and session context to JSON/YAML");
  if (hasVendorNeutralFormatOutcome.assessable && !hasVendorNeutralFormat) recommendations.push("Define a vendor-neutral state schema (YAML spec) decoupled from any specific LLM framework");
  if (hasIntegrityOnTransferOutcome.assessable && !hasIntegrityOnTransfer) recommendations.push("Sign state snapshots with HMAC before transfer; verify on rehydration");

  const outcomes = [hasSerializableStateOutcome, hasVendorNeutralFormatOutcome, hasStateVersioningOutcome, hasRehydrationTestOutcome, hasIntegrityOnTransferOutcome, hasFrameworkAbstractionOutcome];
  const { score, assessed: assessedCriteria, total: totalCriteria, notAssessable: notAssessableCriteria } =
    scoreAssessableCriteria(outcomes);
  const skipped = notAssessableNote(notAssessableCriteria, totalCriteria);
  if (skipped) recommendations.push(skipped);
  const level = score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : score >= 10 ? 1 : 0;

  return {
    score, level, assessedCriteria, totalCriteria, notAssessableCriteria,
    hasSerializableState, hasVendorNeutralFormat, hasStateVersioning,
    hasRehydrationTest, hasIntegrityOnTransfer, hasFrameworkAbstraction,
    gaps, recommendations,
  };
}
