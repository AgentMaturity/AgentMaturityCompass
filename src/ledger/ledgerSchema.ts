/**
 * The evidence ledger's schema and its migrations.
 *
 * Split out of ledger.ts as part of P2.1's decomposition: five hundred lines of
 * DDL sat between the connection helpers and the writers, so a reader after
 * either had to scroll past all of it.
 *
 * Two properties this file must keep. Migrations are append-only and never
 * edited in place — an installed workspace has already applied the old text,
 * so changing it changes nothing there while diverging from every new install.
 * And each runs inside a transaction, because a migration that half-applies
 * leaves a schema that matches no version number and cannot be reasoned about.
 */
import type Database from "better-sqlite3";

export interface Migration {
  version: number;
  sql: string;
}

export function hasTable(db: Database.Database, tableName: string): boolean {
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
  },
  {
    version: 8,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_events_ts ON evidence_events(ts);
      CREATE INDEX IF NOT EXISTS idx_events_id_ts ON evidence_events(id, ts);
      CREATE INDEX IF NOT EXISTS idx_runs_ts ON runs(ts);
      CREATE INDEX IF NOT EXISTS idx_outcome_events_agent_ts_desc ON outcome_events(agent_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_claims_agent_state_created_ts ON claims(agent_id, lifecycle_state, created_ts DESC);
      CREATE INDEX IF NOT EXISTS idx_claims_state_last_verified_ts ON claims(lifecycle_state, last_verified_ts DESC);
    `
  },
  {
    version: 9,
    sql: `
      DROP TRIGGER IF EXISTS no_update_sessions;
      DROP TRIGGER IF EXISTS no_delete_sessions;

      CREATE TRIGGER IF NOT EXISTS protect_sessions_core_immutable
      BEFORE UPDATE ON sessions
      WHEN
        OLD.session_id != NEW.session_id OR
        OLD.started_ts != NEW.started_ts OR
        OLD.runtime != NEW.runtime OR
        COALESCE(OLD.binary_path, '') != COALESCE(NEW.binary_path, '') OR
        COALESCE(OLD.binary_sha256, '') != COALESCE(NEW.binary_sha256, '')
      BEGIN
        SELECT RAISE(ABORT, 'sessions core fields are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS protect_sessions_seal_consistency
      BEFORE UPDATE ON sessions
      WHEN
        (NEW.session_final_event_hash IS NULL AND NEW.session_seal_sig IS NOT NULL) OR
        (NEW.session_final_event_hash IS NOT NULL AND NEW.session_seal_sig IS NULL) OR
        (NEW.session_final_event_hash IS NOT NULL AND NEW.ended_ts IS NULL)
      BEGIN
        SELECT RAISE(ABORT, 'invalid session seal state');
      END;

      CREATE TRIGGER IF NOT EXISTS protect_sessions_sealed_immutable
      BEFORE UPDATE ON sessions
      WHEN
        OLD.session_final_event_hash IS NOT NULL OR OLD.session_seal_sig IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'sealed sessions are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS no_delete_sessions
      BEFORE DELETE ON sessions
      BEGIN
        SELECT RAISE(ABORT, 'sessions are append-only');
      END;
    `
  },
  {
    version: 10,
    sql: `
      CREATE TABLE IF NOT EXISTS bridge_request_usage (
        request_id TEXT PRIMARY KEY,
        lease_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        route TEXT NOT NULL,
        ts INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_bridge_request_usage_lease_ts
        ON bridge_request_usage(lease_id, ts);
      CREATE INDEX IF NOT EXISTS idx_bridge_request_usage_ts
        ON bridge_request_usage(ts);
    `
  }
];

export function reconcileLegacyMigrationState(db: Database.Database): void {
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

export function runMigrations(db: Database.Database): void {
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
