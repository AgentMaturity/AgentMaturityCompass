/**
 * Production Wiring — Connects Items 11–16 into Gateway, Bridge & Diagnostic Flows
 *
 * This module bridges the standalone feature modules (overhead accounting,
 * operator UX, data residency, insider risk, cognition lab, FP tracker)
 * into the production event pipeline.
 *
 * Architecture: AMC uses event-driven, callback-based integration —
 * no middleware chains. Integration happens through:
 *   1. Audit event recording at natural decision points
 *   2. Diagnostic gates that check for specific audit types
 *   3. Assurance scenarios that validate integration correctness
 *
 * This module provides:
 *   - gatewayOverheadHook: Records per-request overhead metrics
 *   - bridgeResidencyHook: Validates data residency before forwarding
 *   - diagnosticOperatorHook: Enriches diagnostic reports with operator UX
 *   - insiderRiskHook: Records governance events for insider analytics
 *   - labSignalBridge: Bridges lab experiment signals to audit trail
 *   - fpTrackerHook: Records FP events from assurance results
 */

import { sha256Hex } from "../utils/hash.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditEventInput {
  eventType: "audit" | "metric";
  payload: string;
  meta: Record<string, unknown>;
}

export type AppendEvidenceFn = (input: AuditEventInput) => void;

export interface OverheadMeasurement {
  featureName: string;
  durationMs: number;
  tokenCount: number;
  requestId: string;
  agentId: string;
  ts: number;
}

export interface ResidencyCheckResult {
  allowed: boolean;
  region: string;
  policyId?: string;
  violations: string[];
}

export interface InsiderEventCapture {
  actorId: string;
  eventType: "approval" | "policy_change" | "tool_usage";
  action: string;
  ts: number;
  metadata: Record<string, unknown>;
}

export interface LabSignalBridgeResult {
  bridged: boolean;
  importId: string;
  auditType: string;
  confidence: number;
}

export interface WiringDiagnostic {
  moduleName: string;
  wired: boolean;
  hookCount: number;
  lastEventTs: number;
  eventCount: number;
}

// ---------------------------------------------------------------------------
// In-memory state for wiring metrics
// ---------------------------------------------------------------------------

interface WiringState {
  overheadEvents: OverheadMeasurement[];
  residencyChecks: ResidencyCheckResult[];
  insiderCaptures: InsiderEventCapture[];
  labBridgeResults: LabSignalBridgeResult[];
  fpEvents: Array<{ scenarioId: string; packId: string; ts: number }>;
  hookActivations: Map<string, number>;
}

let state: WiringState = {
  overheadEvents: [],
  residencyChecks: [],
  insiderCaptures: [],
  labBridgeResults: [],
  fpEvents: [],
  hookActivations: new Map(),
};

export function resetWiringState(): void {
  state = {
    overheadEvents: [],
    residencyChecks: [],
    insiderCaptures: [],
    labBridgeResults: [],
    fpEvents: [],
    hookActivations: new Map(),
  };
}

function recordActivation(hookName: string): void {
  state.hookActivations.set(hookName, (state.hookActivations.get(hookName) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// 1. Gateway Overhead Hook
// ---------------------------------------------------------------------------

/**
 * Records per-request overhead measurement in the gateway pipeline.
 * Call at the end of request processing to capture feature-level latency.
 */
export function gatewayOverheadHook(
  appendEvidence: AppendEvidenceFn,
  measurement: OverheadMeasurement
): void {
  recordActivation("gatewayOverhead");

  const auditPayload = {
    auditType: "OVERHEAD_COST_RECORDED",
    severity: "LOW",
    featureName: measurement.featureName,
    durationMs: measurement.durationMs,
    tokenCount: measurement.tokenCount,
    requestId: measurement.requestId,
    agentId: measurement.agentId,
  };

  appendEvidence({
    eventType: "metric",
    payload: JSON.stringify(auditPayload),
    meta: {
      auditType: "OVERHEAD_COST_RECORDED",
      featureName: measurement.featureName,
      durationMs: measurement.durationMs,
      tokenCount: measurement.tokenCount,
      trustTier: "OBSERVED",
    },
  });

  state.overheadEvents.push(measurement);
}

/**
 * Check if overhead budget is exceeded and emit alert audit.
 */
export function gatewayOverheadBudgetCheck(
  appendEvidence: AppendEvidenceFn,
  opts: {
    featureName: string;
    durationMs: number;
    budgetMs: number;
    requestId: string;
    agentId: string;
  }
): boolean {
  recordActivation("gatewayOverheadBudget");

  if (opts.durationMs > opts.budgetMs) {
    appendEvidence({
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "OVERHEAD_COST_BUDGET_EXCEEDED",
        severity: "HIGH",
        featureName: opts.featureName,
        durationMs: opts.durationMs,
        budgetMs: opts.budgetMs,
        requestId: opts.requestId,
        agentId: opts.agentId,
      }),
      meta: {
        auditType: "OVERHEAD_COST_BUDGET_EXCEEDED",
        severity: "HIGH",
        trustTier: "OBSERVED",
      },
    });
    return false; // over budget
  }
  return true; // within budget
}

// ---------------------------------------------------------------------------
// 2. Bridge Data Residency Hook
// ---------------------------------------------------------------------------

/**
 * Validates data residency before forwarding a request through the bridge.
 * Returns whether the request is allowed to proceed.
 */
export function bridgeResidencyHook(
  appendEvidence: AppendEvidenceFn,
  opts: {
    requestRegion: string;
    allowedRegions: string[];
    agentId: string;
    requestId: string;
    policyId?: string;
  }
): ResidencyCheckResult {
  recordActivation("bridgeResidency");

  const allowed = opts.allowedRegions.includes(opts.requestRegion);
  const violations: string[] = [];

  if (!allowed) {
    violations.push(
      `Region ${opts.requestRegion} not in allowed regions [${opts.allowedRegions.join(", ")}]`
    );
  }

  const auditType = allowed
    ? "DATA_RESIDENCY_CONSTRAINT_APPLIED"
    : "DATA_RESIDENCY_VIOLATION_DETECTED";
  const severity = allowed ? "LOW" : "CRITICAL";

  appendEvidence({
    eventType: "audit",
    payload: JSON.stringify({
      auditType,
      severity,
      requestRegion: opts.requestRegion,
      allowedRegions: opts.allowedRegions,
      agentId: opts.agentId,
      requestId: opts.requestId,
      policyId: opts.policyId,
      violations,
    }),
    meta: {
      auditType,
      severity,
      trustTier: "OBSERVED",
    },
  });

  const result: ResidencyCheckResult = {
    allowed,
    region: opts.requestRegion,
    policyId: opts.policyId,
    violations,
  };
  state.residencyChecks.push(result);
  return result;
}

// ---------------------------------------------------------------------------
// 3. Diagnostic Operator UX Hook
// ---------------------------------------------------------------------------

/**
 * Enriches a diagnostic report with operator UX data.
 * Returns gate-compatible audit meta for diagnostic scoring.
 */
export function diagnosticOperatorHook(
  appendEvidence: AppendEvidenceFn,
  opts: {
    role: "operator" | "executive" | "auditor";
    agentId: string;
    reportId: string;
  }
): void {
  recordActivation("diagnosticOperator");

  appendEvidence({
    eventType: "audit",
    payload: JSON.stringify({
      auditType: "OPERATOR_CONTEXT_APPLIED",
      severity: "LOW",
      role: opts.role,
      agentId: opts.agentId,
      reportId: opts.reportId,
    }),
    meta: {
      auditType: "OPERATOR_CONTEXT_APPLIED",
      role: opts.role,
      trustTier: "OBSERVED",
    },
  });
}

// ---------------------------------------------------------------------------
// 4. Insider Risk Hook
// ---------------------------------------------------------------------------

/**
 * Captures governance-relevant events for insider risk analytics.
 * Bridges approval, tool usage, and policy change events to the
 * insider risk analysis pipeline.
 */
export function insiderRiskHook(
  appendEvidence: AppendEvidenceFn,
  capture: InsiderEventCapture
): void {
  recordActivation("insiderRisk");

  appendEvidence({
    eventType: "audit",
    payload: JSON.stringify({
      auditType: "INSIDER_RISK_SIGNAL_DETECTED",
      severity: "MEDIUM",
      actorId: capture.actorId,
      eventType: capture.eventType,
      action: capture.action,
      metadata: capture.metadata,
    }),
    meta: {
      auditType: "INSIDER_RISK_SIGNAL_DETECTED",
      actorId: capture.actorId,
      eventType: capture.eventType,
      trustTier: "OBSERVED",
    },
  });

  state.insiderCaptures.push(capture);
}

// ---------------------------------------------------------------------------
// 5. Lab Signal Bridge
// ---------------------------------------------------------------------------

/**
 * Bridges a lab experiment signal into the production audit trail.
 * Only signals with confidence >= threshold and PRODUCTION_SAFE boundary
 * are bridged. RESEARCH_ONLY signals are logged but not used for scoring.
 */
export function labSignalBridge(
  appendEvidence: AppendEvidenceFn,
  opts: {
    importId: string;
    signalName: string;
    signalValue: number;
    confidence: number;
    boundaryMarker: "RESEARCH_ONLY" | "PRODUCTION_SAFE";
    experimentId: string;
    confidenceThreshold?: number;
  }
): LabSignalBridgeResult {
  recordActivation("labSignal");

  const threshold = opts.confidenceThreshold ?? 0.8;
  const productionSafe = opts.boundaryMarker === "PRODUCTION_SAFE";
  const highConfidence = opts.confidence >= threshold;
  const bridged = productionSafe && highConfidence;

  const auditType = bridged
    ? "LAB_SIGNAL_IMPORTED"
    : opts.boundaryMarker === "RESEARCH_ONLY"
      ? "LAB_SIGNAL_RESEARCH_ONLY"
      : "LAB_SIGNAL_LOW_CONFIDENCE";

  appendEvidence({
    eventType: bridged ? "metric" : "audit",
    payload: JSON.stringify({
      auditType,
      severity: "LOW",
      importId: opts.importId,
      signalName: opts.signalName,
      signalValue: opts.signalValue,
      confidence: opts.confidence,
      boundaryMarker: opts.boundaryMarker,
      experimentId: opts.experimentId,
      bridged,
    }),
    meta: {
      auditType,
      signalName: opts.signalName,
      confidence: opts.confidence,
      bridged,
      trustTier: "OBSERVED",
    },
  });

  const result: LabSignalBridgeResult = {
    bridged,
    importId: opts.importId,
    auditType,
    confidence: opts.confidence,
  };
  state.labBridgeResults.push(result);
  return result;
}

// ---------------------------------------------------------------------------
// 6. FP Tracker Hook
// ---------------------------------------------------------------------------

/**
 * Records false positive events from assurance results into the audit trail.
 */
export function fpTrackerHook(
  appendEvidence: AppendEvidenceFn,
  opts: {
    scenarioId: string;
    packId: string;
    reportId: string;
    status: "open" | "confirmed" | "rejected";
  }
): void {
  recordActivation("fpTracker");

  const auditType =
    opts.status === "confirmed"
      ? "FALSE_POSITIVE_CONFIRMED"
      : opts.status === "rejected"
        ? "FALSE_POSITIVE_REJECTED"
        : "FALSE_POSITIVE_RECORDED";

  appendEvidence({
    eventType: "audit",
    payload: JSON.stringify({
      auditType,
      severity: opts.status === "confirmed" ? "MEDIUM" : "LOW",
      scenarioId: opts.scenarioId,
      packId: opts.packId,
      reportId: opts.reportId,
      status: opts.status,
    }),
    meta: {
      auditType,
      scenarioId: opts.scenarioId,
      packId: opts.packId,
      trustTier: "OBSERVED",
    },
  });

  state.fpEvents.push({ scenarioId: opts.scenarioId, packId: opts.packId, ts: Date.now() });
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Returns diagnostic information about wiring status for all modules.
 */
export function getWiringDiagnostics(): WiringDiagnostic[] {
  const modules: Array<{ name: string; hookKey: string; events: Array<{ ts?: number }> }> = [
    { name: "overheadAccounting", hookKey: "gatewayOverhead", events: state.overheadEvents },
    { name: "dataResidency", hookKey: "bridgeResidency", events: state.residencyChecks as Array<{ ts?: number }> },
    { name: "operatorUx", hookKey: "diagnosticOperator", events: [] },
    { name: "insiderRisk", hookKey: "insiderRisk", events: state.insiderCaptures },
    { name: "cognitionLab", hookKey: "labSignal", events: state.labBridgeResults as Array<{ ts?: number }> },
    { name: "fpTracker", hookKey: "fpTracker", events: state.fpEvents },
  ];

  return modules.map((m) => {
    const hookCount = state.hookActivations.get(m.hookKey) ?? 0;
    const eventCount = m.events.length;
    const lastTs = m.events.length > 0
      ? Math.max(...m.events.map((e) => e.ts ?? Date.now()))
      : 0;

    return {
      moduleName: m.name,
      wired: hookCount > 0,
      hookCount,
      lastEventTs: lastTs,
      eventCount,
    };
  });
}

/**
 * Get all overhead measurements recorded.
 */
export function getOverheadMeasurements(): OverheadMeasurement[] {
  return [...state.overheadEvents];
}

/**
 * Get all residency check results.
 */
export function getResidencyChecks(): ResidencyCheckResult[] {
  return [...state.residencyChecks];
}

/**
 * Get all insider risk captures.
 */
export function getInsiderCaptures(): InsiderEventCapture[] {
  return [...state.insiderCaptures];
}

/**
 * Get all lab signal bridge results.
 */
export function getLabBridgeResults(): LabSignalBridgeResult[] {
  return [...state.labBridgeResults];
}

/**
 * Render wiring diagnostics as markdown.
 */
export function renderWiringDiagnosticsMarkdown(): string {
  const diags = getWiringDiagnostics();
  const lines: string[] = [];
  lines.push("# Production Wiring Diagnostics");
  lines.push("");
  lines.push("| Module | Wired | Hook Count | Event Count |");
  lines.push("|--------|-------|------------|-------------|");
  for (const d of diags) {
    const status = d.wired ? "YES" : "NO";
    lines.push(`| ${d.moduleName} | ${status} | ${d.hookCount} | ${d.eventCount} |`);
  }
  lines.push("");

  const wiredCount = diags.filter((d) => d.wired).length;
  const totalHooks = diags.reduce((sum, d) => sum + d.hookCount, 0);
  lines.push(`**Modules wired:** ${wiredCount}/${diags.length}`);
  lines.push(`**Total hook activations:** ${totalHooks}`);

  return lines.join("\n");
}
