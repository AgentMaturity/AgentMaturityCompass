import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { UNSIGNED_EVIDENCE_STORE } from "../ledger/ledgerConnection.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { signHexDigest, verifyHexDigestAny, getPublicKeyHistory } from "../crypto/keys.js";
import type { CausalEdge, Incident, IncidentClockEvent, IncidentTransition, IncidentState } from "./incidentTypes.js";

/** Typed DB row for incident records — matches the incidents table schema */
/** Raw SQLite row — snake_case DB columns */
type IncidentRow = {
  incident_id: string; agent_id: string; severity: string; state: string;
  title: string; description: string; trigger_type: string; trigger_id: string;
  root_cause_claim_ids_json: string; affected_question_ids_json: string;
  causal_edges_json: string; timeline_event_ids_json: string;
  created_ts: number; updated_ts: number; resolved_ts: number | null;
  postmortem_ref: string | null; prev_incident_hash: string;
  incident_hash: string; signature: string;
};
/** Raw SQLite row for incident transitions */
type TransitionRow = {
  transition_id: string; incident_id: string; from_state: string;
  to_state: string; reason: string; ts: number; operator_id: string | null;
  signature: string;
};
/** Raw SQLite row for causal edges */
type CausalEdgeRow = {
  edge_id: string; incident_id: string; from_event_id: string;
  to_event_id: string; relationship: string; confidence: number;
  evidence_json: string; added_ts: number; added_by: string; signature: string;
};
/** Raw SQLite row for regulatory clock events */
type ClockEventRow = {
  event_id: string; incident_id: string; kind: string; trigger_or_clock_id: string;
  station: string; ts: number; recorded_ts: number; recorded_by: string; signature: string;
};

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

    CREATE TABLE IF NOT EXISTS incident_clock_events (
      event_id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('TRIGGER', 'NOTIFIED')),
      trigger_or_clock_id TEXT NOT NULL,
      station TEXT NOT NULL,
      ts INTEGER NOT NULL,
      recorded_ts INTEGER NOT NULL,
      recorded_by TEXT NOT NULL,
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
    CREATE INDEX IF NOT EXISTS idx_incident_clock_events_incident_ts ON incident_clock_events(incident_id, ts);
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

    CREATE TRIGGER IF NOT EXISTS protect_incident_clock_events_immutable
    BEFORE UPDATE ON incident_clock_events
    BEGIN
      SELECT RAISE(ABORT, 'incident_clock_events are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_incident_clock_events
    BEFORE DELETE ON incident_clock_events
    BEGIN
      SELECT RAISE(ABORT, 'incident_clock_events cannot be deleted');
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

function insertIncidentClockEvent(db: Database.Database, event: IncidentClockEvent): void {
  db.prepare(
    `INSERT INTO incident_clock_events
    (event_id, incident_id, kind, trigger_or_clock_id, station, ts, recorded_ts, recorded_by, signature)
    VALUES (@event_id, @incident_id, @kind, @trigger_or_clock_id, @station, @ts, @recorded_ts, @recorded_by, @signature)`
  ).run({
    event_id: event.eventId,
    incident_id: event.incidentId,
    kind: event.kind,
    trigger_or_clock_id: event.triggerOrClockId,
    station: event.station,
    ts: event.ts,
    recorded_ts: event.recordedTs,
    recorded_by: event.recordedBy,
    signature: event.signature
  });
}

function getIncidentClockEvents(db: Database.Database, incidentId: string): IncidentClockEvent[] {
  const rows = db
    .prepare("SELECT * FROM incident_clock_events WHERE incident_id = ? ORDER BY ts ASC, rowid ASC")
    .all(incidentId) as ClockEventRow[];
  return rows.map((row) => ({
    eventId: row.event_id,
    incidentId: row.incident_id,
    kind: row.kind as IncidentClockEvent["kind"],
    triggerOrClockId: row.trigger_or_clock_id,
    station: row.station as IncidentClockEvent["station"],
    ts: row.ts,
    recordedTs: row.recorded_ts,
    recordedBy: row.recorded_by,
    signature: row.signature
  }));
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
    severity: row.severity as Incident["severity"],
    state: row.state as Incident["state"],
    title: row.title,
    description: row.description,
    triggerType: row.trigger_type as Incident["triggerType"],
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

function getIncidentsByAgent(db: Database.Database, agentId: string, state?: IncidentState, limit?: number,
  createdBetween?: readonly [number, number]): Incident[] {
  let query = "SELECT * FROM incidents WHERE agent_id = ?";
  const params: (string | number)[] = [agentId];
  if (createdBetween) { query += " AND created_ts BETWEEN ? AND ?"; params.push(...createdBetween); }

  if (state) {
    query += " AND state = ?";
    params.push(state);
  }

  query += " ORDER BY created_ts DESC";
  if (limit !== undefined) { query += " LIMIT ?"; params.push(limit); }

  const rows = db.prepare(query).all(...params) as IncidentRow[];

  return rows.map((row) => ({
    incidentId: row.incident_id,
    agentId: row.agent_id,
    severity: row.severity as Incident["severity"],
    state: row.state as Incident["state"],
    title: row.title,
    description: row.description,
    triggerType: row.trigger_type as Incident["triggerType"],
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
    severity: row.severity as Incident["severity"],
    state: row.state as Incident["state"],
    title: row.title,
    description: row.description,
    triggerType: row.trigger_type as Incident["triggerType"],
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
    fromState: row.from_state as IncidentTransition["fromState"],
    toState: row.to_state as IncidentTransition["toState"],
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
    .all(incidentId) as CausalEdgeRow[];

  return rows.map((row) => ({
    edgeId: row.edge_id,
    fromEventId: row.from_event_id,
    toEventId: row.to_event_id,
    relationship: row.relationship as CausalEdge["relationship"],
    confidence: row.confidence,
    evidence: JSON.parse(row.evidence_json) as string[],
    addedTs: row.added_ts,
    addedBy: row.added_by as CausalEdge["addedBy"],
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
  /** Rows are returned as stored; loadIncidentClocks (incidentClockEvents.ts) verifies them. */
  insertIncidentClockEvent: (event: IncidentClockEvent) => void;
  getIncidentClockEvents: (incidentId: string) => IncidentClockEvent[];
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
    getLastIncidentHash: (agentId: string) => getLastIncidentHash(db, agentId),
    insertIncidentClockEvent: (event: IncidentClockEvent) => insertIncidentClockEvent(db, event),
    getIncidentClockEvents: (incidentId: string) => getIncidentClockEvents(db, incidentId)
  };
}

/** At most this many unsigned incidents are read, newest first: a planted store cannot make an incident list slow or huge. */
const UNSIGNED_INCIDENT_READ_CAP = 500;
/** The columns the unsigned reader reads, per table; a store missing any of them (or either table) is unreadable. */
const UNSIGNED_INCIDENT_COLUMNS: Record<string, readonly string[]> = {
  incidents: ["incident_id", "agent_id", "severity", "state", "title", "description", "trigger_type", "trigger_id",
    "root_cause_claim_ids_json", "affected_question_ids_json", "causal_edges_json", "timeline_event_ids_json", "created_ts",
    "updated_ts", "resolved_ts", "postmortem_ref", "prev_incident_hash", "incident_hash", "signature"],
  incident_transitions: ["incident_id", "to_state", "ts"]
};
const INCIDENT_STATES = new Set(["OPEN", "INVESTIGATING", "MITIGATED", "RESOLVED", "POSTMORTEM"]);
const INCIDENT_SEVERITIES = new Set(["INFO", "WARN", "CRITICAL"]);
export type UnsignedIncident = Incident & { unsigned: true };

/** Unsigned rows dated further than this past the clock, or this far before the workspace, are planted and never listed. */
const UNSIGNED_CLOCK_SKEW_MS = 5 * 60_000;
/** The store and the sidecars SQLite opens with it: each must be absent or a regular file, never a FIFO, device or link. */
const UNSIGNED_STORE_FILES = ["", "-wal", "-shm", "-journal"];

/** Whether the unsigned store is absent, a regular file inside the workspace (sidecars too), or anything else. */
function unsignedStoreFile(workspace: string, path: string): "absent" | "file" | "refused" {
  try {
    const stats = UNSIGNED_STORE_FILES.map((suffix) => lstatSync(path + suffix, { throwIfNoEntry: false }));
    if (!stats[0]) return "absent";
    if (stats.some((stat) => stat && !stat.isFile())) return "refused";
    // A symlinked directory on the way could still lead out of the workspace.
    return realpathSync(path).startsWith(realpathSync(workspace) + sep) ? "file" : "refused";
  } catch { return "refused"; }
}

/**
 * The incidents AMC_NO_SIGN=1 detectors opened in the unsigned store (an unsigned kill's among them), with their latest
 * state, for incident lists to show labelled unsigned. Read in any mode: the kill switch enforces unsigned kills in
 * signing sessions too, so the incident must stay visible there. Never verified, and never merged into the signed store.
 * Rows dated in the future past a small clock skew, or before the workspace was created, are not read but counted in
 * `rejected`: a planted row cannot sit above every real one or use up the read cap. Anything wrong with that store (not
 * a regular file, outside the workspace, not a database, a view, virtual table or generated column, a table or column
 * missing, a malformed row) reads as no incidents with `unreadable` set, so it can never fail or block the signed list.
 */
export function unsignedIncidents(workspace: string, agentId: string, now = Date.now()):
  { incidents: UnsignedIncident[]; rejected: number; unreadable: boolean } {
  const path = join(workspace, UNSIGNED_EVIDENCE_STORE);
  // ponytail: the check and the open are two steps; a writer racing them is one who could already rewrite the store.
  const file = unsignedStoreFile(workspace, path);
  if (file !== "file") return { incidents: [], rejected: 0, unreadable: file === "refused" };
  try {
    // birthtimeMs is 0 where the filesystem does not record it; the lower bound is then the epoch.
    const window = [Math.max(0, statSync(join(workspace, ".amc")).birthtimeMs - UNSIGNED_CLOCK_SKEW_MS), now + UNSIGNED_CLOCK_SKEW_MS] as const;
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
      // Both names must be real tables: a view (a recursive CTE never ends), a virtual table or a generated column runs
      // code on every read. ponytail: better-sqlite3 has no progress handler or interrupt to stop a query on time, so the
      // bound is this check plus the read cap: what remains is a scan of a regular file's own rows.
      const kinds = db.prepare(`SELECT type FROM pragma_table_list WHERE schema = 'main'
        AND name COLLATE NOCASE IN ('incidents', 'incident_transitions')`).all() as Array<{ type: string }>;
      // Detectors create both tables on their first incident; a store with neither has never held one.
      if (kinds.length === 0) return { incidents: [], rejected: 0, unreadable: false };
      if (kinds.length !== 2 || kinds.some((kind) => kind.type !== "table")) return { incidents: [], rejected: 0, unreadable: true };
      const tables = Object.keys(UNSIGNED_INCIDENT_COLUMNS).map((table) => db.pragma(`table_xinfo(${table})`) as Array<{ name: string; hidden: number }>);
      if (tables.some((columns) => columns.some((column) => column.hidden !== 0))
        || Object.values(UNSIGNED_INCIDENT_COLUMNS).some((names, index) => names.some((name) => !tables[index]!.some((column) => column.name === name)))) {
        return { incidents: [], rejected: 0, unreadable: true };
      }
      const incidents = getIncidentsByAgent(db, agentId, undefined, UNSIGNED_INCIDENT_READ_CAP, window);
      const { rejected } = db.prepare("SELECT COUNT(*) AS rejected FROM incidents WHERE agent_id = ? AND created_ts NOT BETWEEN ? AND ?")
        .get(agentId, ...window) as { rejected: number };
      // One aggregate row per incident, never every transition: a planted store cannot fill memory here.
      const states = new Map(incidents.length === 0 ? [] : (db.prepare(`SELECT incident_id, to_state, MAX(ts) FROM incident_transitions
        WHERE incident_id IN (${incidents.map(() => "?").join(", ")}) GROUP BY incident_id`).all(...incidents.map((incident) => incident.incidentId)) as
        Array<{ incident_id: string; to_state: IncidentState }>).map((row) => [row.incident_id, row.to_state]));
      const listed = incidents.map((incident) => ({ ...incident, state: states.get(incident.incidentId) ?? incident.state, unsigned: true as const }));
      const wellFormed = listed.every((incident) => INCIDENT_STATES.has(incident.state) && INCIDENT_SEVERITIES.has(incident.severity)
        && Number.isSafeInteger(incident.createdTs) && typeof incident.title === "string");
      return wellFormed ? { incidents: listed, rejected, unreadable: false } : { incidents: [], rejected: 0, unreadable: true };
    } finally { db.close(); }
  } catch { return { incidents: [], rejected: 0, unreadable: true }; }
}

/** An incident list's `limit`: a positive integer in plain digits of any size (clamped to the largest safe integer), or undefined. */
export function incidentListLimit(raw: string | null | undefined): number | undefined {
  const value = raw && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : 0;
  return value > 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : undefined;
}

/**
 * An incident list in two sections that never share a limit. `signed`: the signed incidents `keep` passes, newest first,
 * cut to `limit`. `unsigned`: the unsigned store's, newest first, under their own cap of `limit`, so a planted unsigned
 * row can never take a signed row's place. In each section an OPEN CRITICAL incident (an unsigned kill's among them) is
 * never cut: it follows past the limit, counted in `pinnedSigned` or `pinnedUnsigned`.
 */
export function withUnsignedIncidents<T extends { createdTs: number; severity: string; state: string }>(workspace: string, agentId: string,
  signed: T[], keep: (row: T | UnsignedIncident) => boolean, limit: number) {
  const cut = <R extends T | UnsignedIncident>(listed: R[]) => {
    const rows = listed.filter(keep).sort((a, b) => b.createdTs - a.createdTs);
    const pinned = rows.slice(limit).filter((row) => row.severity === "CRITICAL" && row.state === "OPEN");
    return { rows: [...rows.slice(0, limit), ...pinned], pinned: pinned.length };
  };
  const unsigned = unsignedIncidents(workspace, agentId);
  const signedCut = cut(signed), unsignedCut = cut(unsigned.incidents);
  const warnings = [
    ...(unsigned.unreadable ? ["the unsigned evidence store could not be read; unsigned incidents are not shown"] : []),
    ...(unsigned.rejected > 0 ? [`${unsigned.rejected} unsigned incident(s) dated in the future or before the workspace are not shown`] : [])
  ];
  return { signed: signedCut.rows, pinnedSigned: signedCut.pinned, unsigned: unsignedCut.rows, pinnedUnsigned: unsignedCut.pinned,
    unsignedRejected: unsigned.rejected, unsignedUnreadable: unsigned.unreadable, warnings };
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
