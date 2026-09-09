/**
 * Backend-independent verification of stored session events.
 *
 * `verifyLedgerIntegrity` is and remains the authority for a SQLite workspace:
 * nothing here replaces it, weakens it, or is called by it. It cannot be reused
 * as the seam's oracle because every one of its checks is typed on the concrete
 * `Ledger` and reaches `ledger.db`/`ledger.getAllEvents()` — which is exactly
 * why a JSONL workspace gets no coverage from it today. This module is the
 * missing half: the same rules, expressed over a row array, so a store of ANY
 * backend can be held to them.
 *
 * The checks are deliberately written against the same shared helpers the
 * writer uses (`canonicalMetadataForHash`, `verifyHexDigestAny`,
 * `loadBlobPlaintext`) and emit the same error strings as
 * `ledgerVerification.ts` where they overlap, so a divergence between the two
 * shows up as a differing message rather than as a quietly missing rule. The
 * conformance suite runs both over the SQLite backend and requires them to
 * agree.
 *
 * Two rules here have no counterpart in ledgerVerification, because SQLite gave
 * them away for free and a file does not:
 *
 *  - duplicate event ids (`id TEXT PRIMARY KEY`);
 *  - a sealed session whose recorded final hash is not its last event's hash
 *    (the SQLite seal is written by the same statement that reads the tail).
 */
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import { getPublicKeyHistory, getPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { extractEnvelope, SESSION_GENESIS } from "../session/sessionTypes.js";
import { loadBlobPlaintext } from "../storage/blobs/blobStore.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { join } from "node:path";
import { validateSurfaceCompactions } from "../session/surfaceCompaction.js";

const GLOBAL_GENESIS = "GENESIS";

export interface StoredSessionVerifyOptions {
  /**
   * SHA-256 of the monitor public key PEM this workspace is expected to use.
   *
   * Without it the verdict says only "these bytes are internally consistent":
   * an attacker with workspace write access can replace the public key the
   * signatures are checked against and re-sign everything. Same rule, same
   * environment variable, and the same fail-closed behaviour as
   * `verifyLedgerIntegrity` — a second verifier that quietly dropped the anchor
   * would be a way around ADR-0007.
   */
  readonly expectedMonitorFingerprint?: string;
  /** Session lifecycle rows, when the caller can supply them. */
  readonly sessionRecords?: readonly SessionRecord[];
}

export interface StoredSessionTrustRoot {
  readonly anchored: boolean;
  readonly monitorFingerprint: string | null;
  readonly expectedFingerprint: string | null;
}

export interface StoredSessionVerifyResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly trustRoot: StoredSessionTrustRoot;
}

/**
 * The ADR-0007 anchor, exported so a second reader of this evidence cannot
 * accidentally omit it.
 *
 * Any path that hands back bytes on the strength of a signature has to answer
 * "whose signature?", and the answer is only meaningful against a pinned
 * monitor fingerprint — an attacker with workspace write can otherwise replace
 * the public key and re-sign. Spill retrieval (src/session/spill) is exactly
 * such a path, so it calls this rather than growing a second, subtly different
 * version of the same check.
 */
export function verifyMonitorTrustRoot(
  workspace: string,
  expected: string | null,
  errors: string[]
): StoredSessionTrustRoot {
  let monitorFingerprint: string | null = null;
  try {
    monitorFingerprint = sha256Hex(Buffer.from(getPublicKeyPem(workspace, "monitor"), "utf8"));
  } catch {
    // No monitor key at all. The per-event signature checks below report the
    // consequences; recording null keeps this verdict honest rather than
    // claiming a match against a key that is absent.
    monitorFingerprint = null;
  }
  if (expected) {
    if (!monitorFingerprint) {
      errors.push("trust root: no monitor public key present to compare against the expected fingerprint");
    } else if (monitorFingerprint !== expected) {
      errors.push(
        `trust root: monitor key fingerprint ${monitorFingerprint.slice(0, 16)}… does not match the expected ` +
          `${expected.slice(0, 16)}… — the evidence may have been re-signed with a substituted key`
      );
    }
  }
  return { anchored: expected !== null, monitorFingerprint, expectedFingerprint: expected };
}

function verifyPayload(event: EvidenceEvent, workspace: string, errors: string[]): void {
  // Retention states are not produced by any session-store write path. Rather
  // than treating an archived or pruned row as ordinary (and so passing it on a
  // payload check it was never subject to), say plainly that this verifier does
  // not adjudicate it.
  if ((event.archived ?? 0) !== 0 || (event.payload_pruned ?? 0) !== 0) {
    errors.push(`Event ${event.id} carries retention state this verifier does not adjudicate`);
    return;
  }
  if (event.payload_inline !== null) {
    if (sha256Hex(Buffer.from(event.payload_inline, "utf8")) !== event.payload_sha256) {
      errors.push(`Event ${event.id} payload hash mismatch`);
    }
    return;
  }
  const payloadPath = event.payload_path ?? event.canonical_payload_path ?? null;
  if (!payloadPath) {
    if (event.payload_sha256 !== sha256Hex(Buffer.alloc(0))) {
      errors.push(`Event ${event.id} payload hash mismatch`);
    }
    return;
  }
  if (!pathExists(join(workspace, payloadPath))) {
    errors.push(`Missing blob file for event ${event.id}`);
    return;
  }
  try {
    const loaded = loadBlobPlaintext(workspace, payloadPath);
    if (sha256Hex(loaded.bytes) !== event.payload_sha256 || loaded.payloadSha256 !== event.payload_sha256) {
      errors.push(`Event ${event.id} payload hash mismatch`);
    }
  } catch {
    errors.push(`Event ${event.id} payload authentication failed`);
  }
}

function verifyGlobalChainAndSignatures(
  rows: readonly EvidenceEvent[],
  workspace: string,
  errors: string[],
  checkPayloads = true
): void {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const seenIds = new Set<string>();
  let previous = GLOBAL_GENESIS;
  for (const event of rows) {
    if (seenIds.has(event.id)) {
      errors.push(`Event ${event.id} duplicate event id`);
    }
    seenIds.add(event.id);

    if (checkPayloads) verifyPayload(event, workspace, errors);

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
    if (sha256Hex(`${event.prev_event_hash}${canonicalMetadata}${event.payload_sha256}`) !== event.event_hash) {
      errors.push(`Event ${event.id} event_hash mismatch`);
    }

    if (!verifyHexDigestAny(event.event_hash, event.writer_sig, monitorKeys)) {
      errors.push(`Event ${event.id} writer signature invalid`);
    }

    previous = event.event_hash;
  }
}

/**
 * The per-session chain, over rows rather than a Ledger.
 *
 * Same rules as `verifySessionChains`: within a session `seq` is 0-based and
 * strictly monotone and `prevSessionEventHash` links to the prior session
 * event's `event_hash`. This is the one check a re-signed forgery cannot pass,
 * so a backend that lost it would look fine to every other check here.
 */
function verifySessionEnvelopeChains(rows: readonly EvidenceEvent[], errors: string[]): void {
  const expectedSeq = new Map<string, number>();
  const expectedPrevHash = new Map<string, string>();
  for (const event of rows) {
    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null) {
      continue;
    }
    const seq = expectedSeq.get(event.session_id) ?? 0;
    const prevHash = expectedPrevHash.get(event.session_id) ?? SESSION_GENESIS;
    if (envelope.sessionId !== event.session_id) {
      errors.push(`Event ${event.id} session envelope sessionId mismatch`);
    }
    if (envelope.seq !== seq) {
      errors.push(`Event ${event.id} session sequence mismatch (expected ${seq}, found ${envelope.seq})`);
    }
    if (envelope.prevSessionEventHash !== prevHash) {
      errors.push(`Event ${event.id} session chain mismatch`);
    }
    // Advance from the expected head, not the event's own claim, so one break
    // does not cascade into an error per remaining row.
    expectedSeq.set(event.session_id, seq + 1);
    expectedPrevHash.set(event.session_id, event.event_hash);
  }
}

function verifySessionRecords(
  rows: readonly EvidenceEvent[],
  records: readonly SessionRecord[],
  workspace: string,
  errors: string[]
): void {
  const byId = new Map(records.map((record) => [record.session_id, record]));
  const lastHashBySession = new Map<string, string>();
  for (const event of rows) {
    lastHashBySession.set(event.session_id, event.event_hash);
    if (!byId.has(event.session_id)) {
      errors.push(`Event ${event.id} references missing session ${event.session_id}`);
    }
  }
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  for (const record of records) {
    if (record.session_final_event_hash === null) {
      continue;
    }
    // The seal must name the session's ACTUAL last event. Checking only the
    // signature would let a sealer commit to any hash it liked and still
    // produce a valid-looking seal over it.
    const last = lastHashBySession.get(record.session_id);
    if (last !== undefined && last !== record.session_final_event_hash) {
      errors.push(
        `Session ${record.session_id} seal names ${record.session_final_event_hash.slice(0, 16)}… ` +
          `but its last event is ${last.slice(0, 16)}…`
      );
    }
    if (
      record.session_seal_sig === null ||
      !verifyHexDigestAny(record.session_final_event_hash, record.session_seal_sig, monitorKeys)
    ) {
      errors.push(`Session ${record.session_id} seal signature invalid`);
    }
  }
}

/**
 * Verify a stored session log.
 *
 * `rows` must be the store's full global order (`readAllEvents()`), not one
 * session's slice: the `prev_event_hash` chain spans sessions, so a slice
 * cannot be checked against it.
 */
export function verifyStoredSessionEvents(
  workspace: string,
  rows: readonly EvidenceEvent[],
  options: StoredSessionVerifyOptions = {}
): StoredSessionVerifyResult {
  const errors: string[] = [];
  const expected =
    options.expectedMonitorFingerprint ?? process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"] ?? null;
  const trustRoot = verifyMonitorTrustRoot(workspace, expected, errors);
  verifyGlobalChainAndSignatures(rows, workspace, errors);
  verifySessionEnvelopeChains(rows, errors);
  try { validateSurfaceCompactions(workspace, rows); }
  catch (error) { errors.push(`Session compaction invalid: ${error instanceof Error ? error.message : "unsupported history"}`); }
  if (options.sessionRecords !== undefined) {
    verifySessionRecords(rows, options.sessionRecords, workspace, errors);
  }
  return { ok: errors.length === 0, errors, trustRoot };
}

/**
 * Authenticate stored metadata without opening payloads or retained output.
 * This verdict is deliberately NOT a payload, compaction, receipt or archive
 * verdict. The public history loader validates shapes and presence first.
 */
export function verifyStoredSessionEventMetadata(
  workspace: string,
  rows: readonly EvidenceEvent[],
  options: StoredSessionVerifyOptions = {}
): StoredSessionVerifyResult {
  const errors: string[] = [];
  const expected = options.expectedMonitorFingerprint ?? process.env.AMC_EXPECTED_MONITOR_FINGERPRINT ?? null;
  const trustRoot = verifyMonitorTrustRoot(workspace, expected, errors);
  verifyGlobalChainAndSignatures(rows, workspace, errors, false);
  verifySessionEnvelopeChains(rows, errors);
  if (options.sessionRecords !== undefined) verifySessionRecords(rows, options.sessionRecords, workspace, errors);
  return { ok: errors.length === 0, errors, trustRoot };
}
