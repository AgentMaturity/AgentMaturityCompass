import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest } from "../crypto/keys.js";
import type { EvidenceEvent, AssuranceReport } from "../types.js";
import type { Incident, CausalEdge } from "./incidentTypes.js";
import { computeIncidentHash } from "./incidentStore.js";

interface SignFn {
  (digest: string): string;
}

interface DriftAdvisory {
  metric: string;
  baseline: number;
  latest: number;
  delta: number;
  severity: "WARN" | "CRITICAL";
  evidenceRefs: string[];
  /** The id autoDetectAndAssemble deduplicates on; defaults to the first evidence ref. */
  triggerId?: string;
}

interface FreezeIncidentData {
  incidentId: string;
  deltas: {
    overallDrop: number;
    integrityDrop: number;
    correlationDrop: number;
    maxLayerDrop: number;
  };
  frozenActionClasses: string[];
}

// Helper to create incident ID
function createIncidentId(): string {
  return `incident_${randomUUID().replace(/-/g, "")}`;
}

// Helper to create causal edge
function createCausalEdge(
  fromEventId: string,
  toEventId: string,
  relationship: "CAUSED" | "ENABLED" | "BLOCKED" | "MITIGATED" | "FIXED" | "CORRELATED",
  confidence: number,
  evidence: string[],
  now: number,
  signFn: SignFn
): CausalEdge {
  const edge: CausalEdge = {
    edgeId: `edge_${randomUUID().replace(/-/g, "")}`,
    fromEventId,
    toEventId,
    relationship,
    confidence: Math.max(0, Math.min(1, confidence)),
    evidence,
    addedTs: now,
    addedBy: "AUTO",
    signature: ""
  };

  const digest = sha256Hex(
    canonicalize({
      edge_id: edge.edgeId,
      from_event_id: edge.fromEventId,
      to_event_id: edge.toEventId,
      relationship: edge.relationship,
      confidence: edge.confidence,
      evidence: edge.evidence,
      added_ts: edge.addedTs,
      added_by: edge.addedBy
    })
  );

  edge.signature = signFn(digest);
  return edge;
}

/** Signs the payload verifyIncidentSignature checks: every field but the signature itself. */
function signIncident(incident: Incident, signFn: SignFn): string {
  const { signature: _unsigned, ...payload } = incident;
  return signFn(sha256Hex(canonicalize(payload)));
}

// Helper to parse meta_json safely
function parseMetaJson(metaJsonStr: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJsonStr) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Helper to get previous incident hash
function getLastIncidentHash(db: Database.Database, agentId: string): string {
  const row = db
    .prepare("SELECT incident_hash FROM incidents WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(agentId) as { incident_hash: string } | undefined;
  return row?.incident_hash ?? "GENESIS_INCIDENT";
}

// Helper to check if open incident exists for triggerId
function openIncidentExistsForTriggerId(db: Database.Database, agentId: string, triggerId: string): boolean {
  const row = db
    .prepare(
      "SELECT 1 FROM incidents WHERE agent_id = ? AND trigger_id = ? AND state IN ('OPEN', 'INVESTIGATING', 'MITIGATED') LIMIT 1"
    )
    .get(agentId, triggerId);
  return !!row;
}

/**
 * Assemble an incident from a drift advisory
 */
export function assembleFromDrift(
  db: Database.Database,
  agentId: string,
  driftAdvisory: DriftAdvisory,
  recentEvents: EvidenceEvent[],
  signFn: SignFn,
  now: number = Date.now()
): Incident {
  const incidentId = createIncidentId();
  const severity = driftAdvisory.severity === "CRITICAL" ? "CRITICAL" : "WARN";

  // Build timeline and scan for causal links
  const timelineEventIds: string[] = [];
  const causalEdges: CausalEdge[] = [];
  const affectedQuestionIds: string[] = [];

  // Sort events by timestamp
  const sortedEvents = [...recentEvents].sort((a, b) => a.ts - b.ts);

  for (const event of sortedEvents) {
    if (event.event_type === "audit") {
      timelineEventIds.push(event.id);

      const meta = parseMetaJson(event.meta_json);
      const auditType = meta.auditType as string | undefined;

      // Rule 1: Config unsigned/invalid enables drift
      if (auditType === "CONFIG_UNSIGNED" || auditType === "CONFIG_SIGNATURE_INVALID") {
        const triggerEventId = driftAdvisory.evidenceRefs[0] || "drift_trigger";
        causalEdges.push(
          createCausalEdge(event.id, triggerEventId, "ENABLED", 0.7, [event.id], now, signFn)
        );
      }

      // Rule 2: Policy violation causes drift
      if (auditType === "POLICY_VIOLATION") {
        const triggerEventId = driftAdvisory.evidenceRefs[0] || "drift_trigger";
        causalEdges.push(
          createCausalEdge(event.id, triggerEventId, "CAUSED", 0.6, [event.id], now, signFn)
        );
      }

      // Rule 3: Budget exceeded correlates with drift
      if (auditType === "BUDGET_EXCEEDED") {
        const triggerEventId = driftAdvisory.evidenceRefs[0] || "drift_trigger";
        causalEdges.push(
          createCausalEdge(event.id, triggerEventId, "CORRELATED", 0.5, [event.id], now, signFn)
        );
      }
    }
  }

  // Extract affected questions from drift metric context
  // Metric names often encode question info (e.g., "amc-2.5-truthfulness")
  const metricParts = driftAdvisory.metric.split("-");
  if (metricParts.length >= 2 && metricParts[0] === "amc") {
    affectedQuestionIds.push(driftAdvisory.metric);
  }

  const title = `Drift Detected: ${driftAdvisory.metric}`;
  const description = `Metric '${driftAdvisory.metric}' drifted from baseline ${driftAdvisory.baseline} to ${driftAdvisory.latest} (delta: ${driftAdvisory.delta})`;

  const incident: Incident = {
    incidentId,
    agentId,
    severity,
    state: "OPEN",
    title,
    description,
    triggerType: "DRIFT",
    triggerId: driftAdvisory.triggerId ?? (driftAdvisory.evidenceRefs[0] || incidentId),
    rootCauseClaimIds: [],
    affectedQuestionIds,
    causalEdges,
    timelineEventIds,
    createdTs: now,
    updatedTs: now,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: getLastIncidentHash(db, agentId),
    incident_hash: "",
    signature: ""
  };

  // Compute hash and signature
  incident.incident_hash = computeIncidentHash(incident);
  incident.signature = signIncident(incident, signFn);

  return incident;
}

/**
 * Assemble an incident from an assurance failure
 */
export function assembleFromAssuranceFailure(
  db: Database.Database,
  agentId: string,
  assuranceReport: AssuranceReport,
  recentEvents: EvidenceEvent[],
  signFn: SignFn,
  now: number = Date.now()
): Incident | null {
  // Check if assurance passed
  if (assuranceReport.overallScore0to100 >= 60) {
    // Check if all packs passed
    const allPacksPassed = assuranceReport.packResults.every((pack) => pack.failCount === 0);
    if (allPacksPassed) {
      return null; // No incident needed
    }
  }

  const incidentId = createIncidentId();
  const severity: "INFO" | "WARN" | "CRITICAL" =
    assuranceReport.overallScore0to100 < 40 ? "CRITICAL" : assuranceReport.overallScore0to100 < 60 ? "WARN" : "INFO";

  // Build timeline and scan for causal links
  const timelineEventIds: string[] = [];
  const causalEdges: CausalEdge[] = [];
  const affectedQuestionIds: string[] = [];

  // Sort events by timestamp
  const sortedEvents = [...recentEvents].sort((a, b) => a.ts - b.ts);

  // Scan for config changes before failure window
  for (const event of sortedEvents) {
    if (event.event_type === "audit" && event.ts < assuranceReport.ts) {
      timelineEventIds.push(event.id);

      const meta = parseMetaJson(event.meta_json);
      const auditType = meta.auditType as string | undefined;

      // Config changes enable assurance failures
      if (auditType === "CONFIG_UNSIGNED" || auditType === "CONFIG_SIGNATURE_INVALID") {
        causalEdges.push(
          createCausalEdge(event.id, assuranceReport.assuranceRunId, "ENABLED", 0.7, [event.id], now, signFn)
        );
      }
    }
  }

  // Map failed packs to affected question IDs
  for (const pack of assuranceReport.packResults) {
    if (pack.failCount > 0) {
      const packLower = pack.packId.toLowerCase();
      if (packLower.includes("injection")) {
        affectedQuestionIds.push("AMC-3.3.1"); // Safety guardrails
      } else if (packLower.includes("exfiltration")) {
        affectedQuestionIds.push("AMC-3.3.2"); // Data protection
      } else if (packLower.includes("hallucination")) {
        affectedQuestionIds.push("AMC-2.5"); // Honesty/truthfulness
      } else if (packLower.includes("unsafe") || packLower.includes("tooling")) {
        affectedQuestionIds.push("AMC-3.4"); // Tool safety
      } else if (packLower.includes("governance")) {
        affectedQuestionIds.push("AMC-1.8"); // Governance
      }
    }
  }

  const failedPackIds = assuranceReport.packResults.filter((p) => p.failCount > 0).map((p) => p.packId);
  const title = `Assurance Failure: ${failedPackIds.join(", ")}`;
  const description = `Assurance run ${assuranceReport.assuranceRunId} failed with overall score ${assuranceReport.overallScore0to100.toFixed(2)}. Failed packs: ${failedPackIds.join(", ")}`;

  const incident: Incident = {
    incidentId,
    agentId,
    severity,
    state: "OPEN",
    title,
    description,
    triggerType: "ASSURANCE_FAILURE",
    triggerId: assuranceReport.assuranceRunId,
    rootCauseClaimIds: [],
    affectedQuestionIds: Array.from(new Set(affectedQuestionIds)), // Deduplicate
    causalEdges,
    timelineEventIds,
    createdTs: now,
    updatedTs: now,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: getLastIncidentHash(db, agentId),
    incident_hash: "",
    signature: ""
  };

  // Compute hash and signature
  incident.incident_hash = computeIncidentHash(incident);
  incident.signature = signIncident(incident, signFn);

  return incident;
}

/**
 * Assemble an incident from a freeze event
 */
export function assembleFromFreeze(
  db: Database.Database,
  agentId: string,
  freezeIncidentId: string,
  freezeDeltas: FreezeIncidentData["deltas"],
  recentEvents: EvidenceEvent[],
  signFn: SignFn,
  now: number = Date.now()
): Incident {
  const incidentId = createIncidentId();

  // Build timeline and scan for causal links
  const timelineEventIds: string[] = [];
  const causalEdges: CausalEdge[] = [];

  // Sort events by timestamp
  const sortedEvents = [...recentEvents].sort((a, b) => a.ts - b.ts);

  // Look for drift regression that triggered the freeze
  for (const event of sortedEvents) {
    if (event.event_type === "audit") {
      timelineEventIds.push(event.id);

      const meta = parseMetaJson(event.meta_json);
      const auditType = meta.auditType as string | undefined;

      // Freeze after drift regression with high confidence
      if (auditType === "DRIFT_REGRESSION_DETECTED") {
        causalEdges.push(
          createCausalEdge(event.id, freezeIncidentId, "CAUSED", 0.9, [event.id], now, signFn)
        );
      }
    }
  }

  const title = `Action Freeze Activated`;
  const description = `Freeze activated with overall drop ${freezeDeltas.overallDrop.toFixed(2)}, integrity drop ${freezeDeltas.integrityDrop.toFixed(2)}`;

  const incident: Incident = {
    incidentId,
    agentId,
    severity: "CRITICAL",
    state: "OPEN",
    title,
    description,
    triggerType: "FREEZE",
    triggerId: freezeIncidentId,
    rootCauseClaimIds: [],
    affectedQuestionIds: [], // Will be filled by causal inference
    causalEdges,
    timelineEventIds,
    createdTs: now,
    updatedTs: now,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: getLastIncidentHash(db, agentId),
    incident_hash: "",
    signature: ""
  };

  // Compute hash and signature
  incident.incident_hash = computeIncidentHash(incident);
  incident.signature = signIncident(incident, signFn);

  return incident;
}

/**
 * Assemble an incident from a budget exceeded audit
 */
export function assembleFromBudgetExceed(
  db: Database.Database,
  agentId: string,
  budgetAuditEvent: EvidenceEvent,
  recentEvents: EvidenceEvent[],
  signFn: SignFn,
  now: number = Date.now()
): Incident {
  const incidentId = createIncidentId();

  // Build timeline and scan for causal links
  const timelineEventIds: string[] = [budgetAuditEvent.id];
  const causalEdges: CausalEdge[] = [];

  // Sort events by timestamp
  const sortedEvents = [...recentEvents].sort((a, b) => a.ts - b.ts);

  // Look for high usage patterns that led to budget exceeded
  for (const event of sortedEvents) {
    if (event.event_type === "metric" && event.ts < budgetAuditEvent.ts) {
      timelineEventIds.push(event.id);

      const meta = parseMetaJson(event.meta_json);
      const metricName = meta.metricName as string | undefined;

      // High token/request usage causes budget exceeded
      if (metricName && (metricName.includes("token_count") || metricName.includes("request_count"))) {
        causalEdges.push(
          createCausalEdge(event.id, budgetAuditEvent.id, "CAUSED", 0.5, [event.id], now, signFn)
        );
      }
    }
  }

  const meta = parseMetaJson(budgetAuditEvent.meta_json);
  const budgetType = (meta.budgetType as string) || "unknown";

  const title = `Budget Exceeded: ${budgetType}`;
  const description = `Budget limit exceeded for ${budgetType}`;

  const incident: Incident = {
    incidentId,
    agentId,
    severity: "WARN",
    state: "OPEN",
    title,
    description,
    triggerType: "BUDGET_EXCEEDED",
    triggerId: budgetAuditEvent.id,
    rootCauseClaimIds: [],
    affectedQuestionIds: [],
    causalEdges,
    timelineEventIds,
    createdTs: now,
    updatedTs: now,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: getLastIncidentHash(db, agentId),
    incident_hash: "",
    signature: ""
  };

  // Compute hash and signature
  incident.incident_hash = computeIncidentHash(incident);
  incident.signature = signIncident(incident, signFn);

  return incident;
}

/**
 * P2-26 detectors: audit events that open a governance incident, one per trigger id. Each returns the trigger id, or
 * null when the event is not one it detects. The incidents table's trigger_type CHECK predates these, so they share
 * GOVERNANCE_VIOLATION and the title names the detector.
 */
const GOVERNANCE_DETECTORS: Readonly<Record<string, { title: string; severity: Incident["severity"]; triggerId: (meta: Record<string, unknown>, event: EvidenceEvent) => string | null }>> = {
  // P1-03: a consequential (journaled) action whose outcome AMC could not observe.
  ACTION_STATE: { title: "Action outcome unknown", severity: "CRITICAL",
    triggerId: (meta) => meta.state === "outcome_unknown" && typeof meta.executionId === "string" ? `outcome_unknown:${meta.executionId}` : null },
  // P2-01: an export or egress refused by the residency registry.
  RESIDENCY_ROUTE_BLOCKED: { title: "Residency route blocked", severity: "WARN", triggerId: (_meta, event) => `residency:${event.id}` },
  // P2-24: an action taken under break-glass; one incident per break-glass record.
  BREAK_GLASS_ACTION: { title: "Break-glass used", severity: "CRITICAL",
    triggerId: (meta) => typeof meta.breakGlassId === "string" ? `break_glass:${meta.breakGlassId}` : null }
};

/** Whether autoDetectAndAssemble reads this audit type at all; lets the ledger hook skip every other row cheaply. */
export function isDetectedAuditType(auditType: unknown): boolean {
  return typeof auditType === "string" && (auditType in GOVERNANCE_DETECTORS || auditType.startsWith("FREEZE_")
    || ["DRIFT_REGRESSION_DETECTED", "ASSURANCE_FAILURE", "BUDGET_EXCEEDED"].includes(auditType));
}

function assembleGovernanceIncident(
  db: Database.Database, agentId: string, event: EvidenceEvent, auditType: string, triggerId: string, signFn: SignFn, now: number
): Incident {
  const detector = GOVERNANCE_DETECTORS[auditType]!;
  const incident: Incident = {
    incidentId: createIncidentId(), agentId, severity: detector.severity, state: "OPEN", title: `${detector.title} (${auditType})`,
    description: `Opened by the ${auditType} detector from audit event ${event.id}.`, triggerType: "GOVERNANCE_VIOLATION", triggerId,
    rootCauseClaimIds: [], affectedQuestionIds: [], causalEdges: [], timelineEventIds: [event.id],
    createdTs: now, updatedTs: now, resolvedTs: null, postmortemRef: null,
    prev_incident_hash: getLastIncidentHash(db, agentId), incident_hash: "", signature: ""
  };
  incident.incident_hash = computeIncidentHash(incident);
  incident.signature = signIncident(incident, signFn);
  return incident;
}

/**
 * Main entry point: auto-detect and assemble incidents from new evidence events
 */
export function autoDetectAndAssemble(
  db: Database.Database,
  agentId: string,
  newEvents: EvidenceEvent[],
  signFn: SignFn,
  now: number = Date.now()
): Incident[] {
  const incidents: Incident[] = [];

  // Scan for trigger conditions
  for (const event of newEvents) {
    if (event.event_type !== "audit") {
      continue;
    }

    const meta = parseMetaJson(event.meta_json);
    const auditType = meta.auditType as string | undefined;

    if (!auditType) {
      continue;
    }

    // Check for drift regression
    if (auditType === "DRIFT_REGRESSION_DETECTED") {
      const triggerId = meta.driftAdvisoryId as string | undefined || event.id;

      // Deduplicate: don't create if open incident exists
      if (!openIncidentExistsForTriggerId(db, agentId, triggerId)) {
        const driftAdvisory: DriftAdvisory = {
          metric: (meta.metric as string) || "unknown",
          baseline: (meta.baseline as number) || 0,
          latest: (meta.latest as number) || 0,
          delta: (meta.delta as number) || 0,
          severity: (meta.severity as "WARN" | "CRITICAL") || "WARN",
          evidenceRefs: [event.id],
          triggerId
        };

        const incident = assembleFromDrift(db, agentId, driftAdvisory, newEvents, signFn, now);
        incidents.push(incident);
      }
    }

    // Check for assurance failure
    if (auditType === "ASSURANCE_FAILURE") {
      const assuranceRunId = meta.assuranceRunId as string | undefined || event.id;

      // Deduplicate: don't create if open incident exists
      if (!openIncidentExistsForTriggerId(db, agentId, assuranceRunId)) {
        const assuranceReport: AssuranceReport = {
          assuranceRunId,
          agentId,
          ts: event.ts,
          mode: (meta.mode as "supervise" | "sandbox") || "supervise",
          windowStartTs: (meta.windowStartTs as number) || event.ts,
          windowEndTs: (meta.windowEndTs as number) || event.ts,
          trustTier: "OBSERVED",
          status: "VALID",
          verificationPassed: false,
          packResults: [],
          overallScore0to100: (meta.overallScore as number) || 0,
          integrityIndex: (meta.integrityIndex as number) || 0,
          trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS",
          reportJsonSha256: "",
          runSealSig: ""
        };

        const incident = assembleFromAssuranceFailure(db, agentId, assuranceReport, newEvents, signFn, now);
        if (incident) {
          incidents.push(incident);
        }
      }
    }

    // Check for freeze activation
    if (auditType && auditType.startsWith("FREEZE_")) {
      const freezeIncidentId = event.id;

      // Deduplicate: don't create if open incident exists
      if (!openIncidentExistsForTriggerId(db, agentId, freezeIncidentId)) {
        const freezeDeltas = {
          overallDrop: (meta.overallDrop as number) || 0,
          integrityDrop: (meta.integrityDrop as number) || 0,
          correlationDrop: (meta.correlationDrop as number) || 0,
          maxLayerDrop: (meta.maxLayerDrop as number) || 0
        };

        const incident = assembleFromFreeze(db, agentId, freezeIncidentId, freezeDeltas, newEvents, signFn, now);
        incidents.push(incident);
      }
    }

    const governance = GOVERNANCE_DETECTORS[auditType];
    const governanceTriggerId = governance ? governance.triggerId(meta, event) : null;
    if (governanceTriggerId !== null && !openIncidentExistsForTriggerId(db, agentId, governanceTriggerId)
      && !incidents.some((incident) => incident.triggerId === governanceTriggerId)) {
      incidents.push(assembleGovernanceIncident(db, agentId, event, auditType, governanceTriggerId, signFn, now));
    }

    // Check for budget exceeded
    if (auditType === "BUDGET_EXCEEDED") {
      const triggerId = event.id;

      // Deduplicate: don't create if open incident exists
      if (!openIncidentExistsForTriggerId(db, agentId, triggerId)) {
        const incident = assembleFromBudgetExceed(db, agentId, event, newEvents, signFn, now);
        incidents.push(incident);
      }
    }
  }

  return incidents;
}
