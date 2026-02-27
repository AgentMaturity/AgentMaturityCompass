import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, verifyHexDigestAny, getPublicKeyHistory } from "../crypto/keys.js";
import type { CausalEdge, Incident, IncidentTransition, IncidentState } from "./incidentTypes.js";

/** Typed DB row for incident records — matches the incidents table schema */
type IncidentRow = Incident;
/** Typed DB row for incident transitions */
type TransitionRow = IncidentTransition;

function initIncidentTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      incident_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
      state TEXT NOT NULL CHECK (state IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'POSTMORTEM')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('DRIFT', 'ASSURANCE_FAILURE', 'FREEZE', 'BUDGET_EXCEEDED', 'GOVERNANCE_VIOLATION', 'MANUAL')),
      trigger_id TEXT NOT NULL,
      root_cause_claim_ids_json TEXT NOT NULL DEFAULT '[]',
      affected_question_ids_json TEXT NOT NULL DEFAULT '[]',
      causal_edges_json TEXT NOT NULL DEFAULT '[]',
      timeline_event_ids_json TEXT NOT NULL DEFAULT '[]',
      created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL,
      resolved_ts INTEGER,
      postmortem_ref TEXT,
      prev_incident_hash TEXT NOT NULL,
      incident_hash TEXT NOT NULL,
      signature TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incident_transitions (
      transition_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      from_state TEXT NOT NULL CHECK (from_state IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'POSTMORTEM')),
      to_state TEXT NOT NULL CHECK (to_state IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'POSTMORTEM')),
      reason TEXT NOT NULL,
      ts INTEGER NOT NULL,
      signature TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(incident_id)
    );

    CREATE TABLE IF NOT EXISTS causal_edges (
      edge_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      from_event_id TEXT NOT NULL,
      to_event_id TEXT NOT NULL,
      relationship TEXT NOT NULL CHECK (relationship IN ('CAUSED', 'ENABLED', 'BLOCKED', 'MITIGATED', 'FIXED', 'CORRELATED')),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      evidence_json TEXT NOT NULL DEFAULT '[]',
      added_ts INTEGER NOT NULL,
      added_by TEXT NOT NULL CHECK (added_by IN ('AUTO', 'OWNER', 'AUDITOR')),
      signature TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(incident_id)
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_agent ON incidents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_agent_created_ts ON incidents(agent_id, created_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_incidents_state ON incidents(state);
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
    CREATE INDEX IF NOT EXISTS idx_incidents_agent_created ON incidents(agent_id, created_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_incidents_agent_state_created ON incidents(agent_id, state, created_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_incident_transitions_incident ON incident_transitions(incident_id);
    CREATE INDEX IF NOT EXISTS idx_incident_transitions_incident_ts ON incident_transitions(incident_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_incident_transitions_ts ON incident_transitions(ts);
    CREATE INDEX IF NOT EXISTS idx_incident_transitions_incident_ts ON incident_transitions(incident_id, ts);
    CREATE INDEX IF NOT EXISTS idx_causal_edges_incident ON causal_edges(incident_id);
    CREATE INDEX IF NOT EXISTS idx_causal_edges_incident_added ON causal_edges(incident_id, added_ts);
    CREATE INDEX IF NOT EXISTS idx_causal_edges_from_event ON causal_edges(from_event_id);
    CREATE INDEX IF NOT EXISTS idx_causal_edges_to_event ON causal_edges(to_event_id);
    CREATE TRIGGER IF NOT EXISTS enforce_incident_transition_state_change
    BEFORE INSERT ON incident_transitions
    WHEN NEW.from_state = NEW.to_state
    BEGIN
      SELECT RAISE(ABORT, 'incident transition must change state');
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_incident_severity_domain
    BEFORE INSERT ON incidents
    WHEN NEW.severity NOT IN ('INFO', 'WARN', 'CRITICAL')
    BEGIN
      SELECT RAISE(ABORT, 'incident severity out of range');
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_incident_state_domain
    BEFORE INSERT ON incidents
    WHEN NEW.state NOT IN ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'POSTMORTEM')
    BEGIN
      SELECT RAISE(ABORT, 'incident state out of range');
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_causal_edge_confidence
    BEFORE INSERT ON causal_edges
    WHEN NEW.confidence < 0 OR NEW.confidence > 1
    BEGIN
      SELECT RAISE(ABORT, 'causal edge confidence out of range');
    END;

    CREATE TRIGGER IF NOT EXISTS enforce_causal_edge_uniqueness
    BEFORE INSERT ON causal_edges
    WHEN EXISTS(
      SELECT 1 FROM causal_edges
      WHERE incident_id = NEW.incident_id
        AND from_event_id = NEW.from_event_id
        AND to_event_id = NEW.to_event_id
        AND relationship = NEW.relationship
    )
    BEGIN
      SELECT RAISE(ABORT, 'duplicate causal edge');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_incidents_immutable
    BEFORE UPDATE ON incidents
    BEGIN
      SELECT RAISE(ABORT, 'incidents are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_incidents
    BEFORE DELETE ON incidents
    BEGIN
      SELECT RAISE(ABORT, 'incidents cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_incident_transitions_immutable
    BEFORE UPDATE ON incident_transitions
    BEGIN
      SELECT RAISE(ABORT, 'incident_transitions are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_incident_transitions
    BEFORE DELETE ON incident_transitions
    BEGIN
      SELECT RAISE(ABORT, 'incident_transitions cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_causal_edges_immutable
    BEFORE UPDATE ON causal_edges
    BEGIN
      SELECT RAISE(ABORT, 'causal_edges are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_causal_edges
    BEFORE DELETE ON causal_edges
    BEGIN
      SELECT RAISE(ABORT, 'causal_edges cannot be deleted');
    END;
  `);
}

function getLastIncidentHash(db: Database.Database, agentId: string): string {
  const row = db
    .prepare("SELECT incident_hash FROM incidents WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(agentId) as { incident_hash: string } | undefined;
  return row?.incident_hash ?? "GENESIS_INCIDENT";
}

function insertIncident(db: Database.Database, incident: Incident): void {
  db.prepare(
    `INSERT INTO incidents
    (incident_id, agent_id, severity, state, title, description, trigger_type, trigger_id,
     root_cause_claim_ids_json, affected_question_ids_json, causal_edges_json, timeline_event_ids_json,
     created_ts, updated_ts, resolved_ts, postmortem_ref, prev_incident_hash, incident_hash, signature)
    VALUES (@incident_id, @agent_id, @severity, @state, @title, @description, @trigger_type, @trigger_id,
            @root_cause_claim_ids_json, @affected_question_ids_json, @causal_edges_json, @timeline_event_ids_json,
            @created_ts, @updated_ts, @resolved_ts, @postmortem_ref, @prev_incident_hash, @incident_hash, @signature)`
  ).run({
    incident_id: incident.incidentId,
    agent_id: incident.agentId,
    severity: incident.severity,
    state: incident.state,
    title: incident.title,
    description: incident.description,
    trigger_type: incident.triggerType,
    trigger_id: incident.triggerId,
    root_cause_claim_ids_json: JSON.stringify(incident.rootCauseClaimIds),
    affected_question_ids_json: JSON.stringify(incident.affectedQuestionIds),
    causal_edges_json: JSON.stringify(incident.causalEdges),
    timeline_event_ids_json: JSON.stringify(incident.timelineEventIds),
    created_ts: incident.createdTs,
    updated_ts: incident.updatedTs,
    resolved_ts: incident.resolvedTs ?? null,
    postmortem_ref: incident.postmortemRef ?? null,
    prev_incident_hash: incident.prev_incident_hash,
    incident_hash: incident.incident_hash,
    signature: incident.signature
  });
}

function insertIncidentTransition(db: Database.Database, transition: IncidentTransition): void {
  db.prepare(
    `INSERT INTO incident_transitions
    (transition_id, incident_id, from_state, to_state, reason, ts, signature)
    VALUES (@transition_id, @incident_id, @from_state, @to_state, @reason, @ts, @signature)`
  ).run({
    transition_id: transition.transitionId,
    incident_id: transition.incidentId,
    from_state: transition.fromState,
    to_state: transition.toState,
    reason: transition.reason,
    ts: transition.ts,
    signature: transition.signature
  });
}

function insertCausalEdge(db: Database.Database, incidentId: string, edge: CausalEdge): void {
  db.prepare(
    `INSERT INTO causal_edges
    (edge_id, incident_id, from_event_id, to_event_id, relationship, confidence, evidence_json, added_ts, added_by, signature)
    VALUES (@edge_id, @incident_id, @from_event_id, @to_event_id, @relationship, @confidence, @evidence_json, @added_ts, @added_by, @signature)`
  ).run({
    edge_id: edge.edgeId,
    incident_id: incidentId,
    from_event_id: edge.fromEventId,
    to_event_id: edge.toEventId,
    relationship: edge.relationship,
    confidence: edge.confidence,
    evidence_json: JSON.stringify(edge.evidence),
    added_ts: edge.addedTs,
    added_by: edge.addedBy,
    signature: edge.signature
  });
}

function getIncident(db: Database.Database, incidentId: string): Incident | null {
  const row = db
    .prepare("SELECT * FROM incidents WHERE incident_id = ?")
    .get(incidentId) as IncidentRow | undefined;

  if (!row) {
    return null;
  }

  return {
    incidentId: row.incident_id,
    agentId: row.agent_id,
    severity: row.severity,
    state: row.state,
    title: row.title,
    description: row.description,
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    rootCauseClaimIds: JSON.parse(row.root_cause_claim_ids_json) as string[],
    affectedQuestionIds: JSON.parse(row.affected_question_ids_json) as string[],
    causalEdges: JSON.parse(row.causal_edges_json) as CausalEdge[],
    timelineEventIds: JSON.parse(row.timeline_event_ids_json) as string[],
    createdTs: row.created_ts,
    updatedTs: row.updated_ts,
    resolvedTs: row.resolved_ts,
    postmortemRef: row.postmortem_ref,
    prev_incident_hash: row.prev_incident_hash,
    incident_hash: row.incident_hash,
    signature: row.signature
  };
}

function getIncidentsByAgent(db: Database.Database, agentId: string, state?: IncidentState): Incident[] {
  let query = "SELECT * FROM incidents WHERE agent_id = ?";
  const params: any[] = [agentId];

  if (state) {
    query += " AND state = ?";
    params.push(state);
  }

  query += " ORDER BY created_ts DESC";

  const rows = db.prepare(query).all(...params) as IncidentRow[];

  return rows.map((row) => ({
    incidentId: row.incident_id,
    agentId: row.agent_id,
    severity: row.severity,
    state: row.state,
    title: row.title,
    description: row.description,
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    rootCauseClaimIds: JSON.parse(row.root_cause_claim_ids_json) as string[],
    affectedQuestionIds: JSON.parse(row.affected_question_ids_json) as string[],
    causalEdges: JSON.parse(row.causal_edges_json) as CausalEdge[],
    timelineEventIds: JSON.parse(row.timeline_event_ids_json) as string[],
    createdTs: row.created_ts,
    updatedTs: row.updated_ts,
    resolvedTs: row.resolved_ts,
    postmortemRef: row.postmortem_ref,
    prev_incident_hash: row.prev_incident_hash,
    incident_hash: row.incident_hash,
    signature: row.signature
  }));
}

function getOpenIncidents(db: Database.Database, agentId: string): Incident[] {
  const states = ["OPEN", "INVESTIGATING", "MITIGATED"];
  const rows = db
    .prepare(`SELECT * FROM incidents WHERE agent_id = ? AND state IN (?, ?, ?) ORDER BY created_ts DESC`)
    .all(agentId, ...states) as IncidentRow[];

  return rows.map((row) => ({
    incidentId: row.incident_id,
    agentId: row.agent_id,
    severity: row.severity,
    state: row.state,
    title: row.title,
    description: row.description,
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    rootCauseClaimIds: JSON.parse(row.root_cause_claim_ids_json) as string[],
    affectedQuestionIds: JSON.parse(row.affected_question_ids_json) as string[],
    causalEdges: JSON.parse(row.causal_edges_json) as CausalEdge[],
    timelineEventIds: JSON.parse(row.timeline_event_ids_json) as string[],
    createdTs: row.created_ts,
    updatedTs: row.updated_ts,
    resolvedTs: row.resolved_ts,
    postmortemRef: row.postmortem_ref,
    prev_incident_hash: row.prev_incident_hash,
    incident_hash: row.incident_hash,
    signature: row.signature
  }));
}

function getIncidentTransitions(db: Database.Database, incidentId: string): IncidentTransition[] {
  const rows = db
    .prepare("SELECT * FROM incident_transitions WHERE incident_id = ? ORDER BY ts ASC")
    .all(incidentId) as TransitionRow[];

  return rows.map((row) => ({
    transitionId: row.transition_id,
    incidentId: row.incident_id,
    fromState: row.from_state,
    toState: row.to_state,
    reason: row.reason,
    ts: row.ts,
    signature: row.signature
  }));
}

function getLatestIncidentStates(db: Database.Database, incidentIds: string[]): Map<string, IncidentState> {
  if (incidentIds.length === 0) {
    return new Map();
  }
  const placeholders = incidentIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT incident_id, to_state, ts
       FROM incident_transitions
       WHERE incident_id IN (${placeholders})
       ORDER BY incident_id ASC, ts DESC`
    )
    .all(...incidentIds) as Array<{
    incident_id: string;
    to_state: IncidentState;
    ts: number;
  }>;

  const latestByIncident = new Map<string, IncidentState>();
  for (const row of rows) {
    if (!latestByIncident.has(row.incident_id)) {
      latestByIncident.set(row.incident_id, row.to_state);
    }
  }
  return latestByIncident;
}

function getCausalEdges(db: Database.Database, incidentId: string): CausalEdge[] {
  const rows = db
    .prepare("SELECT * FROM causal_edges WHERE incident_id = ? ORDER BY added_ts ASC")
    .all(incidentId) as TransitionRow[];

  return rows.map((row) => ({
    edgeId: row.edge_id,
    fromEventId: row.from_event_id,
    toEventId: row.to_event_id,
    relationship: row.relationship,
    confidence: row.confidence,
    evidence: JSON.parse(row.evidence_json) as string[],
    addedTs: row.added_ts,
    addedBy: row.added_by,
    signature: row.signature
  }));
}

function updateIncidentState(
  db: Database.Database,
  incidentId: string,
  newState: IncidentState,
  updatedTs: number,
  newHash: string,
  newSig: string
): void {
  // Note: Since incidents are append-only, we only update the state column when creating
  // a new record. This function is a conceptual helper - in practice, new incident records
  // are inserted with updated state, causalEdges, and timelineEventIds.
  // The actual state transition is recorded via incident_transitions table.
}

export interface IncidentStoreInstance {
  initTables: () => void;
  insertIncident: (incident: Incident) => void;
  insertIncidentTransition: (transition: IncidentTransition) => void;
  insertCausalEdge: (incidentId: string, edge: CausalEdge) => void;
  getIncident: (incidentId: string) => Incident | null;
  getIncidentsByAgent: (agentId: string, state?: IncidentState) => Incident[];
  getOpenIncidents: (agentId: string) => Incident[];
  getIncidentTransitions: (incidentId: string) => IncidentTransition[];
  getLatestIncidentStates: (incidentIds: string[]) => Map<string, IncidentState>;
  getCausalEdges: (incidentId: string) => CausalEdge[];
  getLastIncidentHash: (agentId: string) => string;
}

export function createIncidentStore(db: Database.Database): IncidentStoreInstance {
  return {
    initTables: () => initIncidentTables(db),
    insertIncident: (incident: Incident) => insertIncident(db, incident),
    insertIncidentTransition: (transition: IncidentTransition) => insertIncidentTransition(db, transition),
    insertCausalEdge: (incidentId: string, edge: CausalEdge) => insertCausalEdge(db, incidentId, edge),
    getIncident: (incidentId: string) => getIncident(db, incidentId),
    getIncidentsByAgent: (agentId: string, state?: IncidentState) => getIncidentsByAgent(db, agentId, state),
    getOpenIncidents: (agentId: string) => getOpenIncidents(db, agentId),
    getIncidentTransitions: (incidentId: string) => getIncidentTransitions(db, incidentId),
    getLatestIncidentStates: (incidentIds: string[]) => getLatestIncidentStates(db, incidentIds),
    getCausalEdges: (incidentId: string) => getCausalEdges(db, incidentId),
    getLastIncidentHash: (agentId: string) => getLastIncidentHash(db, agentId)
  };
}

export function verifyIncidentSignature(
  workspace: string,
  incident: Incident,
  publicKeys: string[]
): boolean {
  const payload: Omit<Incident, "signature"> = {
    incidentId: incident.incidentId,
    agentId: incident.agentId,
    severity: incident.severity,
    state: incident.state,
    title: incident.title,
    description: incident.description,
    triggerType: incident.triggerType,
    triggerId: incident.triggerId,
    rootCauseClaimIds: incident.rootCauseClaimIds,
    affectedQuestionIds: incident.affectedQuestionIds,
    causalEdges: incident.causalEdges,
    timelineEventIds: incident.timelineEventIds,
    createdTs: incident.createdTs,
    updatedTs: incident.updatedTs,
    resolvedTs: incident.resolvedTs,
    postmortemRef: incident.postmortemRef,
    prev_incident_hash: incident.prev_incident_hash,
    incident_hash: incident.incident_hash
  };
  const digest = sha256Hex(canonicalize(payload));
  return verifyHexDigestAny(digest, incident.signature, publicKeys);
}

export function computeIncidentHash(incident: Omit<Incident, "incident_hash" | "signature">): string {
  return sha256Hex(
    canonicalize({
      incident_id: incident.incidentId,
      agent_id: incident.agentId,
      severity: incident.severity,
      state: incident.state,
      title: incident.title,
      description: incident.description,
      trigger_type: incident.triggerType,
      trigger_id: incident.triggerId,
      root_cause_claim_ids: incident.rootCauseClaimIds,
      affected_question_ids: incident.affectedQuestionIds,
      causal_edges: incident.causalEdges,
      timeline_event_ids: incident.timelineEventIds,
      created_ts: incident.createdTs,
      updated_ts: incident.updatedTs,
      resolved_ts: incident.resolvedTs,
      postmortem_ref: incident.postmortemRef,
      prev_incident_hash: incident.prev_incident_hash
    })
  );
}
