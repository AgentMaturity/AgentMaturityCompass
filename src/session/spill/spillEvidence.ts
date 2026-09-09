/**
 * Retrieval and verification of spilled content — the half that makes spill an
 * evidence mechanism rather than a storage trick.
 *
 * The rule this module enforces is that spilled bytes are only ever returned
 * against a SIGNED commitment, never against the file's own say-so. Concretely,
 * every retrieval walks the same three steps in the same order:
 *
 *   1. the row's `event_hash` is RECOMPUTED from the row (same pre-image the
 *      writer and `verifyStoredSessionEvents` use), so an edited `meta_json` —
 *      a repointed locator, a relaxed hash — fails here;
 *   2. `writer_sig` is verified over that hash against the monitor key history,
 *      under the ADR-0007 trust-root anchor, so a re-signed row fails here;
 *   3. only then is the file read, and its bytes are held to the
 *      `contentSha256` the row committed to.
 *
 * Step 2 is why this module reuses `verifyMonitorTrustRoot` from the store
 * verifier instead of checking signatures on its own: a retrieval path that
 * verified signatures without pinning the key would be a way around the anchor,
 * and the shortest way not to build one is not to write a second copy of the
 * check.
 *
 * What this module is NOT: a replacement for `verifyStoredSessionEvents` or
 * `verifyLedgerIntegrity`. It authenticates ONE row well enough to trust the
 * commitment inside it. Whether that row belongs to an unbroken chain, in the
 * right order, in a sealed session, is the whole-log verifier's question, and a
 * caller who cares should ask it too.
 */
import type { EvidenceEvent } from "../../types.js";
import { canonicalMetadataForHash } from "../../ledger/eventHash.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../../crypto/keys.js";
import { verifyMonitorTrustRoot } from "../../persistence/sessionStoreVerification.js";
import { sha256Hex } from "../../utils/hash.js";
import { readSpilled, spillRoot, type SpillReadStatus } from "./spillStore.js";
import { extractSpillRef, parseSpillLocator, SPILL_META_KEY, type SpillRef } from "./spillTypes.js";

export interface SpillRetrievalOptions {
  /**
   * Pinned monitor-key fingerprint. Defaults to `AMC_EXPECTED_MONITOR_FINGERPRINT`,
   * exactly as `verifyStoredSessionEvents` does, so an anchored workspace stays
   * anchored on this path without the caller remembering to say so.
   */
  readonly expectedMonitorFingerprint?: string;
  /** Spill root override. Present for tests and for reading an exported bundle. */
  readonly root?: string;
}

/**
 * Outcomes, kept distinct because they mean different things to an operator.
 *
 * `missing` is what retention or a cleaned tmpdir looks like; `tampered` is what
 * an attack looks like. Collapsing them into one "unavailable" would report a
 * purge as an incident, and — the direction that actually matters — would let a
 * real modification hide among the purges.
 */
export type SpillEvidenceStatus = "ok" | "not-spilled" | "invalid-reference" | "row-unauthentic" | SpillReadStatus;

export interface SpillEvidenceResult {
  readonly eventId: string;
  readonly status: SpillEvidenceStatus;
  readonly detail: string | null;
  readonly bytes: Buffer | null;
  readonly ref: SpillRef | null;
}

/**
 * Recompute the row's own hash and check the monitor signature over it.
 *
 * Returns an error string rather than throwing so callers can accumulate
 * findings across many rows. The pre-image is built with the same helper the
 * writer uses; if the two ever diverge, every row fails rather than every row
 * silently passing.
 */
function rowAuthenticityError(event: EvidenceEvent, monitorKeys: readonly string[]): string | null {
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
  const recomputed = sha256Hex(`${event.prev_event_hash}${canonicalMetadata}${event.payload_sha256}`);
  if (recomputed !== event.event_hash) {
    return `Event ${event.id} event_hash mismatch — its spill commitment is not the one that was signed`;
  }
  if (!verifyHexDigestAny(event.event_hash, event.writer_sig, [...monitorKeys])) {
    return `Event ${event.id} writer signature invalid`;
  }
  return null;
}

function resolveExpectedFingerprint(options: SpillRetrievalOptions): string | null {
  return options.expectedMonitorFingerprint ?? process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"] ?? null;
}

/**
 * The workspace-level half of authentication, resolved ONCE.
 *
 * The trust-root comparison and the monitor key history are properties of the
 * workspace, not of a row, and both are file reads. Resolving them per row would
 * make a sweep over a session's log do O(rows) key reads for one unchanging
 * answer — the same shape the P2.2 blob index had to have removed from it.
 */
interface SpillAuthContext {
  readonly monitorKeys: readonly string[];
  readonly trustError: string | null;
  readonly root: string;
}

function spillAuthContext(workspace: string, options: SpillRetrievalOptions): SpillAuthContext {
  const trustErrors: string[] = [];
  verifyMonitorTrustRoot(workspace, resolveExpectedFingerprint(options), trustErrors);
  let monitorKeys: readonly string[] = [];
  try {
    monitorKeys = getPublicKeyHistory(workspace, "monitor");
  } catch {
    // No monitor key at all. Leaving the list empty makes every signature check
    // fail, which is the fail-closed reading: a workspace that cannot say who
    // signed a row cannot hand back bytes on the strength of that row.
    monitorKeys = [];
  }
  return {
    monitorKeys,
    trustError: trustErrors[0] ?? null,
    root: options.root ?? spillRoot(workspace)
  };
}

function authenticateWithContext(
  workspace: string,
  event: EvidenceEvent,
  resolveContext: SpillAuthContext | (() => SpillAuthContext)
): SpillEvidenceResult {
  const ref = extractSpillRef(event.meta_json);
  if (ref === null) {
    try {
      const meta: unknown = JSON.parse(event.meta_json);
      if (typeof meta !== "object" || meta === null || Array.isArray(meta)) throw new Error("invalid metadata");
      const declared = (meta as Record<string, unknown>)[SPILL_META_KEY];
      if (declared === null || declared === undefined) {
        return { eventId: event.id, status: "not-spilled", detail: null, bytes: null, ref: null };
      }
    } catch {
      // An unreadable declaration cannot establish that the event never spilled.
    }
    return { eventId: event.id, status: "invalid-reference", detail: "malformed or unsupported spill reference", bytes: null, ref: null };
  }

  const context = typeof resolveContext === "function" ? resolveContext() : resolveContext;
  const authError = context.trustError ?? rowAuthenticityError(event, context.monitorKeys);
  if (authError !== null) {
    return { eventId: event.id, status: "row-unauthentic", detail: authError, bytes: null, ref };
  }

  if (ref.locator !== null) {
    const locator = parseSpillLocator(ref.locator);
    if (locator === null || locator.sessionHash !== sha256Hex(event.session_id) || locator.version !== ref.v) {
      return { eventId: event.id, status: "invalid-reference", detail: "spill locator does not identify this event's session and format", bytes: null, ref };
    }
  }
  return { eventId: event.id, status: "ok", detail: null, bytes: null, ref };
}

/** Authenticate only the signed reference. This does not read or verify the object. */
export function authenticateSpillReference(
  workspace: string,
  event: EvidenceEvent,
  options: SpillRetrievalOptions = {}
): SpillEvidenceResult {
  return authenticateWithContext(workspace, event, () => spillAuthContext(workspace, options));
}

/** One trust snapshot for a synchronous lifecycle inventory, resolved only if needed. */
export function createSpillReferenceAuthenticator(
  workspace: string,
  options: SpillRetrievalOptions = {}
): (event: EvidenceEvent) => SpillEvidenceResult {
  let context: SpillAuthContext | undefined;
  return (event) => authenticateWithContext(workspace, event, () => context ??= spillAuthContext(workspace, options));
}

/** Row authentication for lifecycle control events; does not verify a whole chain. */
export function spillLifecycleEventAuthenticityError(
  workspace: string,
  event: EvidenceEvent,
  options: SpillRetrievalOptions = {}
): string | null {
  const context = spillAuthContext(workspace, options);
  return context.trustError ?? rowAuthenticityError(event, context.monitorKeys);
}

function inspectWithContext(
  workspace: string,
  event: EvidenceEvent,
  context: SpillAuthContext
): SpillEvidenceResult {
  const authenticated = authenticateWithContext(workspace, event, context);
  if (authenticated.status !== "ok" || authenticated.ref === null) return authenticated;
  const ref = authenticated.ref;

  const read = readSpilled(workspace, ref, context.root);
  if (read.status === "ok") {
    return { eventId: event.id, status: "ok", detail: null, bytes: read.bytes, ref };
  }
  return { eventId: event.id, status: read.status, detail: read.detail, bytes: null, ref };
}

/**
 * Inspect one event's spill without throwing: the form the verifier wants.
 *
 * A row that never spilled reports `not-spilled` and is not an error — most
 * rows are that.
 */
export function inspectSpilledEvent(
  workspace: string,
  event: EvidenceEvent,
  options: SpillRetrievalOptions = {}
): SpillEvidenceResult {
  return inspectWithContext(workspace, event, spillAuthContext(workspace, options));
}

/**
 * Retrieve the full spilled bytes for an event, or throw saying why not.
 *
 * The returned buffer has been proved equal-by-hash to what the signed event
 * committed to, so a caller may treat it as the tool output the model's preview
 * was cut from — which is the point of the whole mechanism.
 */
export function retrieveSpilledContent(
  workspace: string,
  event: EvidenceEvent,
  options: SpillRetrievalOptions = {}
): Buffer {
  const result = inspectSpilledEvent(workspace, event, options);
  if (result.status === "ok" && result.bytes !== null) {
    return result.bytes;
  }
  if (result.status === "not-spilled") {
    throw new Error(`Event ${event.id} did not spill: its payload is the whole result`);
  }
  throw new Error(`spill retrieval failed (${result.status}): ${result.detail ?? "no detail"}`);
}

export interface SpillVerifyResult {
  /** False when any spilled row is unauthentic, tampered, or has an unusable locator. */
  readonly ok: boolean;
  readonly errors: readonly string[];
  /** Rows whose object is simply gone. Reported, not counted as failure — see below. */
  readonly missing: readonly string[];
  readonly checked: number;
}

/**
 * Sweep a log's spilled rows and hold every retained object to its commitment.
 *
 * `missing` is deliberately not an error. A spill object is a cache of bytes the
 * signed log already commits to, and deleting one is a legitimate operation —
 * retention, a purged session, a wiped tmpdir. Making absence fail would either
 * force spill objects to live forever or make routine cleanup look like an
 * attack. What is NOT tolerated is an object that is present and different: that
 * is a modification of evidence and it lands in `errors`.
 */
export function verifySpilledContent(
  workspace: string,
  rows: readonly EvidenceEvent[],
  options: SpillRetrievalOptions = {}
): SpillVerifyResult {
  const errors: string[] = [];
  const missing: string[] = [];
  const context = spillAuthContext(workspace, options);
  let checked = 0;
  for (const event of rows) {
    const result = inspectWithContext(workspace, event, context);
    if (result.status === "not-spilled") {
      continue;
    }
    checked += 1;
    switch (result.status) {
      case "ok":
        break;
      case "missing":
      case "unretrievable":
        missing.push(`${event.id}: ${result.detail ?? result.status}`);
        break;
      default:
        errors.push(`${event.id}: ${result.detail ?? result.status}`);
        break;
    }
  }
  return { ok: errors.length === 0, errors, missing, checked };
}
