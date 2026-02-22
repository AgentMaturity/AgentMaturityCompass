import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AMCConfig,
  AssuranceRunRecord,
  EvidenceEvent,
  EvidenceEventType,
  OutcomeContractRecord,
  OutcomeEvent,
  RunRecord,
  RuntimeName,
  SessionRecord
} from "../types.js";
import { ensureSigningKeys, getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { verifyGatewayConfigSignature } from "../gateway/config.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { listAgents, verifyAgentConfigSignature, verifyFleetConfigSignature } from "../fleet/registry.js";
import { listWorkOrders, verifyWorkOrder } from "../workorders/workorderEngine.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { mintReceipt, verifyReceipt, type ReceiptKind } from "../receipts/receipt.js";
import { loadOpsPolicy } from "../ops/policy.js";
import { loadBlobMetadata, storeEncryptedBlob } from "../storage/blobs/blobStore.js";
import { createIncidentStore } from "../incidents/incidentStore.js";
import type { Incident, CausalRelationship } from "../incidents/incidentTypes.js";

export interface AppendEvidenceInput {
  sessionId: string;
  runtime: RuntimeName;
  eventType: EvidenceEventType;
  payload?: string | Buffer;
  payloadExt?: "txt" | "json";
  inline?: boolean;
  meta?: Record<string, unknown>;
  id?: string;
  ts?: number;
}

export interface AppendEvidenceResult {
  id: string;
  ts: number;
  payloadSha256: string;
  eventHash: string;
  writerSig: string;
}

export interface AppendEvidenceWithReceiptInput extends AppendEvidenceInput {
  receipt: {
    kind: ReceiptKind;
    agentId: string;
    providerId: string;
    model: string | null;
    bodySha256: string;
  };
}

export interface VerifyResult {
  ok: boolean;
  errors: string[];
}

export interface AppendOutcomeEventInput {
  ts?: number;
  agentId: string;
  workOrderId?: string | null;
  category: "Emotional" | "Functional" | "Economic" | "Brand" | "Lifetime";
  metricId: string;
  value: number | string | boolean;
  unit?: string | null;
  trustTier: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
  source: "toolhub" | "webhook" | "manual" | "import";
  meta?: Record<string, unknown>;
  payload?: string;
  sessionId?: string;
}

function ledgerPath(workspace: string): string {
  return join(workspace, ".amc", "evidence.sqlite");
}

function blobDir(workspace: string): string {
  return join(workspace, ".amc", "blobs");
}

function targetsDir(workspace: string): string {
  return join(workspace, ".amc", "targets");
}

function runsDir(workspace: string): string {
  return join(workspace, ".amc", "runs");
}

interface Migration {
  version: number;
  sql: string;
}

function hasTable(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { 1: number } | undefined;
  return row !== undefined;
}

function tableColumns(db: Database.Database, tableName: string): Set<string> {
  if (!hasTable(db, tableName)) {
    return new Set();
  }
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function markMigrationAppliedIfMissing(db: Database.Database, version: number): void {
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_ts) VALUES (?, ?)").run(version, Date.now());
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_events (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        runtime TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_path TEXT,
        payload_inline TEXT,
        payload_sha256 TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        prev_event_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        writer_sig TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        started_ts INTEGER NOT NULL,
        ended_ts INTEGER,
        runtime TEXT NOT NULL,
        binary_path TEXT NOT NULL,
        binary_sha256 TEXT NOT NULL,
        session_final_event_hash TEXT,
        session_seal_sig TEXT
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        window_start_ts INTEGER NOT NULL,
        window_end_ts INTEGER NOT NULL,
        target_profile_id TEXT,
        report_json_sha256 TEXT NOT NULL,
        run_seal_sig TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_session_ts ON evidence_events(session_id, ts);
      CREATE INDEX IF NOT EXISTS idx_events_type_ts ON evidence_events(event_type, ts);
      CREATE INDEX IF NOT EXISTS idx_events_runtime_ts ON evidence_events(runtime, ts);

      CREATE TRIGGER IF NOT EXISTS no_update_evidence
      BEFORE UPDATE ON evidence_events
      BEGIN
        SELECT RAISE(ABORT, 'evidence_events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_evidence
      BEFORE DELETE ON evidence_events
      BEGIN
        SELECT RAISE(ABORT, 'evidence_events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_update_runs
      BEFORE UPDATE ON runs
      BEGIN
        SELECT RAISE(ABORT, 'runs are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_runs
      BEFORE DELETE ON runs
      BEGIN
        SELECT RAISE(ABORT, 'runs are immutable');
      END;
    `
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS assurance_runs (
        assurance_run_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        window_start_ts INTEGER NOT NULL,
        window_end_ts INTEGER NOT NULL,
        mode TEXT NOT NULL,
        pack_ids_json TEXT NOT NULL,
        report_json_sha256 TEXT NOT NULL,
        run_seal_sig TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assurance_runs_agent_ts ON assurance_runs(agent_id, ts);

      CREATE TRIGGER IF NOT EXISTS no_update_assurance_runs
      BEFORE UPDATE ON assurance_runs
      BEGIN
        SELECT RAISE(ABORT, 'assurance_runs are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_assurance_runs
      BEFORE DELETE ON assurance_runs
      BEGIN
        SELECT RAISE(ABORT, 'assurance_runs are immutable');
      END;
    `
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS outcome_events (
        outcome_event_id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        agent_id TEXT NOT NULL,
        work_order_id TEXT,
        category TEXT NOT NULL,
        metric_id TEXT NOT NULL,
        value TEXT NOT NULL,
        unit TEXT,
        trust_tier TEXT NOT NULL,
        source TEXT NOT NULL,
        meta_json TEXT NOT NULL,
        prev_event_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        signature TEXT NOT NULL,
        receipt_id TEXT NOT NULL,
        receipt TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_outcome_events_agent_ts ON outcome_events(agent_id, ts);
      CREATE INDEX IF NOT EXISTS idx_outcome_events_metric_ts ON outcome_events(metric_id, ts);

      CREATE TRIGGER IF NOT EXISTS no_update_outcome_events
      BEFORE UPDATE ON outcome_events
      BEGIN
        SELECT RAISE(ABORT, 'outcome_events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_outcome_events
      BEFORE DELETE ON outcome_events
      BEGIN
        SELECT RAISE(ABORT, 'outcome_events are append-only');
      END;

      CREATE TABLE IF NOT EXISTS outcome_contracts (
        contract_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        sig_valid INTEGER NOT NULL,
        created_ts INTEGER NOT NULL,
        signer_fpr TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_outcome_contracts_agent_ts ON outcome_contracts(agent_id, created_ts DESC);

      CREATE TRIGGER IF NOT EXISTS no_update_outcome_contracts
      BEFORE UPDATE ON outcome_contracts
      BEGIN
        SELECT RAISE(ABORT, 'outcome_contracts are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_outcome_contracts
      BEFORE DELETE ON outcome_contracts
      BEGIN
        SELECT RAISE(ABORT, 'outcome_contracts are append-only');
      END;
    `
  },
  {
    version: 5,
    sql: `
      ALTER TABLE evidence_events ADD COLUMN canonical_payload_path TEXT;
      ALTER TABLE evidence_events ADD COLUMN canonical_payload_inline TEXT;
      ALTER TABLE evidence_events ADD COLUMN blob_ref TEXT;
      ALTER TABLE evidence_events ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE evidence_events ADD COLUMN archive_segment_id TEXT;
      ALTER TABLE evidence_events ADD COLUMN archive_manifest_sha256 TEXT;
      ALTER TABLE evidence_events ADD COLUMN payload_pruned INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE evidence_events ADD COLUMN payload_pruned_ts INTEGER;

      UPDATE evidence_events
      SET canonical_payload_path = payload_path
      WHERE canonical_payload_path IS NULL;
      UPDATE evidence_events
      SET canonical_payload_inline = payload_inline
      WHERE canonical_payload_inline IS NULL;
      UPDATE evidence_events
      SET blob_ref = REPLACE(REPLACE(payload_path, '.amc/blobs/v1/', ''), '.blob', '')
      WHERE blob_ref IS NULL AND payload_path LIKE '.amc/blobs/v1/%';
      UPDATE evidence_events
      SET blob_ref = REPLACE(REPLACE(payload_path, '.amc/blobs/', ''), '.blob', '')
      WHERE blob_ref IS NULL AND payload_path LIKE '.amc/blobs/%';

      CREATE INDEX IF NOT EXISTS idx_events_archived_ts ON evidence_events(archived, ts);
      CREATE INDEX IF NOT EXISTS idx_events_payload_pruned_ts ON evidence_events(payload_pruned, ts);
      CREATE INDEX IF NOT EXISTS idx_events_blob_ref ON evidence_events(blob_ref);

      DROP TRIGGER IF EXISTS no_update_evidence;
      CREATE TRIGGER IF NOT EXISTS protect_evidence_immutable
      BEFORE UPDATE ON evidence_events
      WHEN
        OLD.id != NEW.id OR
        OLD.ts != NEW.ts OR
        OLD.session_id != NEW.session_id OR
        OLD.runtime != NEW.runtime OR
        OLD.event_type != NEW.event_type OR
        COALESCE(OLD.payload_sha256, '') != COALESCE(NEW.payload_sha256, '') OR
        COALESCE(OLD.meta_json, '') != COALESCE(NEW.meta_json, '') OR
        COALESCE(OLD.prev_event_hash, '') != COALESCE(NEW.prev_event_hash, '') OR
        COALESCE(OLD.event_hash, '') != COALESCE(NEW.event_hash, '') OR
        COALESCE(OLD.writer_sig, '') != COALESCE(NEW.writer_sig, '') OR
        COALESCE(OLD.canonical_payload_path, '') != COALESCE(NEW.canonical_payload_path, '') OR
        COALESCE(OLD.canonical_payload_inline, '') != COALESCE(NEW.canonical_payload_inline, '') OR
        COALESCE(OLD.blob_ref, '') != COALESCE(NEW.blob_ref, '')
      BEGIN
        SELECT RAISE(ABORT, 'evidence immutable fields changed');
      END;
    `
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS claims (
        claim_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        assertion_text TEXT NOT NULL,
        claimed_level INTEGER NOT NULL,
        provenance_tag TEXT NOT NULL,
        lifecycle_state TEXT NOT NULL,
        confidence REAL NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        trust_tier TEXT NOT NULL,
        promoted_from_claim_id TEXT,
        promotion_evidence_json TEXT NOT NULL DEFAULT '[]',
        superseded_by_claim_id TEXT,
        created_ts INTEGER NOT NULL,
        last_verified_ts INTEGER NOT NULL,
        expiry_ts INTEGER,
        prev_claim_hash TEXT NOT NULL,
        claim_hash TEXT NOT NULL,
        signature TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS claim_transitions (
        transition_id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL,
        from_state TEXT NOT NULL,
        to_state TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence_refs_json TEXT NOT NULL,
        ts INTEGER NOT NULL,
        signature TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
      );

      CREATE INDEX IF NOT EXISTS idx_claims_agent ON claims(agent_id);
      CREATE INDEX IF NOT EXISTS idx_claims_question ON claims(question_id);
      CREATE INDEX IF NOT EXISTS idx_claims_state ON claims(lifecycle_state);
      CREATE INDEX IF NOT EXISTS idx_claims_run ON claims(run_id);

      CREATE INDEX IF NOT EXISTS idx_claim_transitions_claim ON claim_transitions(claim_id);
      CREATE INDEX IF NOT EXISTS idx_claim_transitions_ts ON claim_transitions(ts);

      CREATE TRIGGER IF NOT EXISTS protect_claims_immutable
      BEFORE UPDATE ON claims
      BEGIN
        SELECT RAISE(ABORT, 'claims are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_claims
      BEFORE DELETE ON claims
      BEGIN
        SELECT RAISE(ABORT, 'claims cannot be deleted');
      END;

      CREATE TRIGGER IF NOT EXISTS protect_claim_transitions_immutable
      BEFORE UPDATE ON claim_transitions
      BEGIN
        SELECT RAISE(ABORT, 'claim_transitions are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_claim_transitions
      BEFORE DELETE ON claim_transitions
      BEGIN
        SELECT RAISE(ABORT, 'claim_transitions cannot be deleted');
      END;
    `
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_incident_links (
        link_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        incident_id TEXT NOT NULL,
        relationship TEXT NOT NULL,
        confidence REAL NOT NULL,
        reason TEXT,
        source TEXT NOT NULL,
        created_ts INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        signature TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_incident_links_event ON evidence_incident_links(event_id, created_ts);
      CREATE INDEX IF NOT EXISTS idx_evidence_incident_links_incident ON evidence_incident_links(incident_id, created_ts);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_incident_links_unique ON evidence_incident_links(event_id, incident_id);

      CREATE TRIGGER IF NOT EXISTS protect_evidence_incident_links_immutable
      BEFORE UPDATE ON evidence_incident_links
      BEGIN
        SELECT RAISE(ABORT, 'evidence_incident_links are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_evidence_incident_links
      BEFORE DELETE ON evidence_incident_links
      BEGIN
        SELECT RAISE(ABORT, 'evidence_incident_links cannot be deleted');
      END;

      CREATE TABLE IF NOT EXISTS evidence_corrections (
        link_id TEXT PRIMARY KEY,
        evidence_event_id TEXT NOT NULL,
        correction_id TEXT NOT NULL,
        status TEXT NOT NULL,
        verified_ts INTEGER,
        verified_by TEXT,
        source TEXT NOT NULL,
        created_ts INTEGER NOT NULL,
        signature TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_corrections_event ON evidence_corrections(evidence_event_id, created_ts);
      CREATE INDEX IF NOT EXISTS idx_evidence_corrections_correction ON evidence_corrections(correction_id, created_ts);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_corrections_unique ON evidence_corrections(evidence_event_id, correction_id, status);

      CREATE TRIGGER IF NOT EXISTS protect_evidence_corrections_immutable
      BEFORE UPDATE ON evidence_corrections
      BEGIN
        SELECT RAISE(ABORT, 'evidence_corrections are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_evidence_corrections
      BEFORE DELETE ON evidence_corrections
      BEGIN
        SELECT RAISE(ABORT, 'evidence_corrections cannot be deleted');
      END;
    `
  }
];

function reconcileLegacyMigrationState(db: Database.Database): void {
  if (!hasTable(db, "schema_migrations")) {
    return;
  }

  // Migration 5 used ALTER TABLE statements. Older/partially migrated installs can
  // already contain these columns while missing schema_migrations row 5. Mark it
  // applied to keep startup idempotent and avoid "duplicate column name" failures.
  const evidenceColumns = tableColumns(db, "evidence_events");
  const migration5Columns = [
    "canonical_payload_path",
    "canonical_payload_inline",
    "blob_ref",
    "archived",
    "archive_segment_id",
    "archive_manifest_sha256",
    "payload_pruned",
    "payload_pruned_ts"
  ];
  const migration5AlreadyApplied = migration5Columns.every((column) => evidenceColumns.has(column));
  if (migration5AlreadyApplied) {
    markMigrationAppliedIfMissing(db, 5);
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_ts INTEGER NOT NULL
    );
  `);

  reconcileLegacyMigrationState(db);

  for (const migration of migrations) {
    const tx = db.transaction(() => {
      const alreadyApplied = db
        .prepare("SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1")
        .get(migration.version) as { 1: number } | undefined;
      if (alreadyApplied) {
        return;
      }
      try {
        db.exec(migration.sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`schema migration ${migration.version} failed: ${message}`);
      }
      db.prepare("INSERT INTO schema_migrations(version, applied_ts) VALUES (?, ?)").run(migration.version, Date.now());
    });
    tx();
  }
}

function sanitizeMetaForHash(metaJson: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return metaJson;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return metaJson;
  }
  const clone: Record<string, unknown> = { ...parsed };
  delete clone.receipt;
  delete clone.receipt_sha256;
  return JSON.stringify(clone);
}

function canonicalMetadataForHash(params: {
  id: string;
  ts: number;
  sessionId: string;
  runtime: RuntimeName;
  eventType: EvidenceEventType;
  payloadPath: string | null;
  payloadInline: string | null;
  metaJson: string;
}): string {
  return canonicalize({
    id: params.id,
    ts: params.ts,
    session_id: params.sessionId,
    runtime: params.runtime,
    event_type: params.eventType,
    payload_path: params.payloadPath,
    payload_inline: params.payloadInline,
    meta_json: sanitizeMetaForHash(params.metaJson)
  });
}

function firstString(
  source: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function contextFromEvidenceMeta(meta: Record<string, unknown>): {
  agentId: string | null;
  explicitIncidentIds: string[];
  triggerIds: string[];
  questionIds: string[];
} {
  const explicitIncidentIds = [
    ...stringArray(meta.incidentId),
    ...stringArray(meta.incident_id),
    ...stringArray(meta.incidentIds),
    ...stringArray(meta.incident_ids)
  ];
  const triggerIds = [
    ...stringArray(meta.triggerId),
    ...stringArray(meta.trigger_id)
  ];
  const questionIds = [
    ...stringArray(meta.questionId),
    ...stringArray(meta.question_id),
    ...stringArray(meta.questionIds),
    ...stringArray(meta.question_ids),
    ...stringArray(meta.affectedQuestionIds),
    ...stringArray(meta.affected_question_ids)
  ];
  return {
    agentId: firstString(meta, ["agentId", "agent_id"]),
    explicitIncidentIds: [...new Set(explicitIncidentIds)],
    triggerIds: [...new Set(triggerIds)],
    questionIds: [...new Set(questionIds)]
  };
}

const AUTO_INCIDENT_FALLBACK_EVENT_TYPES = new Set<EvidenceEventType>([
  "audit",
  "review",
  "test",
  "metric",
  "artifact",
  "tool_action",
  "tool_result",
  "outcome"
]);

export class Ledger {
  readonly workspace: string;
  readonly db: Database.Database;
  private incidentStoreInitialized = false;

  constructor(workspace: string) {
    this.workspace = workspace;
    ensureDir(join(workspace, ".amc"));
    ensureDir(blobDir(workspace));
    ensureDir(targetsDir(workspace));
    ensureDir(runsDir(workspace));
    ensureSigningKeys(workspace);

    this.db = new Database(ledgerPath(workspace));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    runMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }

  private monitorPrivateKey(): string {
    return getPrivateKeyPem(this.workspace, "monitor");
  }

  private auditorPrivateKey(): string {
    return getPrivateKeyPem(this.workspace, "auditor");
  }

  private assertTrustedWriter(): void {
    if (process.env.AMC_EVALUATED_AGENT === "1") {
      throw new Error("untrusted evaluated agent process cannot write to AMC ledger");
    }
  }

  private latestEventHash(): string {
    const row = this.db.prepare("SELECT event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1").get() as
      | { event_hash: string }
      | undefined;
    return row?.event_hash ?? "GENESIS";
  }

  private latestOutcomeEventHash(): string {
    const row = this.db
      .prepare("SELECT event_hash FROM outcome_events ORDER BY rowid DESC LIMIT 1")
      .get() as { event_hash: string } | undefined;
    return row?.event_hash ?? "GENESIS_OUTCOME";
  }

  private storeBlob(payload: Buffer, _ext: "txt" | "json"): { path: string; sha: string; blobRef: string | null } {
    const policy = loadOpsPolicy(this.workspace);
    if (payload.byteLength > policy.opsPolicy.retention.maxBlobBytes) {
      throw new Error(
        `payload exceeds max blob bytes (${payload.byteLength} > ${policy.opsPolicy.retention.maxBlobBytes})`
      );
    }
    if (!policy.opsPolicy.encryption.blobEncryptionEnabled) {
      const sha = sha256Hex(payload);
      const name = `${sha}.txt`;
      const full = join(blobDir(this.workspace), name);
      if (!pathExists(full)) {
        writeFileAtomic(full, payload);
      }
      return { path: join(".amc", "blobs", name), sha, blobRef: null };
    }
    const stored = storeEncryptedBlob(this.workspace, payload);
    return {
      path: stored.path,
      sha: stored.payloadSha256,
      blobRef: stored.blobId
    };
  }

  private ensureIncidentStore() {
    const store = createIncidentStore(this.db);
    if (!this.incidentStoreInitialized) {
      store.initTables();
      this.incidentStoreInitialized = true;
    }
    return store;
  }

  private appendEvidenceIncidentLink(params: {
    eventId: string;
    incidentId: string;
    relationship: CausalRelationship;
    confidence: number;
    reason: string;
    createdTs: number;
  }): void {
    if (!hasTable(this.db, "evidence_incident_links")) {
      return;
    }
    const existing = this.db
      .prepare("SELECT 1 FROM evidence_incident_links WHERE event_id = ? AND incident_id = ? LIMIT 1")
      .get(params.eventId, params.incidentId);
    if (existing) {
      return;
    }

    const linkId = `eil_${randomUUID().replace(/-/g, "")}`;
    const canonical = canonicalize({
      link_id: linkId,
      event_id: params.eventId,
      incident_id: params.incidentId,
      relationship: params.relationship,
      confidence: params.confidence,
      reason: params.reason,
      source: "AUTO_OPEN_INCIDENT_MATCH",
      created_ts: params.createdTs,
      created_by: "AUTO"
    });
    const signature = signHexDigest(sha256Hex(canonical), this.monitorPrivateKey());

    this.db
      .prepare(
        `INSERT INTO evidence_incident_links
         (link_id, event_id, incident_id, relationship, confidence, reason, source, created_ts, created_by, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        linkId,
        params.eventId,
        params.incidentId,
        params.relationship,
        params.confidence,
        params.reason,
        "AUTO_OPEN_INCIDENT_MATCH",
        params.createdTs,
        "AUTO",
        signature
      );

    if (!hasTable(this.db, "causal_edges")) {
      return;
    }

    const existingEdge = this.db
      .prepare("SELECT 1 FROM causal_edges WHERE incident_id = ? AND from_event_id = ? AND to_event_id = ? LIMIT 1")
      .get(params.incidentId, params.eventId, params.incidentId);
    if (existingEdge) {
      return;
    }

    const edgeId = `edge_${randomUUID().replace(/-/g, "")}`;
    const edgePayload = canonicalize({
      edge_id: edgeId,
      from_event_id: params.eventId,
      to_event_id: params.incidentId,
      relationship: params.relationship,
      confidence: params.confidence,
      evidence: [params.eventId],
      added_ts: params.createdTs,
      added_by: "AUTO"
    });
    const edgeSig = signHexDigest(sha256Hex(edgePayload), this.monitorPrivateKey());
    this.db
      .prepare(
        `INSERT INTO causal_edges
         (edge_id, incident_id, from_event_id, to_event_id, relationship, confidence, evidence_json, added_ts, added_by, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        edgeId,
        params.incidentId,
        params.eventId,
        params.incidentId,
        params.relationship,
        params.confidence,
        JSON.stringify([params.eventId]),
        params.createdTs,
        "AUTO",
        edgeSig
      );
  }

  private autoLinkEvidenceToOpenIncidents(params: {
    eventId: string;
    eventType: EvidenceEventType;
    meta: Record<string, unknown>;
    ts: number;
  }): void {
    const context = contextFromEvidenceMeta(params.meta);
    if (!context.agentId) {
      return;
    }

    let open: Incident[] = [];
    try {
      const store = this.ensureIncidentStore();
      open = store.getOpenIncidents(context.agentId);
    } catch {
      return;
    }
    if (open.length === 0) {
      return;
    }

    for (const incident of open) {
      const reasons: string[] = [];
      let confidence = 0.5;

      if (context.explicitIncidentIds.includes(incident.incidentId)) {
        reasons.push("meta.incidentId match");
        confidence = Math.max(confidence, 1);
      }
      if (context.triggerIds.includes(incident.triggerId)) {
        reasons.push("meta.triggerId match");
        confidence = Math.max(confidence, 0.9);
      }
      if (context.questionIds.some((questionId) => incident.affectedQuestionIds.includes(questionId))) {
        reasons.push("affected question overlap");
        confidence = Math.max(confidence, 0.75);
      }
      if (
        reasons.length === 0 &&
        open.length === 1 &&
        AUTO_INCIDENT_FALLBACK_EVENT_TYPES.has(params.eventType)
      ) {
        reasons.push("single open incident fallback");
        confidence = Math.max(confidence, 0.4);
      }
      if (reasons.length === 0) {
        continue;
      }
      this.appendEvidenceIncidentLink({
        eventId: params.eventId,
        incidentId: incident.incidentId,
        relationship: "CORRELATED",
        confidence,
        reason: reasons.join("; "),
        createdTs: params.ts
      });
    }
  }

  appendEvidenceDetailed(input: AppendEvidenceInput): AppendEvidenceResult {
    this.assertTrustedWriter();
    const id = input.id ?? randomUUID();
    const ts = input.ts ?? Date.now();
    const policy = loadOpsPolicy(this.workspace);
    const payload = input.payload;
    let payloadPath: string | null = null;
    let payloadInline: string | null = null;
    let blobRef: string | null = null;
    let payloadSha256 = sha256Hex(Buffer.alloc(0));

    if (payload !== undefined) {
      const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
      if (bytes.byteLength > policy.opsPolicy.retention.maxPayloadBytesPerEvent) {
        throw new Error(
          `payload exceeds max bytes per event (${bytes.byteLength} > ${policy.opsPolicy.retention.maxPayloadBytesPerEvent})`
        );
      }
      payloadSha256 = sha256Hex(bytes);
      if (input.inline) {
        payloadInline = bytes.toString("utf8");
      } else {
        const blob = this.storeBlob(bytes, input.payloadExt ?? "txt");
        payloadPath = blob.path;
        blobRef = blob.blobRef;
      }
    }

    const canonicalPayloadPath = payloadPath;
    const canonicalPayloadInline = payloadInline;

    const metaJson = JSON.stringify(input.meta ?? {});
    const prevHash = this.latestEventHash();
    const canonicalMetadata = canonicalMetadataForHash({
      id,
      ts,
      sessionId: input.sessionId,
      runtime: input.runtime,
      eventType: input.eventType,
      payloadPath,
      payloadInline,
      metaJson
    });
    const eventHash = sha256Hex(`${prevHash}${canonicalMetadata}${payloadSha256}`);
    const writerSig = signHexDigest(eventHash, this.monitorPrivateKey());

    this.db
      .prepare(
        `INSERT INTO evidence_events
        (id, ts, session_id, runtime, event_type, payload_path, payload_inline, payload_sha256, meta_json, prev_event_hash, event_hash, writer_sig, canonical_payload_path, canonical_payload_inline, blob_ref, archived, archive_segment_id, archive_manifest_sha256, payload_pruned, payload_pruned_ts)
        VALUES (@id, @ts, @session_id, @runtime, @event_type, @payload_path, @payload_inline, @payload_sha256, @meta_json, @prev_event_hash, @event_hash, @writer_sig, @canonical_payload_path, @canonical_payload_inline, @blob_ref, @archived, @archive_segment_id, @archive_manifest_sha256, @payload_pruned, @payload_pruned_ts)`
      )
      .run({
        id,
        ts,
        session_id: input.sessionId,
        runtime: input.runtime,
        event_type: input.eventType,
        payload_path: payloadPath,
        payload_inline: payloadInline,
        payload_sha256: payloadSha256,
        meta_json: metaJson,
        prev_event_hash: prevHash,
        event_hash: eventHash,
        writer_sig: writerSig,
        canonical_payload_path: canonicalPayloadPath,
        canonical_payload_inline: canonicalPayloadInline,
        blob_ref: blobRef,
        archived: 0,
        archive_segment_id: null,
        archive_manifest_sha256: null,
        payload_pruned: 0,
        payload_pruned_ts: null
      });

    this.autoLinkEvidenceToOpenIncidents({
      eventId: id,
      eventType: input.eventType,
      meta: input.meta ?? {},
      ts
    });

    return {
      id,
      ts,
      payloadSha256: payloadSha256,
      eventHash,
      writerSig
    };
  }

  appendEvidence(input: AppendEvidenceInput): string {
    return this.appendEvidenceDetailed(input).id;
  }

  appendEvidenceWithReceipt(input: AppendEvidenceWithReceiptInput): AppendEvidenceResult & {
    receipt: string;
    receiptId: string;
    receiptSha256: string;
  } {
    this.assertTrustedWriter();
    const id = input.id ?? randomUUID();
    const ts = input.ts ?? Date.now();
    const policy = loadOpsPolicy(this.workspace);
    const payload = input.payload;
    let payloadPath: string | null = null;
    let payloadInline: string | null = null;
    let blobRef: string | null = null;
    let payloadSha256 = sha256Hex(Buffer.alloc(0));

    if (payload !== undefined) {
      const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
      if (bytes.byteLength > policy.opsPolicy.retention.maxPayloadBytesPerEvent) {
        throw new Error(
          `payload exceeds max bytes per event (${bytes.byteLength} > ${policy.opsPolicy.retention.maxPayloadBytesPerEvent})`
        );
      }
      payloadSha256 = sha256Hex(bytes);
      if (input.inline) {
        payloadInline = bytes.toString("utf8");
      } else {
        const blob = this.storeBlob(bytes, input.payloadExt ?? "txt");
        payloadPath = blob.path;
        blobRef = blob.blobRef;
      }
    }

    const canonicalPayloadPath = payloadPath;
    const canonicalPayloadInline = payloadInline;

    const receiptId = randomUUID();
    const baseMeta = {
      ...(input.meta ?? {}),
      receipt_id: receiptId
    };
    const baseMetaJson = JSON.stringify(baseMeta);
    const prevHash = this.latestEventHash();
    const baseCanonicalMetadata = canonicalMetadataForHash({
      id,
      ts,
      sessionId: input.sessionId,
      runtime: input.runtime,
      eventType: input.eventType,
      payloadPath,
      payloadInline,
      metaJson: baseMetaJson
    });
    const eventHash = sha256Hex(`${prevHash}${baseCanonicalMetadata}${payloadSha256}`);
    const minted = mintReceipt({
      kind: input.receipt.kind,
      ts,
      agentId: input.receipt.agentId,
      providerId: input.receipt.providerId,
      model: input.receipt.model,
      eventHash,
      bodySha256: input.receipt.bodySha256,
      sessionId: input.sessionId,
      privateKeyPem: this.monitorPrivateKey(),
      receiptId
    });

    const metaJson = JSON.stringify({
      ...baseMeta,
      receipt_sha256: minted.receiptSha256,
      receipt: minted.receipt
    });
    const canonicalMetadata = canonicalMetadataForHash({
      id,
      ts,
      sessionId: input.sessionId,
      runtime: input.runtime,
      eventType: input.eventType,
      payloadPath,
      payloadInline,
      metaJson
    });
    const recalculated = sha256Hex(`${prevHash}${canonicalMetadata}${payloadSha256}`);
    const writerSig = signHexDigest(recalculated, this.monitorPrivateKey());

    this.db
      .prepare(
        `INSERT INTO evidence_events
        (id, ts, session_id, runtime, event_type, payload_path, payload_inline, payload_sha256, meta_json, prev_event_hash, event_hash, writer_sig, canonical_payload_path, canonical_payload_inline, blob_ref, archived, archive_segment_id, archive_manifest_sha256, payload_pruned, payload_pruned_ts)
        VALUES (@id, @ts, @session_id, @runtime, @event_type, @payload_path, @payload_inline, @payload_sha256, @meta_json, @prev_event_hash, @event_hash, @writer_sig, @canonical_payload_path, @canonical_payload_inline, @blob_ref, @archived, @archive_segment_id, @archive_manifest_sha256, @payload_pruned, @payload_pruned_ts)`
      )
      .run({
        id,
        ts,
        session_id: input.sessionId,
        runtime: input.runtime,
        event_type: input.eventType,
        payload_path: payloadPath,
        payload_inline: payloadInline,
        payload_sha256: payloadSha256,
        meta_json: metaJson,
        prev_event_hash: prevHash,
        event_hash: recalculated,
        writer_sig: writerSig,
        canonical_payload_path: canonicalPayloadPath,
        canonical_payload_inline: canonicalPayloadInline,
        blob_ref: blobRef,
        archived: 0,
        archive_segment_id: null,
        archive_manifest_sha256: null,
        payload_pruned: 0,
        payload_pruned_ts: null
      });

    this.autoLinkEvidenceToOpenIncidents({
      eventId: id,
      eventType: input.eventType,
      meta: baseMeta,
      ts
    });

    return {
      id,
      ts,
      payloadSha256,
      eventHash: recalculated,
      writerSig,
      receipt: minted.receipt,
      receiptId: minted.payload.receipt_id,
      receiptSha256: minted.receiptSha256
    };
  }

  appendOutcomeEvent(input: AppendOutcomeEventInput): {
    outcomeEventId: string;
    eventHash: string;
    signature: string;
    receiptId: string;
    receipt: string;
    payloadSha256: string;
  } {
    this.assertTrustedWriter();
    const outcomeEventId = randomUUID();
    const ts = input.ts ?? Date.now();
    const sessionId = input.sessionId ?? `outcome-${input.agentId}`;
    const metaJson = JSON.stringify(input.meta ?? {});
    const payloadText =
      input.payload ??
      canonicalize({
        metricId: input.metricId,
        value: input.value,
        unit: input.unit ?? null,
        meta: input.meta ?? {}
      });
    const payloadSha256 = sha256Hex(Buffer.from(payloadText, "utf8"));
    const prevHash = this.latestOutcomeEventHash();
    const eventHash = sha256Hex(
      `${prevHash}${canonicalize({
        outcome_event_id: outcomeEventId,
        ts,
        agent_id: input.agentId,
        work_order_id: input.workOrderId ?? null,
        category: input.category,
        metric_id: input.metricId,
        value: input.value,
        unit: input.unit ?? null,
        trust_tier: input.trustTier,
        source: input.source,
        meta_json: metaJson,
        payload_sha256: payloadSha256
      })}`
    );
    const signature = signHexDigest(eventHash, this.monitorPrivateKey());
    const minted = mintReceipt({
      kind: "guard_check",
      ts,
      agentId: input.agentId,
      providerId: "outcomes",
      model: null,
      eventHash,
      bodySha256: payloadSha256,
      sessionId,
      privateKeyPem: this.monitorPrivateKey()
    });

    this.db
      .prepare(
        `INSERT INTO outcome_events
        (outcome_event_id, ts, agent_id, work_order_id, category, metric_id, value, unit, trust_tier, source, meta_json, prev_event_hash, event_hash, signature, receipt_id, receipt, payload_sha256)
        VALUES (@outcome_event_id, @ts, @agent_id, @work_order_id, @category, @metric_id, @value, @unit, @trust_tier, @source, @meta_json, @prev_event_hash, @event_hash, @signature, @receipt_id, @receipt, @payload_sha256)`
      )
      .run({
        outcome_event_id: outcomeEventId,
        ts,
        agent_id: input.agentId,
        work_order_id: input.workOrderId ?? null,
        category: input.category,
        metric_id: input.metricId,
        value: JSON.stringify(input.value),
        unit: input.unit ?? null,
        trust_tier: input.trustTier,
        source: input.source,
        meta_json: metaJson,
        prev_event_hash: prevHash,
        event_hash: eventHash,
        signature,
        receipt_id: minted.payload.receipt_id,
        receipt: minted.receipt,
        payload_sha256: payloadSha256
      });

    return {
      outcomeEventId,
      eventHash,
      signature,
      receiptId: minted.payload.receipt_id,
      receipt: minted.receipt,
      payloadSha256
    };
  }

  insertOutcomeContract(record: Omit<OutcomeContractRecord, "created_ts"> & { createdTs?: number }): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO outcome_contracts
        (contract_id, agent_id, file_path, sha256, sig_valid, created_ts, signer_fpr)
        VALUES (@contract_id, @agent_id, @file_path, @sha256, @sig_valid, @created_ts, @signer_fpr)`
      )
      .run({
        contract_id: record.contract_id,
        agent_id: record.agent_id,
        file_path: record.file_path,
        sha256: record.sha256,
        sig_valid: record.sig_valid,
        created_ts: record.createdTs ?? Date.now(),
        signer_fpr: record.signer_fpr
      });
  }

  startSession(params: {
    sessionId: string;
    runtime: RuntimeName;
    binaryPath: string;
    binarySha256: string;
  }): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO sessions
        (session_id, started_ts, ended_ts, runtime, binary_path, binary_sha256, session_final_event_hash, session_seal_sig)
        VALUES (@session_id, @started_ts, NULL, @runtime, @binary_path, @binary_sha256, NULL, NULL)`
      )
      .run({
        session_id: params.sessionId,
        started_ts: Date.now(),
        runtime: params.runtime,
        binary_path: params.binaryPath,
        binary_sha256: params.binarySha256
      });
  }

  sealSession(sessionId: string): void {
    this.assertTrustedWriter();
    const row = this.db
      .prepare(
        `SELECT event_hash FROM evidence_events
         WHERE session_id = ?
         ORDER BY rowid DESC
         LIMIT 1`
      )
      .get(sessionId) as { event_hash: string } | undefined;

    const finalHash = row?.event_hash ?? sha256Hex("EMPTY_SESSION");
    const sealSig = signHexDigest(finalHash, this.monitorPrivateKey());

    this.db
      .prepare(
        `UPDATE sessions
         SET ended_ts = @ended_ts,
             session_final_event_hash = @session_final_event_hash,
             session_seal_sig = @session_seal_sig
         WHERE session_id = @session_id`
      )
      .run({
        ended_ts: Date.now(),
        session_final_event_hash: finalHash,
        session_seal_sig: sealSig,
        session_id: sessionId
      });
  }

  insertRun(record: Omit<RunRecord, "ts"> & { ts?: number }): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO runs
         (run_id, ts, window_start_ts, window_end_ts, target_profile_id, report_json_sha256, run_seal_sig, status)
         VALUES (@run_id, @ts, @window_start_ts, @window_end_ts, @target_profile_id, @report_json_sha256, @run_seal_sig, @status)`
      )
      .run({
        run_id: record.run_id,
        ts: record.ts ?? Date.now(),
        window_start_ts: record.window_start_ts,
        window_end_ts: record.window_end_ts,
        target_profile_id: record.target_profile_id,
        report_json_sha256: record.report_json_sha256,
        run_seal_sig: record.run_seal_sig,
        status: record.status
      });
  }

  insertAssuranceRun(
    record: Omit<AssuranceRunRecord, "ts"> & { ts?: number }
  ): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO assurance_runs
         (assurance_run_id, agent_id, ts, window_start_ts, window_end_ts, mode, pack_ids_json, report_json_sha256, run_seal_sig, status)
         VALUES (@assurance_run_id, @agent_id, @ts, @window_start_ts, @window_end_ts, @mode, @pack_ids_json, @report_json_sha256, @run_seal_sig, @status)`
      )
      .run({
        assurance_run_id: record.assurance_run_id,
        agent_id: record.agent_id,
        ts: record.ts ?? Date.now(),
        window_start_ts: record.window_start_ts,
        window_end_ts: record.window_end_ts,
        mode: record.mode,
        pack_ids_json: record.pack_ids_json,
        report_json_sha256: record.report_json_sha256,
        run_seal_sig: record.run_seal_sig,
        status: record.status
      });
  }

  signRunHash(hashHex: string): string {
    return signHexDigest(hashHex, this.auditorPrivateKey());
  }

  getEventsBetween(startTs: number, endTs: number): EvidenceEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM evidence_events WHERE ts >= ? AND ts <= ? ORDER BY rowid ASC`
      )
      .all(startTs, endTs) as EvidenceEvent[];
  }

  getSessionsBetween(startTs: number, endTs: number): SessionRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM sessions WHERE started_ts <= ? AND COALESCE(ended_ts, started_ts) >= ? ORDER BY started_ts ASC`
      )
      .all(endTs, startTs) as SessionRecord[];
  }

  getRun(runId: string): RunRecord | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as RunRecord | undefined;
    return row ?? null;
  }

  getEventById(eventId: string): EvidenceEvent | null {
    const row = this.db
      .prepare("SELECT * FROM evidence_events WHERE id = ?")
      .get(eventId) as EvidenceEvent | undefined;
    return row ?? null;
  }

  listRuns(): RunRecord[] {
    return this.db.prepare("SELECT * FROM runs ORDER BY ts DESC").all() as RunRecord[];
  }

  getAssuranceRun(assuranceRunId: string): AssuranceRunRecord | null {
    const row = this.db
      .prepare("SELECT * FROM assurance_runs WHERE assurance_run_id = ?")
      .get(assuranceRunId) as AssuranceRunRecord | undefined;
    return row ?? null;
  }

  listAssuranceRuns(agentId?: string): AssuranceRunRecord[] {
    if (agentId && agentId.length > 0) {
      return this.db
        .prepare("SELECT * FROM assurance_runs WHERE agent_id = ? ORDER BY ts DESC")
        .all(agentId) as AssuranceRunRecord[];
    }
    return this.db
      .prepare("SELECT * FROM assurance_runs ORDER BY ts DESC")
      .all() as AssuranceRunRecord[];
  }

  getAllEvents(): EvidenceEvent[] {
    return this.db.prepare("SELECT * FROM evidence_events ORDER BY rowid ASC").all() as EvidenceEvent[];
  }

  getRetentionEligibleEvents(params: {
    archiveBeforeTs: number;
    pruneBeforeTs: number;
  }): {
    archive: EvidenceEvent[];
    prune: EvidenceEvent[];
  } {
    const archive = this.db
      .prepare(
        `SELECT * FROM evidence_events
         WHERE ts < ? AND archived = 0
         ORDER BY rowid ASC`
      )
      .all(params.archiveBeforeTs) as EvidenceEvent[];
    const prune = this.db
      .prepare(
        `SELECT * FROM evidence_events
         WHERE ts < ? AND payload_pruned = 0
         ORDER BY rowid ASC`
      )
      .all(params.pruneBeforeTs) as EvidenceEvent[];
    return { archive, prune };
  }

  markEventsArchived(eventIds: string[], segmentId: string, manifestSha256: string): void {
    if (eventIds.length === 0) {
      return;
    }
    const stmt = this.db.prepare(
      `UPDATE evidence_events
       SET archived = 1,
           archive_segment_id = ?,
           archive_manifest_sha256 = ?
       WHERE id = ?`
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(segmentId, manifestSha256, id);
      }
    });
    tx(eventIds);
  }

  pruneEventPayloadColumns(eventIds: string[], prunedTs: number): void {
    if (eventIds.length === 0) {
      return;
    }
    const stmt = this.db.prepare(
      `UPDATE evidence_events
       SET payload_path = NULL,
           payload_inline = NULL,
           payload_pruned = 1,
           payload_pruned_ts = ?
       WHERE id = ?`
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(prunedTs, id);
      }
    });
    tx(eventIds);
  }

  listBlobReferences(): Array<{
    id: string;
    ts: number;
    blob_ref: string | null;
    canonical_payload_path: string | null;
    payload_pruned: number;
    payload_pruned_ts: number | null;
  }> {
    return this.db
      .prepare(
        `SELECT id, ts, blob_ref, canonical_payload_path, payload_pruned, payload_pruned_ts
         FROM evidence_events
         WHERE blob_ref IS NOT NULL AND blob_ref != ''
         ORDER BY ts ASC, id ASC`
      )
      .all() as Array<{
      id: string;
      ts: number;
      blob_ref: string | null;
      canonical_payload_path: string | null;
      payload_pruned: number;
      payload_pruned_ts: number | null;
    }>;
  }

  dbSizeBytes(): number {
    const pageCount = Number(this.db.pragma("page_count", { simple: true }) ?? 0);
    const pageSize = Number(this.db.pragma("page_size", { simple: true }) ?? 0);
    return pageCount * pageSize;
  }

  getAllSessions(): SessionRecord[] {
    return this.db.prepare("SELECT * FROM sessions ORDER BY started_ts ASC").all() as SessionRecord[];
  }

  getAllRuns(): RunRecord[] {
    return this.db.prepare("SELECT * FROM runs ORDER BY ts ASC").all() as RunRecord[];
  }

  getAllAssuranceRuns(): AssuranceRunRecord[] {
    return this.db
      .prepare("SELECT * FROM assurance_runs ORDER BY ts ASC")
      .all() as AssuranceRunRecord[];
  }

  getOutcomeEventsBetween(startTs: number, endTs: number, agentId?: string): OutcomeEvent[] {
    if (agentId && agentId.length > 0) {
      return this.db
        .prepare(
          `SELECT * FROM outcome_events
           WHERE ts >= ? AND ts <= ? AND agent_id = ?
           ORDER BY rowid ASC`
        )
        .all(startTs, endTs, agentId) as OutcomeEvent[];
    }
    return this.db
      .prepare(
        `SELECT * FROM outcome_events
         WHERE ts >= ? AND ts <= ?
         ORDER BY rowid ASC`
      )
      .all(startTs, endTs) as OutcomeEvent[];
  }

  getAllOutcomeEvents(): OutcomeEvent[] {
    return this.db
      .prepare("SELECT * FROM outcome_events ORDER BY rowid ASC")
      .all() as OutcomeEvent[];
  }

  listOutcomeContracts(agentId?: string): OutcomeContractRecord[] {
    if (agentId && agentId.length > 0) {
      return this.db
        .prepare("SELECT * FROM outcome_contracts WHERE agent_id = ? ORDER BY created_ts DESC")
        .all(agentId) as OutcomeContractRecord[];
    }
    return this.db
      .prepare("SELECT * FROM outcome_contracts ORDER BY created_ts DESC")
      .all() as OutcomeContractRecord[];
  }
}

export function openLedger(workspacePath: string): Ledger {
  return new Ledger(workspacePath);
}

function verifyEvents(ledger: Ledger, workspace: string, errors: string[]): void {
  const events = ledger.getAllEvents();
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const eventByHash = new Map<string, EvidenceEvent>();
  for (const event of events) {
    eventByHash.set(event.event_hash, event);
  }

  let previous = "GENESIS";
  for (const event of events) {
    if (event.payload_pruned !== 1) {
      if (event.payload_inline !== null) {
        const payloadSha = sha256Hex(Buffer.from(event.payload_inline, "utf8"));
        if (payloadSha !== event.payload_sha256) {
          errors.push(`Event ${event.id} payload hash mismatch`);
        }
      } else {
        const payloadPath = event.payload_path ?? event.canonical_payload_path ?? null;
        if (payloadPath !== null) {
          const full = join(workspace, payloadPath);
          if (!pathExists(full)) {
            errors.push(`Missing blob file for event ${event.id}: ${full}`);
          } else {
            const metadata = loadBlobMetadata(workspace, payloadPath);
            if (metadata.payloadSha256 !== event.payload_sha256) {
              errors.push(`Event ${event.id} payload hash mismatch`);
            }
          }
        } else if (event.payload_sha256 !== sha256Hex(Buffer.alloc(0))) {
          errors.push(`Event ${event.id} payload hash mismatch`);
        }
      }
    } else {
      const path = event.canonical_payload_path ?? event.payload_path;
      if (path && pathExists(join(workspace, path))) {
        const metadata = loadBlobMetadata(workspace, path);
        if (metadata.payloadSha256 !== event.payload_sha256) {
          errors.push(`Event ${event.id} pruned payload hash mismatch`);
        }
      }
    }

    if (event.prev_event_hash !== previous) {
      errors.push(`Event ${event.id} previous hash mismatch`);
    }

    const canonicalMetadata = canonicalMetadataForHash({
      id: event.id,
      ts: event.ts,
      sessionId: event.session_id,
      runtime: event.runtime,
      eventType: event.event_type,
      payloadPath: event.canonical_payload_path ?? event.payload_path,
      payloadInline: event.canonical_payload_inline ?? event.payload_inline,
      metaJson: event.meta_json
    });

    const recalculated = sha256Hex(`${event.prev_event_hash}${canonicalMetadata}${event.payload_sha256}`);
    if (recalculated !== event.event_hash) {
      errors.push(`Event ${event.id} event_hash mismatch`);
    }

    if (!verifyHexDigestAny(event.event_hash, event.writer_sig, monitorKeys)) {
      errors.push(`Event ${event.id} writer signature invalid`);
    }

    try {
      const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
      if (typeof meta.receipt === "string" && meta.receipt.length > 0) {
        const verifyReceiptResult = verifyReceipt(meta.receipt, monitorKeys);
        if (!verifyReceiptResult.ok || !verifyReceiptResult.payload) {
          errors.push(`Event ${event.id} receipt verification failed: ${verifyReceiptResult.error ?? "unknown"}`);
        } else {
          const payload = verifyReceiptResult.payload;
          if (payload.event_hash !== event.event_hash) {
            errors.push(`Event ${event.id} receipt event_hash mismatch`);
          }
          if (payload.session_id !== event.session_id) {
            errors.push(`Event ${event.id} receipt session mismatch`);
          }
          if (typeof meta.receipt_id === "string" && meta.receipt_id !== payload.receipt_id) {
            errors.push(`Event ${event.id} receipt_id mismatch`);
          }
          const expectedBodySha =
            typeof meta.bodySha256 === "string" && meta.bodySha256.length === 64
              ? meta.bodySha256
              : event.payload_sha256;
          if (payload.body_sha256 !== expectedBodySha) {
            errors.push(`Event ${event.id} receipt body_sha256 mismatch`);
          }
          if (typeof meta.receipt_sha256 === "string") {
            const actualReceiptSha = sha256Hex(Buffer.from(meta.receipt, "utf8"));
            if (actualReceiptSha !== meta.receipt_sha256) {
              errors.push(`Event ${event.id} receipt_sha256 mismatch`);
            }
          }
          if (!eventByHash.has(payload.event_hash)) {
            errors.push(`Event ${event.id} receipt references missing event_hash`);
          }
        }
      }
    } catch {
      // non-JSON or invalid meta is handled elsewhere.
    }

    previous = event.event_hash;
  }
}

function verifySessions(ledger: Ledger, workspace: string, errors: string[]): void {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const sessions = ledger.getAllSessions();

  for (const session of sessions) {
    if (!session.session_final_event_hash || !session.session_seal_sig) {
      errors.push(`Session ${session.session_id} missing seal`);
      continue;
    }

    if (!verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, monitorKeys)) {
      errors.push(`Session ${session.session_id} seal signature invalid`);
    }
  }
}

function verifyRuns(ledger: Ledger, workspace: string, errors: string[]): void {
  const auditorKeys = getPublicKeyHistory(workspace, "auditor");
  const runs = ledger.getAllRuns();
  for (const run of runs) {
    if (!verifyHexDigestAny(run.report_json_sha256, run.run_seal_sig, auditorKeys)) {
      errors.push(`Run ${run.run_id} seal signature invalid`);
    }
  }

  const assuranceRuns = ledger.getAllAssuranceRuns();
  for (const run of assuranceRuns) {
    if (!verifyHexDigestAny(run.report_json_sha256, run.run_seal_sig, auditorKeys)) {
      errors.push(`Assurance run ${run.assurance_run_id} seal signature invalid`);
    }
  }
}

function verifyOutcomeEvents(ledger: Ledger, workspace: string, errors: string[]): void {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const rows = ledger.getAllOutcomeEvents();
  let previous = "GENESIS_OUTCOME";
  for (const row of rows) {
    if (row.prev_event_hash !== previous) {
      errors.push(`Outcome event ${row.outcome_event_id} previous hash mismatch`);
    }
    const metaJson = row.meta_json;
    let parsedValue: unknown = row.value;
    try {
      parsedValue = JSON.parse(row.value);
    } catch {
      parsedValue = row.value;
    }
    const recalculated = sha256Hex(
      `${row.prev_event_hash}${canonicalize({
        outcome_event_id: row.outcome_event_id,
        ts: row.ts,
        agent_id: row.agent_id,
        work_order_id: row.work_order_id,
        category: row.category,
        metric_id: row.metric_id,
        value: parsedValue,
        unit: row.unit,
        trust_tier: row.trust_tier,
        source: row.source,
        meta_json: metaJson,
        payload_sha256: row.payload_sha256
      })}`
    );
    if (recalculated !== row.event_hash) {
      errors.push(`Outcome event ${row.outcome_event_id} event_hash mismatch`);
    }
    if (!verifyHexDigestAny(row.event_hash, row.signature, monitorKeys)) {
      errors.push(`Outcome event ${row.outcome_event_id} signature invalid`);
    }
    const verifiedReceipt = verifyReceipt(row.receipt, monitorKeys);
    if (!verifiedReceipt.ok || !verifiedReceipt.payload) {
      errors.push(`Outcome event ${row.outcome_event_id} receipt invalid`);
    } else {
      if (verifiedReceipt.payload.event_hash !== row.event_hash) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt event hash mismatch`);
      }
      if (verifiedReceipt.payload.body_sha256 !== row.payload_sha256) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt payload hash mismatch`);
      }
      if (verifiedReceipt.payload.receipt_id !== row.receipt_id) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt id mismatch`);
      }
    }
    previous = row.event_hash;
  }
}

function verifyTargets(workspace: string, errors: string[]): void {
  const auditorKeys = getPublicKeyHistory(workspace, "auditor");
  const dir = targetsDir(workspace);
  if (!pathExists(dir)) {
    return;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".target.json"));

  for (const file of files) {
    const full = join(dir, file);
    const raw = readFileSync(full, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const signature = String(parsed.signature ?? "");
    const clone = { ...parsed };
    delete clone.signature;
    const digest = sha256Hex(canonicalize(clone));

    if (!verifyHexDigestAny(digest, signature, auditorKeys)) {
      errors.push(`Target profile signature invalid: ${file}`);
    }
  }
}

function verifyFleetAndAgents(workspace: string, errors: string[]): void {
  const fleetSig = verifyFleetConfigSignature(workspace);
  if (fleetSig.signatureExists && !fleetSig.valid) {
    errors.push(`Fleet config signature invalid: ${fleetSig.reason ?? "unknown reason"}`);
  }

  const actionPolicySig = verifyActionPolicySignature(workspace);
  if (actionPolicySig.signatureExists && !actionPolicySig.valid) {
    errors.push(`Action policy signature invalid: ${actionPolicySig.reason ?? "unknown reason"}`);
  }

  const toolsSig = verifyToolsConfigSignature(workspace);
  if (toolsSig.signatureExists && !toolsSig.valid) {
    errors.push(`Tools config signature invalid: ${toolsSig.reason ?? "unknown reason"}`);
  }

  const agents = listAgents(workspace);
  for (const agent of agents) {
    if (!agent.hasConfig) {
      continue;
    }
    const sig = verifyAgentConfigSignature(workspace, agent.id);
    if (!sig.valid) {
      errors.push(`Agent config signature invalid for ${agent.id}: ${sig.reason ?? "unknown reason"}`);
    }

    for (const row of listWorkOrders({ workspace, agentId: agent.id })) {
      const verify = verifyWorkOrder({ workspace, agentId: agent.id, workOrderId: row.workOrderId });
      if (!verify.valid) {
        errors.push(`Work order signature invalid for ${agent.id}/${row.workOrderId}: ${verify.reason ?? "unknown reason"}`);
      }
    }
  }
}

export async function verifyLedgerIntegrity(workspacePath: string): Promise<VerifyResult> {
  const ledger = openLedger(workspacePath);
  const errors: string[] = [];

  try {
    verifyEvents(ledger, workspacePath, errors);
    verifySessions(ledger, workspacePath, errors);
    verifyRuns(ledger, workspacePath, errors);
    verifyOutcomeEvents(ledger, workspacePath, errors);
    verifyTargets(workspacePath, errors);
    verifyFleetAndAgents(workspacePath, errors);
    const gatewaySig = verifyGatewayConfigSignature(workspacePath);
    if (gatewaySig.signatureExists && !gatewaySig.valid) {
      errors.push(`Gateway config signature invalid: ${gatewaySig.reason ?? "unknown reason"}`);
    }
  } finally {
    ledger.close();
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function hashBinaryOrPath(binaryPath: string, versionOutput: string | null): string {
  if (pathExists(binaryPath)) {
    try {
      const bytes = readFileSync(binaryPath);
      return sha256Hex(bytes);
    } catch {
      // fallback below
    }
  }
  return sha256Hex(`${binaryPath}|${versionOutput ?? "unknown"}`);
}

export function detectTrustBoundaryViolation(workspace: string, config: AMCConfig): {
  violated: boolean;
  message: string | null;
} {
  if (config.security.trustBoundaryMode !== "isolated") {
    return {
      violated: true,
      message:
        "trust boundary violated: runtime and signing keys are not marked isolated (set security.trustBoundaryMode=isolated only when monitor/auditor keys are isolated from evaluated agent)"
    };
  }
  return { violated: false, message: null };
}
