/**
 * Builds the artifact that a session anchor commits to.
 *
 * The whole value of anchoring is that the anchored digest is derived from the
 * stored rows, never from what a row says about itself. `session/close` carries
 * a `sessionMerkleRoot` in its meta, and it would be a great deal easier to copy
 * that field — but then a workspace-write attacker who can re-sign rows could
 * publish any root it liked and the transparency log would notarise it. So this
 * module recomputes the root from the `turn/seal` rows and treats the close
 * event's claim as an assertion to CHECK, not a value to use. Constraint (a) in
 * the P2.2 design notes, applied one level up.
 *
 * It also refuses to describe a session it has not verified. The scoped checks
 * below (event_hash recomputation, writer signature, per-session envelope chain,
 * seal row) are the same rules `verifyStoredSessionEvents` applies, expressed
 * over ONE session's rows. That verifier could not be reused directly: its
 * global-chain check requires the workspace's full row order, and a single
 * session is a slice of it. Where the rules overlap the error strings are kept
 * identical so a divergence between the two shows up as different wording rather
 * than as a quietly missing rule.
 */
import { getPublicKeyHistory, getPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalMetadataForHash } from "../ledger/eventHash.js";
import { openSessionEventStore, resolveSessionStoreBackend } from "../persistence/openSessionEventStore.js";
import { extractEnvelope, SESSION_GENESIS } from "../session/sessionTypes.js";
import { merkleRoot } from "../session/sessionMerkle.js";
import type { EvidenceEvent, SessionRecord } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { sessionRootDescriptorSchema, type SessionRootDescriptor } from "./sessionAnchorSchema.js";

/**
 * Thrown when a session cannot honestly be anchored.
 *
 * A distinct class because the caller's only safe reaction is to NOT publish:
 * an anchor for a session that does not verify is a signed statement that it
 * did. `errors` carries every rule that failed, not just the first, so an
 * operator sees the shape of the problem in one pass.
 */
export class SessionAnchorError extends Error {
  readonly sessionId: string;
  readonly errors: readonly string[];

  constructor(sessionId: string, errors: readonly string[]) {
    super(`session ${sessionId} cannot be anchored: ${errors.join("; ")}`);
    this.name = "SessionAnchorError";
    this.sessionId = sessionId;
    this.errors = errors;
  }
}

export interface SessionRootDescriptorOptions {
  /**
   * sha256 of the monitor public key PEM this workspace is expected to use.
   *
   * Same anchor, same environment variable and the same fail-closed behaviour as
   * `verifyLedgerIntegrity` and `verifyStoredSessionEvents` (ADR-0007). Without
   * it, "the signatures check out" means only "they check out against whatever
   * public key is on disk" — and an attacker with workspace write can put their
   * own key there. Anchoring publishes the result, so dropping the anchor here
   * would be a way around ADR-0007 with a transparency entry attached.
   */
  readonly expectedMonitorFingerprint?: string;
}

/** Parsed `meta_json` of a session event, or an empty object when unreadable. */
function readMeta(event: EvidenceEvent): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(event.meta_json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function verifyMonitorAnchor(workspace: string, expected: string | null, errors: string[]): string {
  let fingerprint = "";
  try {
    fingerprint = sha256Hex(Buffer.from(getPublicKeyPem(workspace, "monitor"), "utf8"));
  } catch {
    errors.push("workspace has no monitor public key");
    return "";
  }
  if (expected !== null && expected !== fingerprint) {
    errors.push(`monitor key fingerprint mismatch: expected ${expected}, found ${fingerprint}`);
  }
  return fingerprint;
}

/**
 * Per-row integrity for ONE session: the hash pre-image, the writer signature,
 * and the envelope chain. The global `prev_event_hash` chain is deliberately not
 * checked here (a session slice cannot be) — `verifyLedgerIntegrity` and
 * `verifyStoredSessionEvents` remain the authority for that.
 */
function verifySessionRows(workspace: string, rows: readonly EvidenceEvent[], errors: string[]): void {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  let expectedSeq = 0;
  let expectedPrevHash = SESSION_GENESIS;
  for (const event of rows) {
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

    const envelope = extractEnvelope(event.meta_json);
    if (envelope === null) {
      // A row in this session that is not a spine row means the session root
      // would cover less than the session does. Say so rather than anchoring a
      // root that silently excludes it.
      errors.push(`Event ${event.id} carries no session envelope`);
      continue;
    }
    if (envelope.sessionId !== event.session_id) {
      errors.push(`Event ${event.id} session envelope sessionId mismatch`);
    }
    if (envelope.seq !== expectedSeq) {
      errors.push(`Event ${event.id} session sequence mismatch (expected ${expectedSeq}, found ${envelope.seq})`);
    }
    if (envelope.prevSessionEventHash !== expectedPrevHash) {
      errors.push(`Event ${event.id} session chain mismatch`);
    }
    // Advance from the expected head, not the row's own claim, so one break does
    // not cascade into an error per remaining row.
    expectedSeq += 1;
    expectedPrevHash = event.event_hash;
  }
}

function verifySeal(
  workspace: string,
  record: SessionRecord | null,
  rows: readonly EvidenceEvent[],
  sessionId: string,
  errors: string[]
): void {
  if (record === null) {
    errors.push(`session ${sessionId} has no lifecycle row`);
    return;
  }
  if (record.ended_ts === null || record.session_final_event_hash === null) {
    errors.push(`session ${sessionId} is not sealed`);
    return;
  }
  const last = rows[rows.length - 1];
  if (last !== undefined && record.session_final_event_hash !== last.event_hash) {
    errors.push(
      `Session ${sessionId} seal names ${record.session_final_event_hash.slice(0, 16)}… ` +
        `but its last event is ${last.event_hash.slice(0, 16)}…`
    );
  }
  // Checking only which hash the seal names would let anyone write a seal row;
  // checking only the signature would let a sealer commit to a hash of its
  // choosing. Both together are what make the seal mean "this monitor says this
  // session ended here". Same pairing as `verifySessionRecords`.
  if (
    record.session_seal_sig === null ||
    !verifyHexDigestAny(record.session_final_event_hash, record.session_seal_sig, getPublicKeyHistory(workspace, "monitor"))
  ) {
    errors.push(`Session ${sessionId} seal signature invalid`);
  }
}

/**
 * Cross-checks the recomputed figures against what `session/close` claims.
 *
 * A mismatch is a tamper finding, not a rounding difference: the close row's
 * meta is inside its `event_hash`, so if the row verifies and its claim still
 * disagrees with the rows, the disagreement is real.
 */
function verifyCloseClaims(
  closeEvent: EvidenceEvent,
  recomputed: { turnCount: number; sealCount: number; sessionMerkleRoot: string },
  errors: string[]
): void {
  const meta = readMeta(closeEvent);
  if (typeof meta.sessionMerkleRoot === "string" && meta.sessionMerkleRoot !== recomputed.sessionMerkleRoot) {
    errors.push(
      `session/close claims merkle root ${meta.sessionMerkleRoot} but the sealed turns hash to ${recomputed.sessionMerkleRoot}`
    );
  }
  if (typeof meta.sealCount === "number" && meta.sealCount !== recomputed.sealCount) {
    errors.push(`session/close claims ${meta.sealCount} seals but ${recomputed.sealCount} turn/seal rows exist`);
  }
  if (typeof meta.turnCount === "number" && meta.turnCount !== recomputed.turnCount) {
    errors.push(`session/close claims ${meta.turnCount} turns but ${recomputed.turnCount} turn/start rows exist`);
  }
}

/** The agent id a session was opened for, taken from the `session/open` meta. */
function agentIdFromOpen(openEvent: EvidenceEvent): string {
  const meta = readMeta(openEvent);
  return typeof meta.agentId === "string" && meta.agentId.length > 0 ? meta.agentId : "unknown";
}

/**
 * Builds the descriptor for a session from rows already read out of a store.
 *
 * Separated from `readSessionRootDescriptor` so a caller that already holds the
 * rows (a test, a batch anchoring pass) pays for one store open, and so the
 * derivation itself is exercisable without a workspace on disk beyond the keys.
 */
export function buildSessionRootDescriptor(params: {
  workspace: string;
  sessionId: string;
  rows: readonly EvidenceEvent[];
  record: SessionRecord | null;
  options?: SessionRootDescriptorOptions;
}): SessionRootDescriptor {
  const { workspace, sessionId, rows, record } = params;
  const errors: string[] = [];
  const expected =
    params.options?.expectedMonitorFingerprint ?? process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"] ?? null;
  const monitorKeyFingerprint = verifyMonitorAnchor(workspace, expected, errors);

  if (rows.length === 0) {
    throw new SessionAnchorError(sessionId, [...errors, `session ${sessionId} has no events`]);
  }
  verifySessionRows(workspace, rows, errors);
  verifySeal(workspace, record, rows, sessionId, errors);

  const openEvent = rows[0]!;
  const closeEvent = rows[rows.length - 1]!;
  if (openEvent.event_type !== "session/open") {
    errors.push(`session ${sessionId} does not begin with session/open`);
  }
  if (closeEvent.event_type !== "session/close") {
    // The INTERRUPTED and OPEN lifecycles are real states, and this is where a
    // later stage teaches the descriptor to describe them. Until then, saying
    // "not closed" is more honest than anchoring a window with no upper bound.
    errors.push(`session ${sessionId} does not end with session/close`);
  }

  const sealEventHashes = rows.filter((row) => row.event_type === "turn/seal").map((row) => row.event_hash);
  const turnCount = rows.filter((row) => row.event_type === "turn/start").length;
  const sessionMerkleRoot = merkleRoot(sealEventHashes);
  if (closeEvent.event_type === "session/close") {
    verifyCloseClaims(closeEvent, { turnCount, sealCount: sealEventHashes.length, sessionMerkleRoot }, errors);
  }

  if (errors.length > 0) {
    throw new SessionAnchorError(sessionId, errors);
  }

  return sessionRootDescriptorSchema.parse({
    v: 1,
    sessionId,
    lifecycle: "closed",
    runtime: openEvent.runtime,
    agentId: agentIdFromOpen(openEvent),
    startedTs: record?.started_ts ?? openEvent.ts,
    endedTs: record?.ended_ts ?? closeEvent.ts,
    eventCount: rows.length,
    turnCount,
    sealCount: sealEventHashes.length,
    sealEventHashes,
    sessionMerkleRoot,
    openEventHash: openEvent.event_hash,
    closeEventHash: closeEvent.event_hash,
    monitorKeyFingerprint
  });
}

/**
 * Reads one session out of the workspace's own store and describes it.
 *
 * Opened READ-ONLY, which is what lets this run against a workspace with a live
 * session in it: a read-only store takes no writer lock and never pins a
 * backend, so anchoring an old session cannot disturb a running one.
 */
export function readSessionRootDescriptor(
  workspace: string,
  sessionId: string,
  options: SessionRootDescriptorOptions = {}
): SessionRootDescriptor {
  const store = openSessionEventStore(workspace, resolveSessionStoreBackend(workspace), { readOnly: true });
  try {
    return buildSessionRootDescriptor({
      workspace,
      sessionId,
      rows: store.readSessionEvents(sessionId),
      record: store.readSessionRecord(sessionId),
      options
    });
  } finally {
    store.close();
  }
}
