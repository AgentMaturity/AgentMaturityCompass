/**
 * Human-oversight record for an incident: who reviewed it, when, and what they
 * decided. Signed over the same raw32 digest as the explicit-private compatibility API
 * (src/crypto/keys.ts); async workspace calls use the checked artifact-purpose signer, bound to the incident hash, and chained by
 * prevRecordHash. Storage is an append-only JSONL file; the receipts chain
 * (src/receipts/receiptChain.ts) is being rewritten by another session, so this
 * module does not depend on it.
 *
 * Guard: a record cannot be backdated before the incident's createdTs, both at
 * creation and at verification (a stored record with an edited reviewedTs fails
 * verification even if its signature were somehow re-minted).
 *
 * P1-17: each record carries a server-set recordedTs beside the operator-stated
 * reviewedTs, and verifyOversightChain checks a whole file (every record, the
 * prevRecordHash links, non-decreasing reviewedTs). Records verify against the
 * workspace's own auditor key history: a local audit trail that exposes edits,
 * deletions and reordering by anyone without that key, not who reviewed.
 */
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { signHexDigest, verifyHexDigestAny, getPublicKeyPem } from "../crypto/keys.js";
import { assertOwnerMode } from "../mode/mode.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { IncidentInputError, MAX_FUTURE_SKEW_MS } from "./incidentClockEvents.js";
import type { Incident } from "./incidentTypes.js";
import { REGULATORY_CLOCK_TABLE } from "./regulatoryClocksTable.js";
import { createIncidentStore } from "./incidentStore.js";
import { assertKeysetComplete, boundProviderKey, keysetDeclared } from "../keys/keyset.js";
import { getPurposeKeyHistory, readHistory } from "../keys/signingKeys.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";

export type OversightDecision =
  | "ACKNOWLEDGED"
  | "ESCALATED"
  | "REPORT_REQUIRED"
  | "NO_REPORT_REQUIRED"
  | "CLOSED";

export const OVERSIGHT_DECISIONS: readonly OversightDecision[] = [
  "ACKNOWLEDGED", "ESCALATED", "REPORT_REQUIRED", "NO_REPORT_REQUIRED", "CLOSED"
];

export interface HumanOversightRecord {
  v: 1;
  recordId: string;
  incidentId: string;
  incidentHash: string;
  reviewerId: string;
  /** Operator-stated review time. */
  reviewedTs: number;
  /** Server clock when the record was signed. */
  recordedTs: number;
  decision: OversightDecision;
  rationale: string;
  clockIds: string[];
  prevRecordHash: string | null;
  recordHash: string;
  signature: string;
}

export interface CreateOversightRecordInput {
  incident: Incident;
  reviewerId: string;
  reviewedTs: number;
  decision: OversightDecision;
  rationale: string;
  clockIds?: string[];
  prevRecordHash?: string | null;
  privateKeyPem: string;
  recordId?: string;
  /** Server clock for recordedTs; a seam for tests, never an operator input. */
  now?: () => number;
}

type OversightPayload = Omit<HumanOversightRecord, "recordHash" | "signature">;

function payloadOf(record: OversightPayload): OversightPayload {
  return {
    v: 1,
    recordId: record.recordId,
    incidentId: record.incidentId,
    incidentHash: record.incidentHash,
    reviewerId: record.reviewerId,
    reviewedTs: record.reviewedTs,
    recordedTs: record.recordedTs,
    decision: record.decision,
    rationale: record.rationale,
    clockIds: [...record.clockIds],
    prevRecordHash: record.prevRecordHash
  };
}

export function computeOversightRecordHash(record: OversightPayload): string {
  return sha256Hex(canonicalize(payloadOf(record)));
}

function prepareOversightRecord(input: Omit<CreateOversightRecordInput, "privateKeyPem">): Omit<HumanOversightRecord, "signature"> {
  const reviewerId = input.reviewerId.trim();
  const rationale = input.rationale.trim();
  if (!reviewerId) throw new Error("oversight record requires a non-empty reviewerId");
  if (!rationale) throw new Error("oversight record requires a non-empty rationale");
  if (!OVERSIGHT_DECISIONS.includes(input.decision)) {
    throw new Error(`unknown oversight decision ${String(input.decision)}`);
  }
  if (!Number.isFinite(input.reviewedTs)) throw new Error("reviewedTs must be a finite timestamp");
  if (input.reviewedTs < input.incident.createdTs) {
    throw new Error(
      `oversight record would be backdated: reviewedTs ${input.reviewedTs} precedes incident createdTs ${input.incident.createdTs}`
    );
  }
  const recordedTs = (input.now ?? Date.now)();
  if (input.reviewedTs > recordedTs + MAX_FUTURE_SKEW_MS) {
    throw new Error(`oversight record would be future-dated: reviewedTs ${input.reviewedTs} is more than 5 minutes after recordedTs ${recordedTs}`);
  }

  const payload: OversightPayload = {
    v: 1,
    recordId: input.recordId ?? randomUUID(),
    incidentId: input.incident.incidentId,
    incidentHash: input.incident.incident_hash,
    reviewerId,
    reviewedTs: input.reviewedTs,
    recordedTs,
    decision: input.decision,
    rationale,
    clockIds: [...(input.clockIds ?? [])],
    prevRecordHash: input.prevRecordHash ?? null
  };
  const recordHash = computeOversightRecordHash(payload);
  return { ...payload, recordHash };
}

export function createOversightRecord(input: CreateOversightRecordInput): HumanOversightRecord {
  const record = prepareOversightRecord(input);
  return { ...record, signature: signHexDigest(record.recordHash, input.privateKeyPem) };
}

export function verifyOversightRecord(
  record: HumanOversightRecord,
  incident: Incident,
  publicKeys: string[]
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (record.v !== 1) errors.push(`unsupported oversight record version ${String(record.v)}`);
  if (record.incidentId !== incident.incidentId) {
    errors.push(`record incidentId ${record.incidentId} does not match ${incident.incidentId}`);
  }
  if (record.incidentHash !== incident.incident_hash) {
    errors.push("record incident hash does not match the incident");
  }
  if (!OVERSIGHT_DECISIONS.includes(record.decision)) {
    errors.push(`unknown oversight decision ${String(record.decision)}`);
  }
  if (!Number.isFinite(record.reviewedTs) || record.reviewedTs < incident.createdTs) {
    errors.push(`record is backdated: reviewedTs ${String(record.reviewedTs)} precedes incident createdTs ${incident.createdTs}`);
  }
  if (!Number.isFinite(record.recordedTs) || record.reviewedTs > record.recordedTs + MAX_FUTURE_SKEW_MS) {
    errors.push(`record is future-dated: reviewedTs ${String(record.reviewedTs)} is more than 5 minutes after recordedTs ${String(record.recordedTs)}`);
  }
  const expectedHash = computeOversightRecordHash(record);
  if (record.recordHash !== expectedHash) {
    errors.push("record hash does not match its content");
  } else if (!verifyHexDigestAny(record.recordHash, record.signature, publicKeys)) {
    errors.push("record signature verification failed");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verifies a whole oversight file: every record, the first prevRecordHash null
 * and each later one equal to its predecessor's recordHash (so a deleted,
 * reordered or inserted record breaks the chain), and non-decreasing reviewedTs.
 */
export function verifyOversightChain(
  records: readonly HumanOversightRecord[],
  incident: Incident,
  publicKeys: string[]
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  records.forEach((record, index) => {
    const label = `record ${index + 1} (${record.recordId})`;
    for (const error of verifyOversightRecord(record, incident, publicKeys).errors) errors.push(`${label}: ${error}`);
    const previous = index === 0 ? null : records[index - 1]!;
    if (record.prevRecordHash !== (previous?.recordHash ?? null)) {
      errors.push(`${label}: prevRecordHash does not link to ${previous ? `record ${index}` : "the start of the chain"}`);
    }
    if (previous && record.reviewedTs < previous.reviewedTs) {
      errors.push(`${label}: reviewedTs precedes record ${index}'s`);
    }
  });
  return { ok: errors.length === 0, errors };
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/** Default file-backed location: <workspace>/.amc/incidents/oversight/<incidentId>.jsonl */
export function oversightRecordPath(workspace: string, incidentId: string): string {
  if (!SAFE_ID.test(incidentId)) throw new Error(`incidentId ${incidentId} is not file-safe`);
  return join(workspace, ".amc", "incidents", "oversight", `${incidentId}.jsonl`);
}

function withOversightLock<T>(filePath: string, operation: () => T): T {
  return withControlFileLock({ root: dirname(filePath), name: "oversight-record", operation });
}
function appendUnlocked(filePath: string, record: HumanOversightRecord): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}
export function appendOversightRecord(filePath: string, record: HumanOversightRecord): void {
  withOversightLock(filePath, () => appendUnlocked(filePath, record));
}

function readOversightBytes(filePath: string): Buffer | null {
  return existsSync(filePath) ? readFileSync(filePath) : null;
}
function parseOversightRecords(filePath: string, bytes: Buffer | null): HumanOversightRecord[] {
  if (bytes === null) return [];
  const lines = bytes.toString("utf8").split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    const parsed = JSON.parse(line) as Partial<HumanOversightRecord>;
    if (parsed.v !== 1 || typeof parsed.recordId !== "string" || typeof parsed.recordHash !== "string") {
      throw new Error(`malformed oversight record at line ${index + 1} of ${filePath}`);
    }
    return parsed as HumanOversightRecord;
  });
}

export function readOversightRecords(filePath: string): HumanOversightRecord[] {
  return parseOversightRecords(filePath, readOversightBytes(filePath));
}
const sameBytes = (a: Buffer | null, b: Buffer | null) => a === null ? b === null : b !== null && a.equals(b);

export interface RecordWorkspaceOversightInput {
  workspace: string;
  incident: Incident;
  reviewerId: string;
  decision: string;
  rationale: string;
  clockIds: string[];
  reviewedTs: number;
  privateKeyPem: string;
  /** Workspace auditor key history: the existing file must verify against it before anything is appended. */
  publicKeys: string[];
  now?: () => number;
}

/**
 * Appends a record for a stored incident to its workspace file, chained to the
 * file's last record (P1-17). Refuses to append when the existing file fails
 * verifyOversightChain, so a forged or edited record is never endorsed. The
 * reviewer id is stored as stated: the key proves which workspace signed the
 * record, not which person reviewed.
 */
export function recordWorkspaceOversight(input: RecordWorkspaceOversightInput): HumanOversightRecord {
  // Signs with the workspace auditor key: never from agent mode.
  assertOwnerMode(input.workspace, "incident oversight");
  if (!OVERSIGHT_DECISIONS.includes(input.decision as OversightDecision)) {
    throw new IncidentInputError(`unknown decision ${input.decision}; expected one of ${OVERSIGHT_DECISIONS.join(", ")}`);
  }
  if (!input.reviewerId.trim()) throw new IncidentInputError("reviewer id must not be empty");
  if (!input.rationale.trim()) throw new IncidentInputError("rationale must not be empty");
  const unknown = input.clockIds.filter((clockId) => !REGULATORY_CLOCK_TABLE.some((clock) => clock.clockId === clockId));
  if (unknown.length > 0) throw new IncidentInputError(`unknown clock id: ${unknown.join(", ")}`);
  const path = oversightRecordPath(input.workspace, input.incident.incidentId);
  const before = readOversightBytes(path);
  const existing = parseOversightRecords(path, before);
  const chain = verifyOversightChain(existing, input.incident, input.publicKeys);
  if (!chain.ok) throw new Error(`refusing to append: ${path} failed verification: ${chain.errors.join("; ")}`);
  const previous = existing.at(-1);
  if (previous && input.reviewedTs < previous.reviewedTs) {
    throw new IncidentInputError(`reviewedTs precedes the last record's (${new Date(previous.reviewedTs).toISOString()})`);
  }
  const record = createOversightRecord({
    incident: input.incident,
    reviewerId: input.reviewerId,
    reviewedTs: input.reviewedTs,
    decision: input.decision as OversightDecision,
    rationale: input.rationale,
    clockIds: input.clockIds,
    prevRecordHash: previous?.recordHash ?? null,
    privateKeyPem: input.privateKeyPem,
    now: input.now
  });
  withOversightLock(path, () => {
    if (!sameBytes(readOversightBytes(path), before)) throw new Error("oversight records changed while signing was prepared; retry");
    appendUnlocked(path, record);
  });
  return record;
}


/** Exact artifact-purpose history; only authenticated explicit legacy imports supplement an unbound workspace. */
export function workspaceOversightPublicKeys(workspace: string): string[] {
  assertKeysetComplete(workspace);
  const keys = getPurposeKeyHistory(workspace, "artifact-seal");
  if (keysetDeclared(workspace) && boundProviderKey(workspace, "artifact-seal") === null) {
    const history = readHistory(workspace, "auditor", getPublicKeyPem(workspace, "auditor"));
    keys.push(...(history?.entries.filter(entry => entry.source === "imported").map(entry => entry.publicKeyPem) ?? []));
  }
  return [...new Set(keys)];
}
export type RecordWorkspaceOversightAsyncInput = Omit<RecordWorkspaceOversightInput, "privateKeyPem" | "publicKeys"> & { beforePublish?: () => void };
export class OversightPublicationError extends Error {
  readonly code = "OVERSIGHT_PUBLICATION_INCOMPLETE";
  constructor(readonly recordHash: string, readonly appendAttempted: boolean, readonly appended: boolean, cause: unknown) {
    super("Oversight publication did not complete", { cause }); this.name = "OversightPublicationError";
  }
}
const usedIncident = (incident: Incident | undefined) => incident === undefined ? null : canonicalize({
  incidentId: incident.incidentId, incident_hash: incident.incident_hash, createdTs: incident.createdTs
});
function assertStoredIncident(db: Database.Database, incident: Incident): void {
  if (usedIncident(createIncidentStore(db).getIncident(incident.incidentId)) !== usedIncident(incident))
    throw new IncidentInputError("stored incident signing facts changed or are unavailable; retry");
}

/** Actual stored incident producer: no connection, transaction or file lock crosses the checked signing await. */
export async function recordWorkspaceOversightAsync(supplied: RecordWorkspaceOversightAsyncInput): Promise<HumanOversightRecord> {
  const input = { ...supplied, incident: structuredClone(supplied.incident), clockIds: [...supplied.clockIds] };
  assertOwnerMode(input.workspace, "incident oversight");
  if (!OVERSIGHT_DECISIONS.includes(input.decision as OversightDecision)) throw new IncidentInputError("unknown oversight decision");
  if (!input.reviewerId.trim() || !input.rationale.trim()) throw new IncidentInputError("reviewer and rationale must not be empty");
  if (input.clockIds.some(id => !REGULATORY_CLOCK_TABLE.some(clock => clock.clockId === id))) throw new IncidentInputError("unknown clock id");
  const database = join(input.workspace, ".amc", "evidence.sqlite"), path = oversightRecordPath(input.workspace, input.incident.incidentId);
  const read = new Database(database, { readonly: true, fileMustExist: true, timeout: 0 });
  try { assertStoredIncident(read, input.incident); } finally { read.close(); }
  const before = readOversightBytes(path), records = parseOversightRecords(path, before);
  if (!verifyOversightChain(records, input.incident, workspaceOversightPublicKeys(input.workspace)).ok)
    throw new IncidentInputError("existing oversight records failed verification");
  const previous = records.at(-1);
  if (previous && input.reviewedTs < previous.reviewedTs) throw new IncidentInputError("reviewedTs precedes the last record");
  const prepared = prepareOversightRecord({ ...input, decision: input.decision as OversightDecision, prevRecordHash: previous?.recordHash ?? null });
  const captured = capturePurposePublication(input.workspace, "artifact-seal");
  const signed = await signWithPurposeKey(input.workspace, "artifact-seal", Buffer.from(prepared.recordHash, "hex"));
  const record = { ...prepared, signature: signed.signature.toString("base64") };
  let db: Database.Database | undefined, appendAttempted = false, appended = false, failed = false, failure: unknown;
  try {
    db = new Database(database, { fileMustExist: true, timeout: 0 }); db.exec("BEGIN IMMEDIATE");
    assertStoredIncident(db, input.incident);
    withOversightLock(path, () => {
      input.beforePublish?.();
      assertOwnerMode(input.workspace, "incident oversight");
      assertPurposePublicationCurrent(input.workspace, captured, signed);
      if (!sameBytes(readOversightBytes(path), before)) throw new IncidentInputError("oversight records changed while signing was prepared; retry");
      appendAttempted = true; appendUnlocked(path, record); appended = true;
    });
    db.exec("COMMIT");
  } catch (cause) {
    failed = true; failure = cause;
    try { if (db?.inTransaction) db.exec("ROLLBACK"); } catch (rollback) { failure = new AggregateError([cause, rollback], "Oversight SQL cleanup did not complete"); }
  } finally {
    try { db?.close(); } catch (close) { failure = failed ? new AggregateError([failure, close], "Oversight connection cleanup did not complete") : close; failed = true; }
  }
  if (failed) {
    if (appendAttempted) throw new OversightPublicationError(record.recordHash, appendAttempted, appended, failure);
    throw failure;
  }
  return record;
}
