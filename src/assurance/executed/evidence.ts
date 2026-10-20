import type { Ledger } from "../../ledger/ledger.js";
import type { EvidenceItem } from "../../catalog/evidence/types.js";
import { z } from "zod";
import { ledgerChainError } from "../../catalog/evidence/mappingAdapter.js";
import { effectiveTrustTier, eventMeta, readerTrustFor } from "../../claims/evidenceProvenance.js";
import { verifyHexDigestAny } from "../../crypto/keys.js";
import { getPurposeKeyHistory } from "../../keys/signingKeys.js";
import { verifyReceipt } from "../../receipts/receipt.js";
import { canonicalize } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";

/** This record is a synthetic fixture capture, never a production observation. */
export interface ExecutedCaptureRecord {
  v: 1;
  scenarioId: string;
  packId: string;
  fixture: { environment: string; seed: string };
  binding: {
    tenantId: string; workspaceId: string; deploymentId: string; agentId: string;
    controlId: string; controlVersion: string; policyDigest: string;
    runId: string; attemptId: string; fixtureDigest: string;
  };
  policy: unknown;
  capture: unknown;
  /** Server-side execution completion, authenticated with the capture bytes. */
  invocationComplete: boolean;
}

export interface ExecutedEvidenceReference {
  eventId: string;
  eventSha256: string;
  receiptId: string;
  receiptSha256: string;
  payloadSha256: string;
}

const PRODUCER = "amc.assurance.executed";
const text = z.string().min(1).max(512);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.object({
  v: z.literal(1), scenarioId: text, packId: text,
  fixture: z.object({ environment: text, seed: text }).strict(),
  binding: z.object({ tenantId: text, workspaceId: text, deploymentId: text, agentId: text,
    controlId: text, controlVersion: text, policyDigest: digest,
    runId: text, attemptId: text, fixtureDigest: digest }).strict(),
  policy: z.unknown(), capture: z.unknown(), invocationComplete: z.boolean()
}).strict();

/** The signature proves these local bytes. It does not approve a fixture or observe a production system. */
export function writeExecutedEvidence(ledger: Ledger, sessionId: string,
  record: ExecutedCaptureRecord): ExecutedEvidenceReference {
  const parsed = recordSchema.parse(record);
  if (!Object.hasOwn(parsed, "policy") || !Object.hasOwn(parsed, "capture")) throw new Error("Missing fixture capture or policy");
  const session = ledger.getSessionById(sessionId);
  if (!session || session.binary_path !== "amc-assurance-runner" || session.ended_ts !== null || session.session_seal_sig !== null) {
    throw new Error("Executed captures require an open assurance session");
  }
  const payload = canonicalize(parsed);
  const payloadSha256 = sha256Hex(payload);
  const written = ledger.appendEvidenceWithReceipt({ sessionId, runtime: "sandbox", eventType: "test",
    payload, payloadExt: "json", inline: true,
    meta: { source: "assurance.executed", producerId: PRODUCER, claimKind: "synthetic_example",
      testType: "ASSURANCE_EXECUTED_CAPTURE", scenarioId: parsed.scenarioId, packId: parsed.packId,
      ...parsed.binding, trustTier: "SELF_REPORTED" },
    receipt: { kind: "guard_check", agentId: parsed.binding.agentId, providerId: PRODUCER,
      model: null, bodySha256: payloadSha256 }
  });
  return { eventId: written.id, eventSha256: written.eventHash, receiptId: written.receiptId,
    receiptSha256: written.receiptSha256, payloadSha256 };
}

export function loadExecutedEvidence(ledger: Ledger, ref: ExecutedEvidenceReference,
  expected: Pick<ExecutedCaptureRecord, "scenarioId" | "packId" | "fixture" | "binding"> & { sessionId: string }):
  { ok: true; record: ExecutedCaptureRecord; item: EvidenceItem } | { ok: false; reason: string } {
  const reject = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
  try {
    const keys = getPurposeKeyHistory(ledger.workspace, "ledger-row");
    const receiptKeys = getPurposeKeyHistory(ledger.workspace, "receipt");
    // All rows, the exact payload and the session seal come from one SQLite snapshot.
    const snapshot = ledger.db.transaction(() => {
      const events = ledger.getAllEvents();
      const event = events.find(row => row.id === ref.eventId);
      const session = event ? ledger.getSessionById(event.session_id) : null;
      return { events, event, session };
    })();
    const { events, event, session } = snapshot;
    const chainError = ledgerChainError(events, keys);
    if (chainError) return reject(chainError);
    if (!event || event.session_id !== expected.sessionId || event.event_hash !== ref.eventSha256
      || event.event_type !== "test" || event.runtime !== "sandbox") return reject("Capture row does not match its reference or expected session");
    const last = events.filter(row => row.session_id === event.session_id).at(-1);
    if (!session || session.binary_path !== "amc-assurance-runner" || session.ended_ts === null
      || !session.session_final_event_hash || !session.session_seal_sig || session.session_final_event_hash !== last?.event_hash
      || !verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, keys)) return reject("Capture session is not sealed");
    if (![session.started_ts, session.ended_ts, event.ts, last?.ts].every(value => Number.isSafeInteger(value) && Number(value) >= 0)
      || event.ts < session.started_ts || event.ts > session.ended_ts || (last?.ts ?? -1) < session.started_ts
      || (last?.ts ?? Infinity) > session.ended_ts) return reject("Capture session time bounds are invalid");
    const payload = event.canonical_payload_inline ?? event.payload_inline;
    if (typeof payload !== "string" || sha256Hex(payload) !== event.payload_sha256 || event.payload_sha256 !== ref.payloadSha256) return reject("Capture payload digest mismatch");
    const parsed = recordSchema.safeParse(JSON.parse(payload));
    if (!parsed.success || !Object.hasOwn(parsed.data, "policy") || !Object.hasOwn(parsed.data, "capture")) return reject("Malformed capture record");
    const record = parsed.data as ExecutedCaptureRecord;
    if (canonicalize(record) !== payload) return reject("Capture bytes are not canonical");
    if (record.scenarioId !== expected.scenarioId || record.packId !== expected.packId
      || canonicalize(record.fixture) !== canonicalize(expected.fixture)
      || canonicalize(record.binding) !== canonicalize(expected.binding)) return reject("Capture subject, fixture or scenario mismatch");
    const meta = eventMeta(event);
    if (meta.source !== "assurance.executed" || meta.producerId !== PRODUCER || meta.claimKind !== "synthetic_example"
      || meta.testType !== "ASSURANCE_EXECUTED_CAPTURE" || meta.scenarioId !== record.scenarioId || meta.packId !== record.packId
      || Object.entries(record.binding).some(([key, value]) => meta[key] !== value)) return reject("Capture metadata mismatch");
    if (typeof meta.receipt !== "string" || sha256Hex(meta.receipt) !== ref.receiptSha256
      || meta.receipt_sha256 !== ref.receiptSha256 || meta.receipt_id !== ref.receiptId) return reject("Capture receipt reference mismatch");
    const receipt = verifyReceipt(meta.receipt, receiptKeys);
    const body = receipt.payload;
    if (!receipt.ok || !body || body.v !== 1 || body.kind !== "guard_check" || body.event_hash !== event.event_hash
      || body.session_id !== event.session_id || body.receipt_id !== ref.receiptId || body.ts !== event.ts
      || body.agentId !== record.binding.agentId || body.providerId !== PRODUCER || body.model !== null
      || body.body_sha256 !== event.payload_sha256) return reject("Capture receipt is invalid or commits to another record");
    return { ok: true, record, item: {
      ref: { kind: "ledger_event", id: event.id, sha256: event.event_hash }, producerId: PRODUCER,
      provenance: { verified: true, producerId: PRODUCER, trustTier: effectiveTrustTier(event, readerTrustFor(ledger.workspace)) },
      recordedAt: new Date(event.ts).toISOString(), claimedAt: null,
      binding: { tenantId: record.binding.tenantId, workspaceId: record.binding.workspaceId, deploymentId: record.binding.deploymentId,
        agentId: record.binding.agentId, controlId: record.binding.controlId, controlVersion: record.binding.controlVersion,
        policyDigest: record.binding.policyDigest, sessionId: event.session_id, producerId: PRODUCER },
      verdict: "neutral", attributes: { claimKind: "synthetic_example", receiptId: ref.receiptId,
        scenarioId: record.scenarioId, runId: record.binding.runId, attemptId: record.binding.attemptId,
        fixtureDigest: record.binding.fixtureDigest }
    } };
  } catch {
    return reject("Capture, receipt or workspace trust could not be verified");
  }
}
