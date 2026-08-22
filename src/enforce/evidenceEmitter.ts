/**
 * Evidence emitter — fail-safe guard_check event writer.
 * Writes to .amc/guard_events.sqlite using better-sqlite3.
 * NEVER throws — all errors are silently logged.
 */

import { randomUUID, createHash } from "node:crypto";
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ensureSigningKeys, getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from '../crypto/keys.js';
import { canonicalize } from '../utils/json.js';
import { sha256Hex } from '../utils/hash.js';
import Database from 'better-sqlite3';
import { writeConsolidatedGuardEvent, currentStage } from '../storage/consolidation/guardEventConsolidation.js';

let _db: import('better-sqlite3').Database | null = null;
let _insertStmt: import('better-sqlite3').Statement | null = null;
let _dbPath: string | null = null;

export interface GuardEventInput {
  agentId: string;
  moduleCode: string;
  decision: 'allow' | 'deny' | 'stepup' | 'warn';
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  meta?: Record<string, unknown>;
}

export type GuardDecisionReceiptDecision = 'allow' | 'block' | 'redact' | 'step_up' | 'escalate';
export type GuardDecisionReceiptSigner = 'monitor' | 'auditor';

export interface GuardDecisionReceiptPayloadV1 {
  v: 1;
  kind: 'guard_decision';
  receiptId: string;
  ts: number;
  agentId: string;
  moduleCode: string;
  decision: GuardDecisionReceiptDecision;
  matchedRule: string;
  inputHash: string;
  outputHash: string;
  signer: GuardDecisionReceiptSigner;
  metaHash: string | null;
}

export interface GuardDecisionReceipt {
  payload: GuardDecisionReceiptPayloadV1;
  payloadHash: string;
  signature: string;
  receiptHash: string;
}

export interface EmitGuardDecisionReceiptInput {
  agentId: string;
  moduleCode: string;
  decision: GuardDecisionReceiptDecision;
  matchedRule: string;
  inputHash: string;
  outputHash: string;
  reason?: string;
  severity?: GuardEventInput['severity'];
  signer?: GuardDecisionReceiptSigner;
  workspace?: string;
  receiptId?: string;
  ts?: number;
  meta?: Record<string, unknown>;
}

export interface VerifyGuardDecisionReceiptOptions {
  publicKeys?: string[];
  workspace?: string;
}

export interface VerifyGuardDecisionReceiptResult {
  ok: boolean;
  reasons: string[];
  payload: GuardDecisionReceiptPayloadV1 | null;
}

const guardDecisionReceiptDecisions: GuardDecisionReceiptDecision[] = [
  'allow',
  'block',
  'redact',
  'step_up',
  'escalate',
];

function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function guardReceiptWorkspace(input?: string): string {
  return resolve(input ?? process.env.AMC_GUARD_RECEIPTS_WORKSPACE ?? process.env.AMC_WORKSPACE ?? process.cwd());
}

function mapReceiptDecisionToEventDecision(decision: GuardDecisionReceiptDecision): GuardEventInput['decision'] {
  if (decision === 'allow') return 'allow';
  if (decision === 'redact') return 'warn';
  if (decision === 'step_up' || decision === 'escalate') return 'stepup';
  return 'deny';
}

function defaultReceiptSeverity(decision: GuardDecisionReceiptDecision): GuardEventInput['severity'] {
  if (decision === 'allow') return 'low';
  if (decision === 'redact' || decision === 'step_up') return 'medium';
  return 'high';
}

function receiptEnvelopeHash(receipt: Omit<GuardDecisionReceipt, 'receiptHash'>): string {
  return sha256Hex(canonicalize(receipt));
}

function validateGuardDecisionReceipt(receipt: GuardDecisionReceipt): string[] {
  const reasons: string[] = [];
  const payload = receipt.payload;
  if (!payload || payload.v !== 1 || payload.kind !== 'guard_decision') {
    reasons.push('guard decision payload invalid');
    return reasons;
  }
  if (!payload.receiptId) reasons.push('receipt id missing');
  if (!payload.agentId) reasons.push('agent id missing');
  if (!payload.moduleCode) reasons.push('module code missing');
  if (!guardDecisionReceiptDecisions.includes(payload.decision)) reasons.push('decision type invalid');
  if (!payload.matchedRule) reasons.push('matched rule missing');
  if (!isSha256Hex(payload.inputHash)) reasons.push('input hash invalid');
  if (!isSha256Hex(payload.outputHash)) reasons.push('output hash invalid');
  if (payload.signer !== 'monitor' && payload.signer !== 'auditor') reasons.push('signer invalid');
  if (payload.metaHash !== null && !isSha256Hex(payload.metaHash)) reasons.push('meta hash invalid');
  if (!isSha256Hex(receipt.payloadHash)) reasons.push('payload hash invalid');
  if (!receipt.signature) reasons.push('signature missing');
  if (!isSha256Hex(receipt.receiptHash)) reasons.push('receipt hash invalid');
  return reasons;
}

export function buildGuardDecisionReceipt(input: EmitGuardDecisionReceiptInput): GuardDecisionReceipt {
  const workspace = guardReceiptWorkspace(input.workspace);
  ensureSigningKeys(workspace);
  const signer = input.signer ?? 'monitor';
  const payload: GuardDecisionReceiptPayloadV1 = {
    v: 1,
    kind: 'guard_decision',
    receiptId: input.receiptId ?? randomUUID(),
    ts: input.ts ?? Date.now(),
    agentId: input.agentId || 'unknown',
    moduleCode: input.moduleCode || 'unknown',
    decision: input.decision,
    matchedRule: input.matchedRule,
    inputHash: input.inputHash,
    outputHash: input.outputHash,
    signer,
    metaHash: input.meta ? sha256Hex(canonicalize(input.meta)) : null,
  };
  const payloadHash = sha256Hex(canonicalize(payload));
  const signature = signHexDigest(payloadHash, getPrivateKeyPem(workspace, signer));
  const receiptWithoutHash = { payload, payloadHash, signature };
  return {
    ...receiptWithoutHash,
    receiptHash: receiptEnvelopeHash(receiptWithoutHash),
  };
}

export function verifyGuardDecisionReceipt(
  receipt: GuardDecisionReceipt,
  options: VerifyGuardDecisionReceiptOptions = {},
): VerifyGuardDecisionReceiptResult {
  const reasons = validateGuardDecisionReceipt(receipt);
  const payload = receipt?.payload ?? null;
  if (!payload) {
    return { ok: false, reasons, payload: null };
  }

  const expectedPayloadHash = sha256Hex(canonicalize(payload));
  if (isSha256Hex(receipt.payloadHash) && receipt.payloadHash !== expectedPayloadHash) {
    reasons.push('payload hash mismatch');
  }
  const expectedReceiptHash = receiptEnvelopeHash({
    payload,
    payloadHash: receipt.payloadHash,
    signature: receipt.signature,
  });
  if (isSha256Hex(receipt.receiptHash) && receipt.receiptHash !== expectedReceiptHash) {
    reasons.push('receipt hash mismatch');
  }

  let publicKeys = options.publicKeys;
  if (!publicKeys && options.workspace) {
    try {
      publicKeys = getPublicKeyHistory(guardReceiptWorkspace(options.workspace), payload.signer);
    } catch {
      publicKeys = [];
    }
  }
  if (!publicKeys || publicKeys.length === 0) {
    reasons.push('public keys missing');
  } else if (isSha256Hex(receipt.payloadHash) && receipt.signature) {
    if (!verifyHexDigestAny(receipt.payloadHash, receipt.signature, publicKeys)) {
      reasons.push('signature verification failed');
    }
  }

  return { ok: reasons.length === 0, reasons, payload };
}

function getDb(): import('better-sqlite3').Database | null {
  try {
    // P2.1 consolidation. Under CUTOVER the emitter opens the evidence store
    // instead of the separate file, so every reader here — the query path, the
    // chain verifier, the retention prune — follows without knowing about the
    // move. The legacy file is left untouched and complete, which is what makes
    // reverting a setting change rather than a restore.
    const legacyPath = process.env.AMC_GUARD_EVENTS_DB_PATH
      ? resolve(process.env.AMC_GUARD_EVENTS_DB_PATH)
      : join(process.cwd(), '.amc', 'guard_events.sqlite');
    const desiredPath = currentStage() === 'CUTOVER'
      ? join(dirname(legacyPath), 'evidence.sqlite')
      : legacyPath;
    const dir = dirname(desiredPath);
    if (_db && _dbPath === desiredPath) {
      return _db;
    }

    if (_db) {
      try {
        _db.close();
      } catch {
        // best-effort close before reopening at a new workspace path
      }
      _db = null;
      _insertStmt = null;
      _dbPath = null;
    }

    mkdirSync(dir, { recursive: true });
    _db = new Database(desiredPath);
    _dbPath = desiredPath;
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS amc_guard_events (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        module_code TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'stepup', 'warn')),
        reason TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        meta_json TEXT,
        created_at TEXT NOT NULL
      )
    `);
    // Chain columns are added by ALTER so an existing store migrates in place.
    // Rows written before this migration have NULL hashes and are reported as
    // unchained rather than silently treated as verified — see
    // verifyGuardEventChain().
    for (const column of ["prev_hash TEXT", "event_hash TEXT"]) {
      try {
        _db.exec(`ALTER TABLE amc_guard_events ADD COLUMN ${column}`);
      } catch {
        // Already present.
      }
    }
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_guard_agent ON amc_guard_events(agent_id, created_at)`);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_guard_module ON amc_guard_events(module_code)`);
    _db.exec(`CREATE INDEX IF NOT EXISTS idx_guard_severity_created ON amc_guard_events(severity, created_at)`);
    _db.exec(`
      CREATE TRIGGER IF NOT EXISTS enforce_guard_decision_domain
      BEFORE INSERT ON amc_guard_events
      WHEN NEW.decision NOT IN ('allow', 'deny', 'stepup', 'warn')
      BEGIN
        SELECT RAISE(ABORT, 'invalid guard decision');
      END;
    `);
    _db.exec(`
      CREATE TRIGGER IF NOT EXISTS enforce_guard_severity_domain
      BEFORE INSERT ON amc_guard_events
      WHEN NEW.severity NOT IN ('low', 'medium', 'high', 'critical')
      BEGIN
        SELECT RAISE(ABORT, 'invalid guard severity');
      END;
    `);
    _insertStmt = _db.prepare(
      `INSERT INTO amc_guard_events (id, agent_id, module_code, decision, reason, severity, meta_json, created_at, prev_hash, event_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    return _db;
  } catch (_e) {
    return null;
  }
}

export function emitGuardEvent(input: GuardEventInput): void {
  try {
    const db = getDb();
    if (!db || !_insertStmt) return;
    const id = randomUUID();
    const now = new Date().toISOString();
    const metaJson = input.meta ? JSON.stringify(input.meta) : null;
    // Guard decisions are read back by collectEvidenceFromLedger and scored as
    // OBSERVED (trust 1.0), but this store had no chain, no signature and no
    // immutability trigger, so an edit to the file was undetectable. Each row
    // now commits to its predecessor.
    const prevHash = lastGuardEventHash(db);
    const eventHash = guardEventHash({
      id,
      agentId: input.agentId,
      moduleCode: input.moduleCode,
      decision: input.decision,
      reason: input.reason,
      severity: input.severity,
      metaJson,
      createdAt: now,
      prevHash
    });
    _insertStmt.run(
      id, input.agentId, input.moduleCode, input.decision, input.reason,
      input.severity, metaJson, now, prevHash, eventHash
    );

    // P2.1 consolidation, DUAL_WRITE stage: the same row also goes into the
    // pooled evidence store. The legacy file above stays authoritative for
    // reads until parity has been verified and cutover is switched on, so this
    // stage cannot change any answer — it can only make the second store
    // complete enough to be compared against the first.
    if (currentStage() !== 'CUTOVER') writeConsolidatedGuardEvent(guardEventsWorkspace(), {
      id,
      agent_id: input.agentId,
      module_code: input.moduleCode,
      decision: input.decision,
      reason: input.reason,
      severity: input.severity,
      meta_json: metaJson,
      created_at: now,
      prev_hash: prevHash,
      event_hash: eventHash
    });
  } catch (_e) {
    // Never throw
  }
}

/**
 * The workspace whose evidence store receives the consolidated copy.
 *
 * Derived from the legacy database path so the two stores always belong to the
 * same workspace: AMC_GUARD_EVENTS_DB_PATH is honoured by tests and by
 * multi-workspace hosts, and writing the copy to process.cwd() regardless would
 * scatter rows across whichever directory the process happened to start in.
 */
function guardEventsWorkspace(): string {
  const configured = process.env.AMC_GUARD_EVENTS_DB_PATH;
  // .amc/guard_events.sqlite -> the workspace is two levels up.
  return configured ? resolve(dirname(configured), '..') : process.cwd();
}

export function emitGuardDecisionReceipt(input: EmitGuardDecisionReceiptInput): GuardDecisionReceipt | null {
  try {
    const receipt = buildGuardDecisionReceipt(input);
    const verified = verifyGuardDecisionReceipt(receipt, {
      workspace: guardReceiptWorkspace(input.workspace),
    });
    if (!verified.ok) return null;

    emitGuardEvent({
      agentId: input.agentId,
      moduleCode: input.moduleCode,
      decision: mapReceiptDecisionToEventDecision(input.decision),
      reason: input.reason ?? `${input.decision} by ${input.matchedRule}`,
      severity: input.severity ?? defaultReceiptSeverity(input.decision),
      meta: {
        ...(input.meta ?? {}),
        guardDecisionReceipt: receipt,
        guardDecisionReceiptHash: receipt.receiptHash,
        guardDecisionReceiptPayloadHash: receipt.payloadHash,
        guardDecisionDecision: receipt.payload.decision,
        guardDecisionMatchedRule: receipt.payload.matchedRule,
        guardDecisionInputHash: receipt.payload.inputHash,
        guardDecisionOutputHash: receipt.payload.outputHash,
        guardDecisionSigner: receipt.payload.signer,
      },
    });
    return receipt;
  } catch {
    return null;
  }
}

/** Read events for a given agent within a time window. Used by scoring engine and SIEM exporter. */
export function readGuardEvents(agentId?: string, windowHours?: number): Array<{
  id: string; agent_id: string; module_code: string; decision: string;
  reason: string; severity: string; meta_json: string | null; created_at: string;
}> {
  try {
    const db = getDb();
    if (!db) return [];
    let sql = 'SELECT * FROM amc_guard_events';
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (agentId) { clauses.push('agent_id = ?'); params.push(agentId); }
    if (windowHours) {
      const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
      clauses.push('created_at >= ?'); params.push(since);
    }
    if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    return db.prepare(sql).all(...params) as Array<{ id: string; agent_id: string; module_code: string; decision: string; reason: string; severity: string; meta_json: string | null; created_at: string; }>;
  } catch (_e) {
    return [];
  }
}

export function readGuardDecisionReceipts(agentId?: string, windowHours?: number): GuardDecisionReceipt[] {
  const receipts: GuardDecisionReceipt[] = [];
  for (const row of readGuardEvents(agentId, windowHours)) {
    if (!row.meta_json) continue;
    try {
      const meta = JSON.parse(row.meta_json) as { guardDecisionReceipt?: GuardDecisionReceipt };
      if (meta.guardDecisionReceipt) receipts.push(meta.guardDecisionReceipt);
    } catch {
      // Skip malformed metadata; receipt verification remains fail-closed for callers.
    }
  }
  return receipts;
}

/** Close the database connection (for testing cleanup). */
/** Canonical hash of one guard event, committing to the previous event. */
function guardEventHash(row: {
  id: string;
  agentId: string;
  moduleCode: string;
  decision: string;
  reason: string;
  severity: string;
  metaJson: string | null;
  createdAt: string;
  prevHash: string;
}): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

const GUARD_CHAIN_GENESIS = "GENESIS_GUARD_EVENTS";

function lastGuardEventHash(db: import('better-sqlite3').Database): string {
  try {
    const row = db
      .prepare(
        `SELECT event_hash FROM amc_guard_events
         WHERE event_hash IS NOT NULL
         ORDER BY created_at DESC, rowid DESC LIMIT 1`
      )
      .get() as { event_hash?: string } | undefined;
    return row?.event_hash ?? GUARD_CHAIN_GENESIS;
  } catch {
    return GUARD_CHAIN_GENESIS;
  }
}

/**
 * Walks the guard-event chain.
 *
 * Rows written before the chain migration carry NULL hashes. They are counted
 * as `unchained` rather than verified: this store predates tamper-evidence and
 * claiming otherwise would be exactly the inflation AMC exists to catch.
 */
export function verifyGuardEventChain(): {
  ok: boolean;
  chained: number;
  unchained: number;
  brokenAt: string | null;
} {
  const db = getDb();
  if (!db) return { ok: true, chained: 0, unchained: 0, brokenAt: null };
  try {
    const rows = db
      .prepare(
        `SELECT id, agent_id, module_code, decision, reason, severity, meta_json,
                created_at, prev_hash, event_hash
         FROM amc_guard_events ORDER BY created_at ASC, rowid ASC`
      )
      .all() as Array<Record<string, string | null>>;

    let chained = 0;
    let unchained = 0;
    let expectedPrev: string | null = null;

    for (const row of rows) {
      if (!row.event_hash) {
        unchained += 1;
        continue;
      }
      const recomputed = guardEventHash({
        id: String(row.id),
        agentId: String(row.agent_id),
        moduleCode: String(row.module_code),
        decision: String(row.decision),
        reason: String(row.reason),
        severity: String(row.severity),
        metaJson: row.meta_json ?? null,
        createdAt: String(row.created_at),
        prevHash: String(row.prev_hash ?? GUARD_CHAIN_GENESIS)
      });
      if (recomputed !== row.event_hash) {
        return { ok: false, chained, unchained, brokenAt: String(row.id) };
      }
      if (expectedPrev !== null && row.prev_hash !== expectedPrev) {
        return { ok: false, chained, unchained, brokenAt: String(row.id) };
      }
      expectedPrev = String(row.event_hash);
      chained += 1;
    }
    return { ok: true, chained, unchained, brokenAt: null };
  } catch {
    return { ok: true, chained: 0, unchained: 0, brokenAt: null };
  }
}

/**
 * Deletes guard events older than `beforeIso`, returning the row count removed.
 *
 * Nothing pruned this store: it was the only SQLite file the retention and
 * vacuum engines could not reach, because both open the workspace through
 * openLedger() which resolves to evidence.sqlite. It had reached 87,667 rows /
 * 26MB with a 5.5MB WAL over two months.
 *
 * Pruning breaks the chain at the cut point by construction, which
 * verifyGuardEventChain reports as unchained rows rather than as tampering.
 */
export function pruneGuardEvents(beforeIso: string): number {
  const db = getDb();
  if (!db) return 0;
  try {
    const result = db.prepare(`DELETE FROM amc_guard_events WHERE created_at < ?`).run(beforeIso);
    return Number(result.changes ?? 0);
  } catch {
    return 0;
  }
}

export function closeGuardDb(): void {
  try {
    if (_db) {
      _db.close();
      _db = null;
      _insertStmt = null;
      _dbPath = null;
    }
  } catch (_e) { /* silent */ }
}
