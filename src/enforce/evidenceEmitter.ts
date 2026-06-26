/**
 * Evidence emitter — fail-safe guard_check event writer.
 * Writes to .amc/guard_events.sqlite using better-sqlite3.
 * NEVER throws — all errors are silently logged.
 */

import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ensureSigningKeys, getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from '../crypto/keys.js';
import { canonicalize } from '../utils/json.js';
import { sha256Hex } from '../utils/hash.js';

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
    const configuredPath = process.env.AMC_GUARD_EVENTS_DB_PATH;
    const desiredPath = configuredPath
      ? resolve(configuredPath)
      : join(process.cwd(), '.amc', 'guard_events.sqlite');
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
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
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
      `INSERT INTO amc_guard_events (id, agent_id, module_code, decision, reason, severity, meta_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
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
    _insertStmt.run(id, input.agentId, input.moduleCode, input.decision, input.reason, input.severity, metaJson, now);
  } catch (_e) {
    // Never throw
  }
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
