/**
 * incidentRouter.ts — Incident API routes backed by SQLite incident store.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { bodyJson, apiSuccess, apiError, pathParam, queryParam } from './apiHelpers.js';
import { openLedger } from '../ledger/ledger.js';
import { createIncidentStore, computeIncidentHash } from '../incidents/incidentStore.js';
import type { Incident, IncidentSeverity, IncidentState } from '../incidents/incidentTypes.js';
import { signHexDigest, getPrivateKeyPem } from '../crypto/keys.js';
import { sha256Hex } from '../utils/hash.js';
import { canonicalize } from '../utils/json.js';

function normalizeSeverity(raw: string | undefined): IncidentSeverity {
  if (!raw) return 'WARN';
  const upper = raw.toUpperCase();
  if (upper === 'INFO' || upper === 'LOW') return 'INFO';
  if (upper === 'WARN' || upper === 'MEDIUM') return 'WARN';
  if (upper === 'CRITICAL' || upper === 'HIGH') return 'CRITICAL';
  return 'WARN';
}

export async function handleIncidentRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  workspace = process.cwd(),
): Promise<boolean> {
  if (!pathname.startsWith('/api/v1/incidents')) return false;

  // GET /api/v1/incidents — list incidents
  if (pathname === '/api/v1/incidents' && method === 'GET') {
    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();

      const agentId = queryParam(req.url ?? '', 'agent') ?? 'default';
      const status = queryParam(req.url ?? '', 'status');
      const limit = parseInt(queryParam(req.url ?? '', 'limit') ?? '50', 10);

      // Always fetch all incidents for this agent, then resolve latest state from transitions
      const incidents = store.getIncidentsByAgent(agentId);
      const incidentIds = incidents.map(i => i.incidentId);
      const latestStates = store.getLatestIncidentStates(incidentIds);

      let mapped = incidents.map(i => {
        const currentState = latestStates.get(i.incidentId) ?? i.state;
        return {
          incidentId: i.incidentId,
          agentId: i.agentId,
          severity: i.severity,
          state: currentState,
          title: i.title,
          createdTs: i.createdTs,
        };
      });

      // Apply status filter on resolved state
      if (status === 'closed') {
        mapped = mapped.filter(i => i.state === 'RESOLVED');
      } else if (status === 'open') {
        mapped = mapped.filter(i => i.state === 'OPEN');
      }

      const limited = mapped.slice(0, limit);
      apiSuccess(res, { count: limited.length, incidents: limited });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not list incidents');
    } finally {
      ledger.close();
    }
    return true;
  }

  // POST /api/v1/incidents — create incident
  if (pathname === '/api/v1/incidents' && method === 'POST') {
    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();

      const body = await bodyJson<{
        agentId?: string;
        title: string;
        severity?: string;
        description?: string;
      }>(req);

      if (!body.title) { apiError(res, 400, 'title required'); return true; }

      const agentId = body.agentId ?? 'default';
      const incidentId = `incident_${randomUUID().replace(/-/g, '')}`;
      const now = Date.now();
      const severity = normalizeSeverity(body.severity);
      const prevHash = store.getLastIncidentHash(agentId);

      const partial: Omit<Incident, 'incident_hash' | 'signature'> = {
        incidentId,
        agentId,
        severity,
        state: 'OPEN',
        title: body.title,
        description: body.description ?? body.title,
        triggerType: 'MANUAL',
        triggerId: 'manual',
        rootCauseClaimIds: [],
        affectedQuestionIds: [],
        causalEdges: [],
        timelineEventIds: [],
        createdTs: now,
        updatedTs: now,
        resolvedTs: null,
        postmortemRef: null,
        prev_incident_hash: prevHash,
      };

      const incident_hash = computeIncidentHash(partial);
      const privateKey = getPrivateKeyPem(workspace, 'monitor');
      const signature = signHexDigest(incident_hash, privateKey);

      const incident: Incident = {
        ...partial,
        incident_hash,
        signature,
      };

      store.insertIncident(incident);

      apiSuccess(res, {
        incidentId,
        agentId,
        state: 'OPEN',
      }, 201);
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not create incident');
    } finally {
      ledger.close();
    }
    return true;
  }

  // Match /:id routes
  const incParams = pathParam(pathname, '/api/v1/incidents/:id');
  if (!incParams || !incParams.id) return false;

  const incidentId: string = incParams.id;

  // GET /api/v1/incidents/:id — get incident details
  if (method === 'GET') {
    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();

      const incident = store.getIncident(incidentId);
      if (!incident) { apiError(res, 404, 'Incident not found'); return true; }

      const transitions = store.getIncidentTransitions(incidentId);
      const causalEdges = store.getCausalEdges(incidentId);

      // Determine current state from transitions
      const currentState = transitions.length > 0
        ? transitions[transitions.length - 1]!.toState
        : incident.state;

      apiSuccess(res, {
        incidentId: incident.incidentId,
        agentId: incident.agentId,
        severity: incident.severity,
        state: currentState,
        title: incident.title,
        description: incident.description,
        createdTs: incident.createdTs,
        transitions: transitions.map(t => ({
          transitionId: t.transitionId,
          fromState: t.fromState,
          toState: t.toState,
          reason: t.reason,
          ts: t.ts,
        })),
        causalEdges: causalEdges.map(e => ({
          edgeId: e.edgeId,
          fromEventId: e.fromEventId,
          toEventId: e.toEventId,
          relationship: e.relationship,
          confidence: e.confidence,
        })),
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not load incident');
    } finally {
      ledger.close();
    }
    return true;
  }

  // PATCH /api/v1/incidents/:id — update incident
  if (method === 'PATCH') {
    const ledger = openLedger(workspace);
    try {
      const store = createIncidentStore(ledger.db);
      store.initTables();

      const incident = store.getIncident(incidentId);
      if (!incident) { apiError(res, 404, 'Incident not found'); return true; }

      const body = await bodyJson<{
        resolution?: string;
        evidenceId?: string;
      }>(req);

      const privateKey = getPrivateKeyPem(workspace, 'monitor');
      const now = Date.now();

      // Handle resolution → close incident
      if (body.resolution) {
        // Determine current state from transitions
        const existingTransitions = store.getIncidentTransitions(incidentId);
        const currentState: IncidentState = existingTransitions.length > 0
          ? existingTransitions[existingTransitions.length - 1]!.toState
          : incident.state;

        const transitionId = `tr_${randomUUID().replace(/-/g, '')}`;
        const transitionPayload = canonicalize({
          transition_id: transitionId,
          incident_id: incidentId,
          from_state: currentState,
          to_state: 'RESOLVED',
          reason: body.resolution,
          ts: now,
        });
        const transitionSig = signHexDigest(sha256Hex(transitionPayload), privateKey);

        store.insertIncidentTransition({
          transitionId,
          incidentId,
          fromState: currentState,
          toState: 'RESOLVED',
          reason: body.resolution,
          ts: now,
          signature: transitionSig,
        });
      }

      // Handle evidenceId → add causal edge
      if (body.evidenceId) {
        const edgeId = `edge_${randomUUID().replace(/-/g, '')}`;
        const edgePayload = canonicalize({
          edge_id: edgeId,
          from_event_id: body.evidenceId,
          to_event_id: incidentId,
          relationship: 'CORRELATED',
          confidence: 0.8,
          evidence: [body.evidenceId],
          added_ts: now,
          added_by: 'OWNER',
        });
        const edgeSig = signHexDigest(sha256Hex(edgePayload), privateKey);

        store.insertCausalEdge(incidentId, {
          edgeId,
          fromEventId: body.evidenceId,
          toEventId: incidentId,
          relationship: 'CORRELATED',
          confidence: 0.8,
          evidence: [body.evidenceId],
          addedTs: now,
          addedBy: 'OWNER',
          signature: edgeSig,
        });
      }

      // Return updated state
      const transitions = store.getIncidentTransitions(incidentId);
      const causalEdges = store.getCausalEdges(incidentId);
      const currentState: IncidentState = transitions.length > 0
        ? transitions[transitions.length - 1]!.toState
        : incident.state;

      apiSuccess(res, {
        incidentId: incident.incidentId,
        state: currentState,
        transitions: transitions.map(t => ({
          transitionId: t.transitionId,
          fromState: t.fromState,
          toState: t.toState,
          reason: t.reason,
          ts: t.ts,
        })),
        causalEdges: causalEdges.map(e => ({
          edgeId: e.edgeId,
          fromEventId: e.fromEventId,
          toEventId: e.toEventId,
          relationship: e.relationship,
          confidence: e.confidence,
        })),
      });
    } catch (err) {
      apiError(res, 500, err instanceof Error ? err.message : 'Could not update incident');
    } finally {
      ledger.close();
    }
    return true;
  }

  return false;
}
