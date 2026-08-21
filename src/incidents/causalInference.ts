/**
 * Causal inference over incident timelines.
 *
 * SCOPE: this ranks candidate causes using keyword overlap and temporal
 * proximity. It does not establish causation, and its output should be read as
 * "worth investigating first", not "this caused the incident".
 */
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest } from "../crypto/keys.js";
import type { EvidenceEvent } from "../types.js";
import type { Incident, CausalEdge, CausalRelationship } from "./incidentTypes.js";

interface SignFn {
  (digest: string): string;
}

// Helper to create causal edge
function createCausalEdge(
  fromEventId: string,
  toEventId: string,
  relationship: CausalRelationship,
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

// Helper to parse meta_json safely
function parseMetaJson(metaJsonStr: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJsonStr) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Infer causal links from evidence events using heuristic rules
 */
export function inferCausalLinks(
  incident: Incident,
  evidenceEvents: EvidenceEvent[],
  windowMs: number = 24 * 60 * 60 * 1000, // Default: 24h
  signFn: SignFn = (digest) => "", // Default no-op signer for initial inference
  now: number = Date.now()
): CausalEdge[] {
  const edges: CausalEdge[] = [];

  if (evidenceEvents.length === 0) {
    return edges;
  }

  // Find the incident trigger event (if present in the evidence)
  const triggerEvent = evidenceEvents.find((e) => e.id === incident.triggerId);
  const windowStart = now - windowMs;

  // Filter events to window (before trigger time)
  const windowedEvents = evidenceEvents.filter(
    (e) =>
      e.ts >= windowStart &&
      (!triggerEvent || e.ts <= triggerEvent.ts)
  );

  // Collect all audit events for pattern matching
  const auditEvents = windowedEvents.filter((e) => e.event_type === "audit");

  // Rule 1: Config Change Before Failure
  for (const event of auditEvents) {
    const meta = parseMetaJson(event.meta_json);
    const auditType = meta.auditType as string | undefined;

    if (auditType === "CONFIG_UNSIGNED" || auditType === "CONFIG_SIGNATURE_INVALID") {
      if (triggerEvent && event.ts < triggerEvent.ts) {
        edges.push(
          createCausalEdge(event.id, incident.triggerId, "ENABLED", 0.7, [event.id], now, signFn)
        );
      }
    }
  }

  // Rule 2: Policy Violation Chain
  for (const event of auditEvents) {
    const meta = parseMetaJson(event.meta_json);
    const auditType = meta.auditType as string | undefined;

    if (auditType === "POLICY_VIOLATION") {
      if (
        incident.triggerType === "DRIFT" &&
        triggerEvent &&
        event.ts < triggerEvent.ts
      ) {
        edges.push(
          createCausalEdge(event.id, incident.triggerId, "CAUSED", 0.6, [event.id], now, signFn)
        );
      }
    }
  }

  // Rule 3: Budget Exhaustion Before Degradation
  for (const event of auditEvents) {
    const meta = parseMetaJson(event.meta_json);
    const auditType = meta.auditType as string | undefined;

    if (auditType === "BUDGET_EXCEEDED") {
      if (
        (incident.triggerType === "DRIFT" || incident.triggerType === "ASSURANCE_FAILURE") &&
        triggerEvent &&
        event.ts < triggerEvent.ts
      ) {
        edges.push(
          createCausalEdge(event.id, incident.triggerId, "CAUSED", 0.5, [event.id], now, signFn)
        );
      }
    }
  }

  // Rule 4: Assurance Failure Correlation
  if (incident.triggerType === "DRIFT" && incident.affectedQuestionIds.length > 0) {
    for (const event of auditEvents) {
      const meta = parseMetaJson(event.meta_json);
      const auditType = meta.auditType as string | undefined;

      if (auditType === "ASSURANCE_FAILURE") {
        // Check if affected questions overlap
        const failedQuestions = (meta.failedQuestions as string[]) || [];
        const hasOverlap = incident.affectedQuestionIds.some((q) => failedQuestions.includes(q));

        if (hasOverlap && triggerEvent && Math.abs(event.ts - triggerEvent.ts) < 60000) {
          // Within 1 minute
          edges.push(
            createCausalEdge(event.id, incident.triggerId, "CORRELATED", 0.4, [event.id], now, signFn)
          );
        }
      }
    }
  }

  // Rule 5: Freeze After Drift
  if (incident.triggerType === "DRIFT") {
    for (const event of auditEvents) {
      const meta = parseMetaJson(event.meta_json);
      const auditType = meta.auditType as string | undefined;

      if (auditType && auditType.startsWith("FREEZE_")) {
        if (triggerEvent && event.ts > triggerEvent.ts) {
          // Freeze event comes after drift trigger
          edges.push(
            createCausalEdge(incident.triggerId, event.id, "CAUSED", 0.9, [incident.triggerId], now, signFn)
          );
        }
      }
    }
  }

  // Rule 6: Fix After Mitigation
  for (const event of auditEvents) {
    const meta = parseMetaJson(event.meta_json);
    const auditType = meta.auditType as string | undefined;

    if (
      (auditType === "CONFIG_FIXED" || auditType === "POLICY_REMEDIATED" || auditType === "ASSURANCE_PASSED") &&
      triggerEvent &&
      event.ts > triggerEvent.ts
    ) {
      edges.push(
        createCausalEdge(event.id, incident.triggerId, "FIXED", 0.6, [event.id], now, signFn)
      );
    }
  }

  return edges;
}

/**
 * Rank and filter causal hypotheses by confidence
 */
export function rankCausalHypotheses(edges: CausalEdge[]): CausalEdge[] {
  // Filter out low confidence edges
  const filtered = edges.filter((edge) => edge.confidence >= 0.3);

  // Deduplicate edges with same from/to but keep highest confidence
  const deduped = new Map<string, CausalEdge>();
  for (const edge of filtered) {
    const key = `${edge.fromEventId}:${edge.toEventId}`;
    const existing = deduped.get(key);

    if (!existing || edge.confidence > existing.confidence) {
      deduped.set(key, edge);
    }
  }

  // Sort by confidence descending
  return Array.from(deduped.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Generate human-readable explanation of a causal link
 */
export function explainCausalLink(
  edge: CausalEdge,
  fromEvent: EvidenceEvent,
  toEvent: EvidenceEvent
): string {
  const fromMeta = parseMetaJson(fromEvent.meta_json);
  const toMeta = parseMetaJson(toEvent.meta_json);

  const fromAuditType = (fromMeta.auditType as string) || fromEvent.event_type;
  const toAuditType = (toMeta.auditType as string) || toEvent.event_type;

  const fromTime = new Date(fromEvent.ts).toISOString();
  const toTime = new Date(toEvent.ts).toISOString();
  const timeDiffSec = Math.round((toEvent.ts - fromEvent.ts) / 1000);

  const relationshipDescriptions: Record<typeof edge.relationship, string> = {
    CAUSED: "directly caused",
    ENABLED: "enabled (made possible)",
    BLOCKED: "prevented",
    MITIGATED: "reduced the impact of",
    FIXED: "resolved",
    CORRELATED: "correlates with"
  };

  const desc = relationshipDescriptions[edge.relationship];
  const confStr = (edge.confidence * 100).toFixed(1);

  return `${fromAuditType} at ${fromTime} ${desc} ${toAuditType} at ${toTime} (${timeDiffSec}s later). Confidence: ${confStr}%`;
}

/**
 * Batch explanation of all causal links in an incident
 */
export function explainIncidentCausality(
  incident: Incident,
  evidenceEvents: EvidenceEvent[]
): string {
  if (incident.causalEdges.length === 0) {
    return "No causal relationships identified.";
  }

  const eventMap = new Map(evidenceEvents.map((e) => [e.id, e]));
  const explanations: string[] = [];

  for (const edge of incident.causalEdges) {
    const fromEvent = eventMap.get(edge.fromEventId);
    const toEvent = eventMap.get(edge.toEventId);

    if (fromEvent && toEvent) {
      explanations.push(explainCausalLink(edge, fromEvent, toEvent));
    }
  }

  return explanations.join("\n");
}

/**
 * Identify root causes from incident causal graph
 */
export function identifyRootCauses(incident: Incident): string[] {
  if (incident.causalEdges.length === 0) {
    return [];
  }

  // Find events with no incoming CAUSED edges
  const hasIncomingCaused = new Set<string>();
  for (const edge of incident.causalEdges) {
    if (edge.relationship === "CAUSED") {
      hasIncomingCaused.add(edge.toEventId);
    }
  }

  const roots: string[] = [];
  const allFromEvents = new Set(incident.causalEdges.map((e) => e.fromEventId));

  for (const eventId of allFromEvents) {
    if (!hasIncomingCaused.has(eventId)) {
      roots.push(eventId);
    }
  }

  return roots.sort();
}

/**
 * Trace impact chain from a root cause
 */
export function traceImpactChain(incident: Incident, startEventId: string): string[] {
  const visited = new Set<string>();
  const queue = [startEventId];
  const chain: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    chain.push(current);

    // Find all downstream events via CAUSED edges
    for (const edge of incident.causalEdges) {
      if (edge.fromEventId === current && edge.relationship === "CAUSED" && !visited.has(edge.toEventId)) {
        queue.push(edge.toEventId);
      }
    }
  }

  return chain;
}
