/**
 * Production Readiness Gate
 * Deterministic assessment (no LLMs).
 */

import { normalizeAgentId } from "../fleet/paths.js";
import { collectEvidenceFromLedger, type CollectedEvidence } from "./evidenceCollector.js";
import { computeMaturityScore } from "./formalSpec.js";
import { openLedger } from "../ledger/ledger.js";
import { verifyAlertsConfigSignature } from "../drift/alerts.js";
import type { AssuranceRunRecord, EvidenceEvent } from "../types.js";

export interface ProductionReadinessResult {
  ready: boolean;
  score: number; // 0-100
  gates: { name: string; passed: boolean; reason: string }[];
  blockers: string[];
  recommendations: string[];
}

function hasEvidenceAcrossThreeSessions(): boolean {
  try {
    const ledger = openLedger(process.cwd(), { readonly: true });
    try {
      const runs = ledger.listRuns();
      const sessions = ledger.getSessionsBetween(0, Date.now());
      return runs.length >= 3 || sessions.length >= 3;
    } finally {
      ledger.close();
    }
  } catch (_error) {
    return false;
  }
}

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hasAdversarialAssurance(agentId: string): boolean {
  try {
    const ledger = openLedger(process.cwd(), { readonly: true });
    let runs: AssuranceRunRecord[];
    try {
      runs = ledger.listAssuranceRuns(agentId);
    } finally {
      ledger.close();
    }
    const adversarial = new Set([
      "injection",
      "exfiltration",
      "governanceBypass",
      "disempowerment",
      "memoryPoisoning",
      "compoundThreat",
      "tocTou",
      "stepupApprovalBypass",
      "resourceExhaustion"
    ]);
    return runs.some((run: AssuranceRunRecord) => {
      try {
        const packIds = JSON.parse(run.pack_ids_json || "[]") as string[];
        return packIds.some((id) => adversarial.has(id));
      } catch {
        return false;
      }
    });
  } catch (_error) {
    return false;
  }
}

function hasDriftDetectionConfigured(): boolean {
  return verifyAlertsConfigSignature(process.cwd()).valid;
}

function hasActiveEnforcement(agentId: string): boolean {
  const evidence = collectEvidenceFromLedger(agentId, 30);
  return evidence.artifacts.length > 0;
}

function hasErrorHandling(): boolean {
  try {
    const ledger = openLedger(process.cwd(), { readonly: true });
    let events: EvidenceEvent[];
    try {
      events = ledger.getAllEvents() as EvidenceEvent[];
    } finally {
      ledger.close();
    }
    const retryOrCircuit = new Set([
      "CIRCUIT_BREAKER_OPENED",
      "CIRCUIT_BREAKER_HALF_OPEN",
      "RETRY_ENGINE_TRIGGERED",
      "RETRY_ENGINE_SUCCESS",
      "RETRY_ENGINE_FAILURE"
    ]);

    return events.some((event) => {
      if (event.event_type !== "audit") {
        return false;
      }
      const payload = parseJson(event.payload_inline) as Record<string, unknown> | null;
      const meta = parseJson(event.meta_json as string | undefined) as Record<string, unknown> | null;
      const auditType =
        (typeof payload?.auditType === "string" ? (payload.auditType as string) : null) ??
        (typeof meta?.auditType === "string" ? (meta.auditType as string) : null);

      return Boolean(auditType && retryOrCircuit.has(auditType));
    });
  } catch (_error) {
    return false;
  }
}

function hasMinimumMaturity(agentId: string): boolean {
  const evidence = collectEvidenceFromLedger(agentId, 90);
  const score = deriveMaturity(evidence);
  return score.overallLevel !== "L0" && score.overallLevel !== "L1";
}

function deriveMaturity(evidence: CollectedEvidence) {
  return computeMaturityScore(evidence.artifacts);
}

function reasonFor(name: string, passed: boolean): string {
  if (passed) {
    switch (name) {
      case "multi-session-evidence":
        return "PASS: >=3 session runs observed.";
      case "adversarial-testing":
        return "PASS: adversarial assurance pack observed.";
      case "drift-detection":
        return "PASS: drift detection config verified.";
      case "enforcement-module":
        return "PASS: enforcement activity observed.";
      case "error-handling":
        return "PASS: retry/circuit-breaker evidence observed.";
      default:
        return "PASS";
    }
  }

  switch (name) {
    case "multi-session-evidence":
      return "Need evidence from at least 3 distinct sessions.";
    case "adversarial-testing":
      return "Run at least one adversarial assurance pack.";
    case "drift-detection":
      return "Configure and validate drift/alert detection.";
    case "enforcement-module":
      return "Enable at least one enforcement module emitting events.";
    case "error-handling":
      return "Generate circuit breaker or retry engine audit events.";
    case "minimum-maturity":
      return "Maturity should be at least L2.";
    default:
      return "Blocked by unknown gate status.";
  }
}

export function assessProductionReadiness(agentId: string, options?: { strictMode?: boolean }): ProductionReadinessResult {
  const normalized = normalizeAgentId(agentId);
  const strictMode = Boolean(options?.strictMode);

  const gates = [
    { name: "multi-session-evidence", passed: hasEvidenceAcrossThreeSessions() },
    { name: "adversarial-testing", passed: hasAdversarialAssurance(normalized) },
    { name: "drift-detection", passed: hasDriftDetectionConfigured() },
    { name: "enforcement-module", passed: hasActiveEnforcement(normalized) },
    { name: "error-handling", passed: hasErrorHandling() },
    { name: "minimum-maturity", passed: hasMinimumMaturity(normalized) }
  ].map((g) => ({ ...g, reason: reasonFor(g.name, g.passed) }));

  const score = Math.round((gates.filter((g) => g.passed).length / gates.length) * 100);
  const blockers = gates.filter((g) => !g.passed).map((g) => g.name);
  const recommendations = blockers.map((b) =>
    reasonFor(
      b,
      false
    )
  );
  const ready = strictMode ? blockers.length === 0 : blockers.length <= 1;

  return {
    ready,
    score,
    gates,
    blockers,
    recommendations
  };
}
