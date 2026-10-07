import type { Domain } from "../domains/domainRegistry.js";

export type IncidentSeverity = "INFO" | "WARN" | "CRITICAL";

export type IncidentState =
  | "OPEN"           // Just detected
  | "INVESTIGATING"  // Being analyzed
  | "MITIGATED"      // Temporary fix in place
  | "RESOLVED"       // Permanently fixed
  | "POSTMORTEM";    // Resolved + postmortem completed

export type CausalRelationship =
  | "CAUSED"     // A directly caused B
  | "ENABLED"    // A made B possible (necessary but not sufficient)
  | "BLOCKED"    // A prevented B from occurring
  | "MITIGATED"  // A reduced the impact of B
  | "FIXED"      // A resolved B
  | "CORRELATED"; // A and B co-occur but causality unknown

export interface CausalEdge {
  edgeId: string;              // uuid
  fromEventId: string;         // evidence event ID or incident ID
  toEventId: string;           // evidence event ID or incident ID
  relationship: CausalRelationship;
  confidence: number;          // 0.0-1.0 how certain the causal link is
  evidence: string[];          // evidence event IDs supporting this edge
  addedTs: number;
  addedBy: "AUTO" | "OWNER" | "AUDITOR";  // who created this link
  signature: string;
}

export interface Incident {
  incidentId: string;          // uuid
  agentId: string;
  severity: IncidentSeverity;
  state: IncidentState;
  title: string;               // human-readable summary
  description: string;         // detailed description
  triggerType: "DRIFT" | "ASSURANCE_FAILURE" | "FREEZE" | "BUDGET_EXCEEDED" | "GOVERNANCE_VIOLATION" | "MANUAL";
  triggerId: string;           // ID of triggering event (drift advisory ID, assurance run ID, etc.)
  rootCauseClaimIds: string[]; // claims identified as root causes
  affectedQuestionIds: string[]; // AMC question IDs affected
  causalEdges: CausalEdge[];   // the causal graph
  timelineEventIds: string[];  // ordered evidence event IDs
  createdTs: number;
  updatedTs: number;
  resolvedTs: number | null;
  postmortemRef: string | null; // path to postmortem artifact
  prev_incident_hash: string;  // hash chain
  incident_hash: string;       // SHA256 of canonical form
  signature: string;
}

export interface IncidentTransition {
  transitionId: string;
  incidentId: string;
  fromState: IncidentState;
  toState: IncidentState;
  reason: string;
  ts: number;
  signature: string;
}

export type IncidentClockEventKind = "TRIGGER" | "NOTIFIED";

/**
 * Append-only, signed record of a regulatory clock event (P1-17): a trigger
 * happened (`triggerOrClockId` is a ClockTrigger) or a notice was submitted
 * (`triggerOrClockId` is a clockId). `ts` is the operator's claim; `recordedTs`
 * and `recordedBy` say when and through which surface it was recorded.
 */
export interface IncidentClockEvent {
  eventId: string;
  incidentId: string;
  kind: IncidentClockEventKind;
  triggerOrClockId: string;
  station: Domain;
  ts: number;
  recordedTs: number;
  recordedBy: string;
  signature: string;
}

// Valid state transitions
export const VALID_INCIDENT_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  OPEN: ["INVESTIGATING", "MITIGATED", "RESOLVED"],
  INVESTIGATING: ["MITIGATED", "RESOLVED", "OPEN"],
  MITIGATED: ["RESOLVED", "INVESTIGATING", "OPEN"],
  RESOLVED: ["POSTMORTEM", "OPEN"],  // can reopen
  POSTMORTEM: [],  // terminal
};
