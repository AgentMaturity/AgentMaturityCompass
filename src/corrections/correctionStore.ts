import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";
import type { CorrectionEvent, CorrectionStatus } from "./correctionTypes.js";

/**
 * SQLite store for corrections and effectiveness tracking
 */

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName) as { 1: number } | undefined;
  return row !== undefined;
}

function ensureEvidenceCorrectionTables(db: Database.Database): void {
  db.exec(`
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
  `);
}

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

    DROP TRIGGER IF EXISTS protect_corrections_immutable;
    CREATE TRIGGER IF NOT EXISTS protect_corrections_immutable
    BEFORE UPDATE ON corrections
    WHEN
      OLD.correction_id != NEW.correction_id OR
      OLD.agent_id != NEW.agent_id OR
      OLD.trigger_type != NEW.trigger_type OR
      OLD.trigger_id != NEW.trigger_id OR
      COALESCE(OLD.question_ids_json, '') != COALESCE(NEW.question_ids_json, '') OR
      COALESCE(OLD.correction_description, '') != COALESCE(NEW.correction_description, '') OR
      COALESCE(OLD.applied_action, '') != COALESCE(NEW.applied_action, '') OR
      COALESCE(OLD.baseline_run_id, '') != COALESCE(NEW.baseline_run_id, '') OR
      COALESCE(OLD.baseline_levels_json, '') != COALESCE(NEW.baseline_levels_json, '') OR
      COALESCE(OLD.prev_correction_hash, '') != COALESCE(NEW.prev_correction_hash, '') OR
      OLD.created_ts != NEW.created_ts
    BEGIN
      SELECT RAISE(ABORT, 'corrections immutable fields changed');
    END;

    CREATE TRIGGER IF NOT EXISTS no_delete_corrections
    BEFORE DELETE ON corrections
    BEGIN
      SELECT RAISE(ABORT, 'corrections cannot be deleted');
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
 * Update verification fields for a correction while preserving immutable fields.
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
  signature: string,
  opts?: { workspace?: string }
): void {
  const updatedTs = Date.now();
  const updated = db
    .prepare(
      `UPDATE corrections
       SET status = ?,
           verification_run_id = ?,
           verification_levels_json = ?,
           effectiveness_score = ?,
           verified_ts = ?,
           verified_by = ?,
           updated_ts = ?,
           correction_hash = ?,
           signature = ?
       WHERE correction_id = ?`
    )
    .run(
      status,
      verificationRunId,
      JSON.stringify(verificationLevels),
      effectivenessScore,
      verifiedTs,
      verifiedBy,
      updatedTs,
      correctionHash,
      signature,
      correctionId
    );

  if ((updated.changes ?? 0) <= 0) {
    throw new Error(`Correction not found: ${correctionId}`);
  }

  if (
    opts?.workspace &&
    (status === "VERIFIED_EFFECTIVE" || status === "VERIFIED_INEFFECTIVE")
  ) {
    markLinkedEvidenceAsCorrected(db, {
      correctionId,
      status,
      verifiedTs,
      verifiedBy,
      workspace: opts.workspace
    });
  }
}

function linkedEvidenceIdsForCorrection(db: Database.Database, correction: CorrectionEvent): string[] {
  const linked = new Set<string>();
  if (!tableExists(db, "evidence_events")) {
    return [];
  }

  const eventExists = db.prepare("SELECT 1 FROM evidence_events WHERE id = ? LIMIT 1");
  if (eventExists.get(correction.triggerId)) {
    linked.add(correction.triggerId);
  }

  if (tableExists(db, "evidence_incident_links")) {
    const rows = db
      .prepare("SELECT event_id FROM evidence_incident_links WHERE incident_id = ? ORDER BY created_ts ASC")
      .all(correction.triggerId) as Array<{ event_id: string }>;
    for (const row of rows) {
      if (row.event_id && row.event_id.length > 0) {
        linked.add(row.event_id);
      }
    }
  }

  if (tableExists(db, "causal_edges")) {
    const rows = db
      .prepare("SELECT from_event_id, to_event_id FROM causal_edges WHERE incident_id = ? ORDER BY added_ts ASC")
      .all(correction.triggerId) as Array<{ from_event_id: string; to_event_id: string }>;
    for (const row of rows) {
      if (row.from_event_id && eventExists.get(row.from_event_id)) {
        linked.add(row.from_event_id);
      }
      if (row.to_event_id && eventExists.get(row.to_event_id)) {
        linked.add(row.to_event_id);
      }
    }
  }

  return [...linked].sort((a, b) => a.localeCompare(b));
}

export interface MarkLinkedEvidenceResult {
  correctionId: string;
  linkedEvidenceIds: string[];
  markedCount: number;
}

const correctionTriggerTypeSchema = z.enum([
  "OWNER_MANUAL",
  "ASSURANCE_FAILURE",
  "DRIFT_EVENT",
  "EXPERIMENT_RESULT",
  "INCIDENT_RESPONSE",
  "POLICY_CHANGE"
]);

const correctionStatusSchema = z.enum([
  "APPLIED",
  "PENDING_VERIFICATION",
  "VERIFIED_EFFECTIVE",
  "VERIFIED_INEFFECTIVE",
  "SUPERSEDED"
]);

const correctionDbRowSchema = z.object({
  correction_id: z.string(),
  agent_id: z.string(),
  trigger_type: correctionTriggerTypeSchema,
  trigger_id: z.string(),
  question_ids_json: z.string(),
  correction_description: z.string(),
  applied_action: z.string(),
  status: correctionStatusSchema,
  baseline_run_id: z.string(),
  baseline_levels_json: z.string(),
  verification_run_id: z.string().nullable(),
  verification_levels_json: z.string().nullable(),
  effectiveness_score: z.number().nullable(),
  verified_ts: z.number().nullable(),
  verified_by: z.string().nullable(),
  created_ts: z.number(),
  updated_ts: z.number(),
  prev_correction_hash: z.string(),
  correction_hash: z.string(),
  signature: z.string()
});

const correctionQuestionIdsSchema = z.array(z.string());
const correctionLevelsSchema = z.record(z.number());

function parseJsonField<T>(fieldName: string, raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid ${fieldName}: malformed JSON`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues[0]?.message ?? "schema mismatch";
    throw new Error(`Invalid ${fieldName}: ${detail}`);
  }
  return result.data;
}

export function markLinkedEvidenceAsCorrected(
  db: Database.Database,
  params: {
    correctionId: string;
    status: CorrectionStatus;
    verifiedTs: number;
    verifiedBy: string;
    workspace: string;
  }
): MarkLinkedEvidenceResult {
  if (params.status !== "VERIFIED_EFFECTIVE" && params.status !== "VERIFIED_INEFFECTIVE") {
    return {
      correctionId: params.correctionId,
      linkedEvidenceIds: [],
      markedCount: 0
    };
  }

  const correction = getCorrectionById(db, params.correctionId);
  if (!correction) {
    throw new Error(`Correction not found: ${params.correctionId}`);
  }

  ensureEvidenceCorrectionTables(db);
  const linkedEvidenceIds = linkedEvidenceIdsForCorrection(db, correction);
  if (linkedEvidenceIds.length === 0) {
    return {
      correctionId: params.correctionId,
      linkedEvidenceIds,
      markedCount: 0
    };
  }

  const privateKey = getPrivateKeyPem(params.workspace, "monitor");
  const insert = db.prepare(
    `INSERT OR IGNORE INTO evidence_corrections
     (link_id, evidence_event_id, correction_id, status, verified_ts, verified_by, source, created_ts, signature)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  let markedCount = 0;
  for (const evidenceEventId of linkedEvidenceIds) {
    const createdTs = Date.now();
    const linkId = `evcorr_${randomUUID().replace(/-/g, "")}`;
    const payload = canonicalize({
      link_id: linkId,
      evidence_event_id: evidenceEventId,
      correction_id: params.correctionId,
      status: params.status,
      verified_ts: params.verifiedTs,
      verified_by: params.verifiedBy,
      source: "CORRECTION_VERIFICATION",
      created_ts: createdTs
    });
    const signature = signHexDigest(sha256Hex(payload), privateKey);
    const result = insert.run(
      linkId,
      evidenceEventId,
      params.correctionId,
      params.status,
      params.verifiedTs,
      params.verifiedBy,
      "CORRECTION_VERIFICATION",
      createdTs,
      signature
    );
    markedCount += Number(result.changes ?? 0);
  }

  return {
    correctionId: params.correctionId,
    linkedEvidenceIds,
    markedCount
  };
}

function rowToCorrection(row: Record<string, unknown>): CorrectionEvent {
  const parsedRow = correctionDbRowSchema.parse(row);
  return {
    correctionId: parsedRow.correction_id,
    agentId: parsedRow.agent_id,
    triggerType: parsedRow.trigger_type,
    triggerId: parsedRow.trigger_id,
    questionIds: parseJsonField("question_ids_json", parsedRow.question_ids_json, correctionQuestionIdsSchema),
    correctionDescription: parsedRow.correction_description,
    appliedAction: parsedRow.applied_action,
    status: parsedRow.status as CorrectionStatus,
    baselineRunId: parsedRow.baseline_run_id,
    baselineLevels: parseJsonField("baseline_levels_json", parsedRow.baseline_levels_json, correctionLevelsSchema),
    verificationRunId: parsedRow.verification_run_id,
    verificationLevels: parsedRow.verification_levels_json
      ? parseJsonField("verification_levels_json", parsedRow.verification_levels_json, correctionLevelsSchema)
      : null,
    effectivenessScore: parsedRow.effectiveness_score,
    verifiedTs: parsedRow.verified_ts,
    verifiedBy: parsedRow.verified_by,
    createdTs: parsedRow.created_ts,
    updatedTs: parsedRow.updated_ts,
    prev_correction_hash: parsedRow.prev_correction_hash,
    correction_hash: parsedRow.correction_hash,
    signature: parsedRow.signature
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
  let query = "SELECT * FROM corrections WHERE agent_id = ?";
  const params: unknown[] = [agentId];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }

  query += " ORDER BY created_ts DESC";

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToCorrection);
}

/**
 * Get all corrections affecting a specific question
 */
export function getCorrectionsByQuestion(
  db: Database.Database,
  agentId: string,
  questionId: string
): CorrectionEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM corrections
    WHERE agent_id = ? AND question_ids_json LIKE ?
    ORDER BY created_ts DESC
  `);

  const rows = stmt.all(agentId, `%"${questionId}"%`) as Array<Record<string, unknown>>;
  return rows.map(rowToCorrection);
}

/**
 * Get all pending corrections (APPLIED or PENDING_VERIFICATION status)
 */
export function getPendingCorrections(db: Database.Database, agentId: string): CorrectionEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM corrections
    WHERE agent_id = ? AND (status = 'APPLIED' OR status = 'PENDING_VERIFICATION')
    ORDER BY created_ts ASC
  `);

  const rows = stmt.all(agentId) as Array<Record<string, unknown>>;
  return rows.map(rowToCorrection);
}

/**
 * Get the most recent correction hash for an agent
 */
export function getLastCorrectionHash(db: Database.Database, agentId: string): string {
  const row = db
    .prepare("SELECT correction_hash FROM corrections WHERE agent_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(agentId) as { correction_hash: string } | undefined;
  return row?.correction_hash ?? "GENESIS_CORRECTION";
}

/**
 * Get a single correction by ID
 */
export function getCorrectionById(db: Database.Database, correctionId: string): CorrectionEvent | null {
  const stmt = db.prepare("SELECT * FROM corrections WHERE correction_id = ?");
  const row = stmt.get(correctionId) as Record<string, unknown> | undefined;
  return row ? rowToCorrection(row) : null;
}

/**
 * Get all verified corrections (those with verification results)
 */
export function getVerifiedCorrections(db: Database.Database, agentId: string): CorrectionEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM corrections
    WHERE agent_id = ? AND (status = 'VERIFIED_EFFECTIVE' OR status = 'VERIFIED_INEFFECTIVE')
    ORDER BY verified_ts DESC
  `);

  const rows = stmt.all(agentId) as Array<Record<string, unknown>>;
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
  const stmt = db.prepare(`
    SELECT * FROM corrections
    WHERE agent_id = ? AND trigger_type = ?
    ORDER BY created_ts DESC
  `);

  const rows = stmt.all(agentId, triggerType) as Array<Record<string, unknown>>;
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
  const stmt = db.prepare(`
    SELECT * FROM corrections
    WHERE agent_id = ? AND created_ts >= ? AND created_ts <= ?
    ORDER BY created_ts DESC
  `);

  const rows = stmt.all(agentId, windowStartTs, windowEndTs) as Array<Record<string, unknown>>;
  return rows.map(rowToCorrection);
}
