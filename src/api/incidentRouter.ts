/**
 * incidentRouter.ts — Incident API routes.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";
import { createIncidentStore, computeIncidentHash } from "../incidents/incidentStore.js";
import type { Incident, IncidentSeverity, IncidentState } from "../incidents/incidentTypes.js";
import { openLedger } from "../ledger/ledger.js";
import { queueIncidentLog } from "../observability/otelExporter.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { RequestBodyError, apiError, apiSuccess, bodyJsonSchema, isRequestBodyError, pathParam, queryParam } from "./apiHelpers.js";

const CLOSED_INCIDENT_STATES = new Set<IncidentState>(["RESOLVED", "POSTMORTEM"]);
const VALID_INCIDENT_STATES = new Set<IncidentState>(["OPEN", "INVESTIGATING", "MITIGATED", "RESOLVED", "POSTMORTEM"]);
const VALID_TRIGGER_TYPES = new Set<Incident["triggerType"]>([
  "DRIFT",
  "ASSURANCE_FAILURE",
  "FREEZE",
  "BUDGET_EXCEEDED",
  "GOVERNANCE_VIOLATION",
  "MANUAL"
]);

const incidentTriggerTypeSchema = z.enum([
  "DRIFT",
  "ASSURANCE_FAILURE",
  "FREEZE",
  "BUDGET_EXCEEDED",
  "GOVERNANCE_VIOLATION",
  "MANUAL"
]);

const createIncidentBodySchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  severity: z.string().trim().min(1),
  triggerType: incidentTriggerTypeSchema.optional(),
  triggerId: z.string().trim().min(1).optional()
}).strict();

const patchIncidentBodySchema = z.object({
  state: z.string().trim().min(1).optional(),
  resolution: z.string().trim().min(1).optional(),
  evidenceId: z.string().trim().min(1).optional()
}).strict();

function parseSeverity(value: string): IncidentSeverity {
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "info") {
    return "INFO";
  }
  if (normalized === "medium" || normalized === "warn") {
    return "WARN";
  }
  if (normalized === "high" || normalized === "critical") {
    return "CRITICAL";
  }
  throw new RequestBodyError("severity must be low|medium|high|critical");
}

function parseIncidentState(value: string): IncidentState {
  const normalized = value.trim().toUpperCase();
  if (normalized === "CLOSED") {
    return "RESOLVED";
  }
  if (!VALID_INCIDENT_STATES.has(normalized as IncidentState)) {
    throw new RequestBodyError("state must be OPEN|INVESTIGATING|MITIGATED|RESOLVED|POSTMORTEM");
  }
  return normalized as IncidentState;
}

function deriveIncidentState(
  store: ReturnType<typeof createIncidentStore>,
  incident: { incidentId: string; state: IncidentState }
): IncidentState {
  const transitions = store.getIncidentTransitions(incident.incidentId);
  if (transitions.length === 0) {
    return incident.state;
  }
  return transitions[transitions.length - 1]!.toState;
}

function currentAgentFromReqUrl(req: IncomingMessage): string {
  return queryParam(req.url ?? "", "agent") ?? process.env.AMC_AGENT_ID ?? "default";
}

export async function handleIncidentRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (pathname === "/api/v1/incidents" && method === "GET") {
    const statusParam = queryParam(req.url ?? "", "status")?.toLowerCase();
    if (statusParam && statusParam !== "open" && statusParam !== "closed") {
      apiError(res, 400, "status must be open|closed");
      return true;
    }

    const limitParam = queryParam(req.url ?? "", "limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
    if (!Number.isFinite(limit) || limit <= 0) {
      apiError(res, 400, "limit must be a positive integer");
      return true;
    }

    const ledger = openLedger(process.cwd());
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();
      const agentId = currentAgentFromReqUrl(req);
      const incidents = store
        .getIncidentsByAgent(agentId)
        .map((row) => ({ ...row, state: deriveIncidentState(store, row) }))
        .filter((row) => {
          if (!statusParam) {
            return true;
          }
          const isClosed = CLOSED_INCIDENT_STATES.has(row.state);
          return statusParam === "closed" ? isClosed : !isClosed;
        })
        .slice(0, Math.min(limit, 500));
      apiSuccess(res, { agentId, count: incidents.length, incidents });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Internal error");
    } finally {
      ledger.close();
    }
    return true;
  }

  if (pathname === "/api/v1/incidents" && method === "POST") {
    try {
      const body = await bodyJsonSchema(req, createIncidentBodySchema);

      const severity = parseSeverity(body.severity);
      const agentId = body.agentId ?? currentAgentFromReqUrl(req);
      const triggerType = body.triggerType ?? "MANUAL";
      if (!VALID_TRIGGER_TYPES.has(triggerType)) {
        apiError(res, 400, "triggerType must be DRIFT|ASSURANCE_FAILURE|FREEZE|BUDGET_EXCEEDED|GOVERNANCE_VIOLATION|MANUAL");
        return true;
      }

      const now = Date.now();
      const workspace = process.cwd();
      const ledger = openLedger(workspace);
      try {
        const store = createIncidentStore(ledger.db);
        store.initTables();
        const incidentId = `incident_${randomUUID().replace(/-/g, "")}`;
        const incidentBase = {
          incidentId,
          agentId,
          severity,
          state: "OPEN" as const,
          title: body.title,
          description: body.description ?? body.title,
          triggerType,
          triggerId: body.triggerId ?? `manual_${incidentId}`,
          rootCauseClaimIds: [] as string[],
          affectedQuestionIds: [] as string[],
          causalEdges: [] as Incident["causalEdges"],
          timelineEventIds: [] as string[],
          createdTs: now,
          updatedTs: now,
          resolvedTs: null as number | null,
          postmortemRef: null as string | null,
          prev_incident_hash: store.getLastIncidentHash(agentId)
        };
        const incidentHash = computeIncidentHash(incidentBase);
        const digest = sha256Hex(canonicalize({ ...incidentBase, incident_hash: incidentHash }));
        const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "monitor"));
        const incident: Incident = {
          ...incidentBase,
          incident_hash: incidentHash,
          signature
        };
        store.insertIncident(incident);
        queueIncidentLog(incident);
        apiSuccess(res, incident, 201);
      } finally {
        ledger.close();
      }
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : "Internal error");
    }
    return true;
  }

  const incidentParams = pathParam(pathname, "/api/v1/incidents/:id");
  if (incidentParams && method === "GET") {
    const incidentId = incidentParams.id;
    if (!incidentId) {
      apiError(res, 400, "Missing incident id");
      return true;
    }
    const ledger = openLedger(process.cwd());
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();
      const incident = store.getIncident(incidentId);
      if (!incident) {
        apiError(res, 404, "Incident not found");
        return true;
      }
      const transitions = store.getIncidentTransitions(incidentId);
      const causalEdges = store.getCausalEdges(incidentId);
      const state = transitions.length > 0 ? transitions[transitions.length - 1]!.toState : incident.state;
      apiSuccess(res, {
        ...incident,
        state,
        transitions,
        causalEdges
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : "Internal error");
    } finally {
      ledger.close();
    }
    return true;
  }

  if (incidentParams && method === "PATCH") {
    const incidentId = incidentParams.id;
    if (!incidentId) {
      apiError(res, 400, "Missing incident id");
      return true;
    }
    try {
      const body = await bodyJsonSchema(req, patchIncidentBodySchema);
      const workspace = process.cwd();
      const ledger = openLedger(workspace);
      try {
        const store = createIncidentStore(ledger.db);
        store.initTables();
        const incident = store.getIncident(incidentId);
        if (!incident) {
          apiError(res, 404, "Incident not found");
          return true;
        }

        let changed = false;
        if (body.evidenceId && body.evidenceId.trim().length > 0) {
          const edgeId = `edge_${randomUUID().replace(/-/g, "")}`;
          const now = Date.now();
          const edgeDigest = sha256Hex(
            canonicalize({
              edge_id: edgeId,
              from_event_id: body.evidenceId,
              to_event_id: incidentId,
              relationship: "CAUSED",
              confidence: 0.9,
              evidence: [body.evidenceId],
              added_ts: now,
              added_by: "OWNER"
            })
          );
          store.insertCausalEdge(incidentId, {
            edgeId,
            fromEventId: body.evidenceId,
            toEventId: incidentId,
            relationship: "CAUSED",
            confidence: 0.9,
            evidence: [body.evidenceId],
            addedTs: now,
            addedBy: "OWNER",
            signature: signHexDigest(edgeDigest, getPrivateKeyPem(workspace, "monitor"))
          });
          changed = true;
        }

        if (body.state || body.resolution) {
          const fromState = deriveIncidentState(store, incident);
          const targetState = body.state ? parseIncidentState(body.state) : "RESOLVED";
          if (targetState !== fromState) {
            const ts = Date.now();
            const transitionId = `itr_${randomUUID().replace(/-/g, "")}`;
            const transitionDigest = sha256Hex(
              canonicalize({
                transition_id: transitionId,
                incident_id: incidentId,
                from_state: fromState,
                to_state: targetState,
                reason: body.resolution ?? `state change to ${targetState}`,
                ts
              })
            );
            store.insertIncidentTransition({
              transitionId,
              incidentId,
              fromState,
              toState: targetState,
              reason: body.resolution ?? `state change to ${targetState}`,
              ts,
              signature: signHexDigest(transitionDigest, getPrivateKeyPem(workspace, "monitor"))
            });
            changed = true;
          }
        }

        if (!changed) {
          apiError(res, 400, "No patch operations requested (supported: state, resolution, evidenceId)");
          return true;
        }

        const transitions = store.getIncidentTransitions(incidentId);
        const causalEdges = store.getCausalEdges(incidentId);
        const state = transitions.length > 0 ? transitions[transitions.length - 1]!.toState : incident.state;
        queueIncidentLog({
          incidentId,
          agentId: incident.agentId,
          severity: incident.severity,
          state,
          title: incident.title,
          description: body.resolution ?? incident.description,
          triggerType: incident.triggerType,
          triggerId: incident.triggerId,
          ts: Date.now()
        });
        apiSuccess(res, {
          incidentId,
          state,
          transitions,
          causalEdges
        });
      } finally {
        ledger.close();
      }
    } catch (err) {
      if (isRequestBodyError(err)) {
        apiError(res, err.statusCode, err.message);
        return true;
      }
      apiError(res, 500, err instanceof Error ? err.message : "Internal error");
    }
    return true;
  }

  return false;
}
