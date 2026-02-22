import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { CorrectionEvent, CorrectionStatus } from "./correctionTypes.js";

/**
 * SQLite store for corrections and effectiveness tracking
 */

export function initCorrectionTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS corrections (
      correction_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_id TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      correction_description TEXT NOT NULL,
      applied_action TEXT NOT NULL,
      status TEXT NOT NULL,
      baseline_run_id TEXT NOT NULL,
      baseline_levels_json TEXT NOT NULL,
      verification_run_id TEXT,
      verification_levels_json TEXT,
      effectiveness_score REAL,
      verified_ts INTEGER,
      verified_by TEXT,
      created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL,
      prev_correction_hash TEXT NOT NULL,
      correction_hash TEXT NOT NULL,
      signature TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_corrections_agent ON corrections(agent_id);
    CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections(status);
    CREATE INDEX IF NOT EXISTS idx_corrections_trigger ON corrections(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_corrections_created_ts ON corrections(created_ts);

    CREATE TABLE IF NOT EXISTS corrections_verification (
      verification_event_id TEXT PRIMARY KEY,
      correction_id TEXT NOT NULL,
      verification_run_id TEXT NOT NULL,
      verification_levels_json TEXT NOT NULL,
      effectiveness_score REAL NOT NULL,
      status TEXT NOT NULL,
      verified_ts INTEGER NOT NULL,
      verified_by TEXT NOT NULL,
      created_ts INTEGER NOT NULL,
      correction_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      FOREIGN KEY (correction_id) REFERENCES corrections(correction_id)
    );

    CREATE INDEX IF NOT EXISTS idx_corrections_verification_correction
      ON corrections_verification(correction_id, created_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_corrections_verification_created_ts
      ON corrections_verification(created_ts);

    CREATE TRIGGER IF NOT EXISTS protect_corrections_immutable
    BEFORE UPDATE ON corrections
    BEGIN
      SELECT RAISE(ABORT, 'corrections are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_corrections
    BEFORE DELETE ON corrections
    BEGIN
      SELECT RAISE(ABORT, 'corrections cannot be deleted');
    END;

    CREATE TRIGGER IF NOT EXISTS protect_corrections_verification_immutable
    BEFORE UPDATE ON corrections_verification
    BEGIN
      SELECT RAISE(ABORT, 'corrections_verification is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_corrections_verification
    BEFORE DELETE ON corrections_verification
    BEGIN
      SELECT RAISE(ABORT, 'corrections_verification cannot be deleted');
    END;
  `);
}

export function insertCorrection(db: Database.Database, correction: CorrectionEvent): void {
  const stmt = db.prepare(`
    INSERT INTO corrections (
      correction_id,
      agent_id,
      trigger_type,
      trigger_id,
      question_ids_json,
      correction_description,
      applied_action,
      status,
      baseline_run_id,
      baseline_levels_json,
      verification_run_id,
      verification_levels_json,
      effectiveness_score,
      verified_ts,
      verified_by,
      created_ts,
      updated_ts,
      prev_correction_hash,
      correction_hash,
      signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    correction.correctionId,
    correction.agentId,
    correction.triggerType,
    correction.triggerId,
    JSON.stringify(correction.questionIds),
    correction.correctionDescription,
    correction.appliedAction,
    correction.status,
    correction.baselineRunId,
    JSON.stringify(correction.baselineLevels),
    correction.verificationRunId,
    correction.verificationLevels ? JSON.stringify(correction.verificationLevels) : null,
    correction.effectivenessScore,
    correction.verifiedTs,
    correction.verifiedBy,
    correction.createdTs,
    correction.updatedTs,
    correction.prev_correction_hash,
    correction.correction_hash,
    correction.signature
  );
}

/**
 * Update correction verification via append-only shadow events.
 */
export function updateCorrectionVerification(
  db: Database.Database,
  correctionId: string,
  verificationRunId: string,
  verificationLevels: Record<string, number>,
  effectivenessScore: number,
  status: CorrectionStatus,
  verifiedTs: number,
  verifiedBy: string,
  correctionHash: string,
  signature: string
): void {
  // Ensure the correction exists before appending verification state.
  const existing = db
    .prepare("SELECT correction_id FROM corrections WHERE correction_id = ?")
    .get(correctionId) as { correction_id: string } | undefined;

  if (!existing) {
    throw new Error(`Correction not found: ${correctionId}`);
  }

  const stmt = db.prepare(`
    INSERT INTO corrections_verification (
      verification_event_id,
      correction_id,
      verification_run_id,
      verification_levels_json,
      effectiveness_score,
      status,
      verified_ts,
      verified_by,
      created_ts,
      correction_hash,
      signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    randomUUID(),
    correctionId,
    verificationRunId,
    JSON.stringify(verificationLevels),
    effectivenessScore,
    status,
    verifiedTs,
    verifiedBy,
    Date.now(),
    correctionHash,
    signature
  );
}

const CORRECTIONS_WITH_EFFECTIVE_STATE = `
  SELECT
    c.correction_id,
    c.agent_id,
    c.trigger_type,
    c.trigger_id,
    c.question_ids_json,
    c.correction_description,
    c.applied_action,
    COALESCE(v.status, c.status) AS status,
    c.baseline_run_id,
    c.baseline_levels_json,
    COALESCE(v.verification_run_id, c.verification_run_id) AS verification_run_id,
    COALESCE(v.verification_levels_json, c.verification_levels_json) AS verification_levels_json,
    COALESCE(v.effectiveness_score, c.effectiveness_score) AS effectiveness_score,
    COALESCE(v.verified_ts, c.verified_ts) AS verified_ts,
    COALESCE(v.verified_by, c.verified_by) AS verified_by,
    c.created_ts,
    COALESCE(v.created_ts, c.updated_ts) AS updated_ts,
    c.prev_correction_hash,
    COALESCE(v.correction_hash, c.correction_hash) AS correction_hash,
    COALESCE(v.signature, c.signature) AS signature
  FROM corrections c
  LEFT JOIN corrections_verification v
    ON v.verification_event_id = (
      SELECT cv.verification_event_id
      FROM corrections_verification cv
      WHERE cv.correction_id = c.correction_id
      ORDER BY cv.created_ts DESC, cv.rowid DESC
      LIMIT 1
    )
`;

function selectCorrections(
  db: Database.Database,
  whereClause: string,
  params: any[],
  orderByClause: string
): Array<Record<string, unknown>> {
  const query = `${CORRECTIONS_WITH_EFFECTIVE_STATE} ${whereClause} ${orderByClause}`;
  return db.prepare(query).all(...params) as Array<Record<string, unknown>>;
}

function rowToCorrection(row: Record<string, unknown>): CorrectionEvent {
  return {
    correctionId: row.correction_id as string,
    agentId: row.agent_id as string,
    triggerType: row.trigger_type as any,
    triggerId: row.trigger_id as string,
    questionIds: JSON.parse(row.question_ids_json as string),
    correctionDescription: row.correction_description as string,
    appliedAction: row.applied_action as string,
    status: row.status as CorrectionStatus,
    baselineRunId: row.baseline_run_id as string,
    baselineLevels: JSON.parse(row.baseline_levels_json as string),
    verificationRunId: row.verification_run_id as string | null,
    verificationLevels: row.verification_levels_json ? JSON.parse(row.verification_levels_json as string) : null,
    effectivenessScore: row.effectiveness_score as number | null,
    verifiedTs: row.verified_ts as number | null,
    verifiedBy: row.verified_by as string | null,
    createdTs: row.created_ts as number,
    updatedTs: row.updated_ts as number,
    prev_correction_hash: row.prev_correction_hash as string,
    correction_hash: row.correction_hash as string,
    signature: row.signature as string
  };
}

/**
 * Get all corrections for an agent, optionally filtered by status
 */
export function getCorrectionsByAgent(
  db: Database.Database,
  agentId: string,
  status?: CorrectionStatus
): CorrectionEvent[] {
  const rows = selectCorrections(
    db,
    "WHERE c.agent_id = ?",
    [agentId],
    "ORDER BY c.created_ts DESC"
  );
  const corrections = rows.map(rowToCorrection);
  if (!status) {
    return corrections;
  }
  return corrections.filter((correction) => correction.status === status);
}

/**
 * Get all corrections affecting a specific question
 */
export function getCorrectionsByQuestion(
  db: Database.Database,
  agentId: string,
  questionId: string
): CorrectionEvent[] {
  const rows = selectCorrections(
    db,
    "WHERE c.agent_id = ? AND c.question_ids_json LIKE ?",
    [agentId, `%"${questionId}"%`],
    "ORDER BY c.created_ts DESC"
  );
  return rows.map(rowToCorrection);
}

/**
 * Get all pending corrections (APPLIED or PENDING_VERIFICATION status)
 */
export function getPendingCorrections(db: Database.Database, agentId: string): CorrectionEvent[] {
  const rows = selectCorrections(
    db,
    `WHERE c.agent_id = ? AND COALESCE(v.status, c.status) IN ('APPLIED', 'PENDING_VERIFICATION')`,
    [agentId],
    "ORDER BY c.created_ts ASC"
  );
  return rows.map(rowToCorrection);
}

/**
 * Get the most recent correction hash for an agent
 */
export function getLastCorrectionHash(db: Database.Database, agentId: string): string {
  const row = db
    .prepare(`
      SELECT correction_hash
      FROM (
        SELECT c.correction_hash AS correction_hash, c.created_ts AS ts, c.rowid AS ord
        FROM corrections c
        WHERE c.agent_id = ?
        UNION ALL
        SELECT cv.correction_hash AS correction_hash, cv.created_ts AS ts, cv.rowid AS ord
        FROM corrections_verification cv
        JOIN corrections c ON c.correction_id = cv.correction_id
        WHERE c.agent_id = ?
      )
      ORDER BY ts DESC, ord DESC
      LIMIT 1
    `)
    .get(agentId, agentId) as { correction_hash: string } | undefined;
  return row?.correction_hash ?? "GENESIS_CORRECTION";
}

/**
 * Get a single correction by ID
 */
export function getCorrectionById(db: Database.Database, correctionId: string): CorrectionEvent | null {
  const rows = selectCorrections(
    db,
    "WHERE c.correction_id = ?",
    [correctionId],
    "ORDER BY c.created_ts DESC"
  );
  const row = rows[0];
  return row ? rowToCorrection(row) : null;
}

/**
 * Get all verified corrections (those with verification results)
 */
export function getVerifiedCorrections(db: Database.Database, agentId: string): CorrectionEvent[] {
  const rows = selectCorrections(
    db,
    `WHERE c.agent_id = ? AND COALESCE(v.status, c.status) IN ('VERIFIED_EFFECTIVE', 'VERIFIED_INEFFECTIVE')`,
    [agentId],
    "ORDER BY COALESCE(v.verified_ts, c.verified_ts) DESC, c.created_ts DESC"
  );
  return rows.map(rowToCorrection);
}

/**
 * Get corrections by trigger type
 */
export function getCorrectionsByTriggerType(
  db: Database.Database,
  agentId: string,
  triggerType: string
): CorrectionEvent[] {
  const rows = selectCorrections(
    db,
    "WHERE c.agent_id = ? AND c.trigger_type = ?",
    [agentId, triggerType],
    "ORDER BY c.created_ts DESC"
  );
  return rows.map(rowToCorrection);
}

/**
 * Get corrections in a time window
 */
export function getCorrectionsByWindow(
  db: Database.Database,
  agentId: string,
  windowStartTs: number,
  windowEndTs: number
): CorrectionEvent[] {
  const rows = selectCorrections(
    db,
    "WHERE c.agent_id = ? AND c.created_ts >= ? AND c.created_ts <= ?",
    [agentId, windowStartTs, windowEndTs],
    "ORDER BY c.created_ts DESC"
  );
  return rows.map(rowToCorrection);
}
