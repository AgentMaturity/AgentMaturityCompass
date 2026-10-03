/**
 * Human-oversight record for an incident: who reviewed it, when, and what they
 * decided. Signed with the same Ed25519 digest-signing primitive the incident
 * store uses (src/crypto/keys.ts), bound to the incident hash, and chained by
 * prevRecordHash. Storage is an append-only JSONL file; the receipts chain
 * (src/receipts/receiptChain.ts) is being rewritten by another session, so this
 * module does not depend on it.
 *
 * Guard: a record cannot be backdated before the incident's createdTs, both at
 * creation and at verification (a stored record with an edited reviewedTs fails
 * verification even if its signature were somehow re-minted).
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import type { Incident } from "./incidentTypes.js";

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
  reviewedTs: number;
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
    decision: record.decision,
    rationale: record.rationale,
    clockIds: [...record.clockIds],
    prevRecordHash: record.prevRecordHash
  };
}

export function computeOversightRecordHash(record: OversightPayload): string {
  return sha256Hex(canonicalize(payloadOf(record)));
}

export function createOversightRecord(input: CreateOversightRecordInput): HumanOversightRecord {
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

  const payload: OversightPayload = {
    v: 1,
    recordId: input.recordId ?? randomUUID(),
    incidentId: input.incident.incidentId,
    incidentHash: input.incident.incident_hash,
    reviewerId,
    reviewedTs: input.reviewedTs,
    decision: input.decision,
    rationale,
    clockIds: [...(input.clockIds ?? [])],
    prevRecordHash: input.prevRecordHash ?? null
  };
  const recordHash = computeOversightRecordHash(payload);
  return { ...payload, recordHash, signature: signHexDigest(recordHash, input.privateKeyPem) };
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
  const expectedHash = computeOversightRecordHash(record);
  if (record.recordHash !== expectedHash) {
    errors.push("record hash does not match its content");
  } else if (!verifyHexDigestAny(record.recordHash, record.signature, publicKeys)) {
    errors.push("record signature verification failed");
  }
  return { ok: errors.length === 0, errors };
}

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

/** Default file-backed location: <workspace>/.amc/incidents/oversight/<incidentId>.jsonl */
export function oversightRecordPath(workspace: string, incidentId: string): string {
  if (!SAFE_ID.test(incidentId)) throw new Error(`incidentId ${incidentId} is not file-safe`);
  return join(workspace, ".amc", "incidents", "oversight", `${incidentId}.jsonl`);
}

export function appendOversightRecord(filePath: string, record: HumanOversightRecord): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
}

export function readOversightRecords(filePath: string): HumanOversightRecord[] {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, "utf8").split("\n").filter((line) => line.trim().length > 0);
  return lines.map((line, index) => {
    const parsed = JSON.parse(line) as Partial<HumanOversightRecord>;
    if (parsed.v !== 1 || typeof parsed.recordId !== "string" || typeof parsed.recordHash !== "string") {
      throw new Error(`malformed oversight record at line ${index + 1} of ${filePath}`);
    }
    return parsed as HumanOversightRecord;
  });
}
