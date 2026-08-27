import { randomUUID } from "node:crypto";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { verifyEvidenceEventIntegrity, SESSION_STALE_AFTER_MS } from "../ledger/ledgerVerification.js";
import type { Ledger } from "../ledger/ledger.js";

/**
 * Accepting work over a wire, and saying so in a way that survives the server
 * (plan P7.1a).
 *
 * WHY THIS IS NOT AN "ENQUEUE RECEIPT". A `ReceiptPayloadV1` commits to an
 * `event_hash` and a `body_sha256`: it is a signed statement ABOUT A ROW THAT
 * ALREADY EXISTS, and `mintReceipt` has no path that produces one without
 * writing that row in the same transaction. A receipt for work that has not
 * happened would be the same word making a different claim — the same-name trap
 * this repository keeps finding.
 *
 * So the acceptance is not exempted from the rule; it is made to satisfy it.
 * ACCEPTING IS ITSELF AN EVENT. `work/accepted` is a real row in the chain, and
 * the receipt commits to that row in the ordinary way. The receipt still means
 * exactly what every other receipt means. It just says "accepted", not
 * "completed" — which is the honest shape of `delegation-started`, whose value
 * comes precisely from being observable when no completion ever follows.
 *
 * WHAT THE ROW COMMITS TO, and why there is no new identifier. The acceptance
 * NAMES THE SESSION THE WORK WILL APPEAR IN, minted here and signed into the
 * payload. That is a falsifiable promise: either that session exists and its
 * events are chained under it, or it does not and the promise is visibly
 * unkept. It also means "what happened to my work?" is answered by AMC's
 * existing session lifecycle rather than by a second state machine kept in
 * step with it by hand. Note `runs` is already the assessment-run table and
 * `PortalJob` is already a queue elsewhere; neither name is reused here.
 *
 * WHAT AN ACCEPTANCE DOES NOT PROMISE. Not that the work will run, not that it
 * will succeed, and not that it will finish. It records that a request was
 * received, what its bytes were, and where its execution would be logged. An
 * accepted request whose session never opens is the state this module exists to
 * make visible, not one it prevents.
 */

export const WORK_ACCEPTED_EVENT = "work/accepted";

/** What a caller asked for. Digested into the row, so it cannot be restated later. */
export interface WorkRequest {
  readonly prompt: string;
  readonly agentId: string;
  readonly providerId: string;
  readonly model: string | null;
}

export interface AcceptedWork {
  /** The session the work will be logged under. Signed into the acceptance. */
  readonly workSessionId: string;
  readonly receipt: string;
  readonly receiptId: string;
  /** The `work/accepted` row this receipt commits to. */
  readonly eventId: string;
  readonly requestSha256: string;
}

/** The exact bytes the acceptance digests. Canonical, so the digest is reproducible. */
function acceptanceBody(workSessionId: string, request: WorkRequest): string {
  return canonicalize({ v: 1, workSessionId, request });
}

/**
 * Record that a request was accepted, and commit to where its work will appear.
 *
 * The intake session is the ACCEPTOR's own session — a server's, for its
 * lifetime — and is deliberately not the work session. `SessionService` is the
 * single writer for a session it owns, so writing the acceptance into the
 * session the work will later use would put two writers on one spine.
 */
export function acceptWork(params: {
  readonly ledger: Ledger;
  readonly intakeSessionId: string;
  readonly request: WorkRequest;
}): AcceptedWork {
  const workSessionId = randomUUID();
  const body = acceptanceBody(workSessionId, params.request);
  const requestSha256 = sha256Hex(Buffer.from(body, "utf8"));

  const written = params.ledger.appendEvidenceWithReceipt({
    sessionId: params.intakeSessionId,
    runtime: "amc",
    eventType: WORK_ACCEPTED_EVENT,
    payload: body,
    payloadExt: "json",
    inline: true,
    meta: { agentId: params.request.agentId, trustTier: "OBSERVED" },
    receipt: {
      kind: "work_accepted",
      agentId: params.request.agentId,
      providerId: params.request.providerId,
      model: params.request.model,
      // Equal to the row's payload digest by construction, which is what
      // `verifyEvidenceEventIntegrity` checks against when no meta override is set.
      bodySha256: requestSha256
    }
  });

  return {
    workSessionId,
    receipt: written.receipt,
    receiptId: written.receiptId,
    eventId: written.id,
    requestSha256
  };
}

/**
 * What became of accepted work.
 *
 * `finished` means the session was closed, NOT that the work succeeded: a turn
 * that failed and closed cleanly lands here too. The outcome of the work is in
 * the work session's own rows; this states only that it stopped in an orderly way.
 */
export type WorkState = "not-started" | "running" | "abandoned" | "finished";

export type DescribedWork =
  | { readonly ok: false; readonly reason: string }
  | {
      readonly ok: true;
      readonly workSessionId: string;
      readonly request: WorkRequest;
      readonly state: WorkState;
    };

/**
 * Read one session's lifecycle from the append-only chain.
 *
 * Read from the PRESENCE of `session/open` and `session/close` rows rather than
 * from `sessions.session_seal_sig`, matching verifyLedgerIntegrity: the seal
 * column is nullable and therefore forgeable by clearing it, while the rows live
 * in a table with append-only triggers. A cheaper read of the nullable column
 * would report a wiped session as never-sealed instead of as tampered.
 */
function workSessionState(
  ledger: Ledger,
  sessionId: string,
  now: number,
  staleAfterMs: number
): WorkState {
  const row = ledger.db.prepare(
    `SELECT
       SUM(event_type = 'session/close') AS closed,
       COUNT(*) AS total,
       MAX(ts) AS last_ts
     FROM evidence_events WHERE session_id = ?`
  ).get(sessionId) as { closed: number | null; total: number; last_ts: number | null };

  if (row.total === 0) return "not-started";
  if ((row.closed ?? 0) > 0) return "finished";
  return now - (row.last_ts ?? 0) <= staleAfterMs ? "running" : "abandoned";
}

/**
 * Verify an acceptance receipt and report what happened to the work.
 *
 * The signature check is the CHEAP half and proves only that the monitor signed
 * these bytes. Everything that makes the receipt mean something comes from
 * anchoring it: the row it names must exist, must still hash into the chain at
 * its position, and must be a `work/accepted` row rather than any other row the
 * monitor also signed. That last check is not redundant — without it a receipt
 * minted for an unrelated event would verify here and be read as an acceptance.
 */
export function describeAcceptedWork(params: {
  readonly ledger: Ledger;
  readonly receipt: string;
  readonly monitorPublicKeys: readonly string[];
  readonly now?: number;
  readonly staleAfterMs?: number;
}): DescribedWork {
  const verified = verifyReceipt(params.receipt, [...params.monitorPublicKeys]);
  if (!verified.ok || !verified.payload) {
    return { ok: false, reason: `receipt did not verify: ${verified.error ?? "unknown"}` };
  }
  if (verified.payload.kind !== "work_accepted") {
    return { ok: false, reason: `receipt is a ${verified.payload.kind} receipt, not an acceptance` };
  }

  const row = params.ledger.db.prepare(
    "SELECT id, event_type, payload_inline FROM evidence_events WHERE event_hash = ? LIMIT 1"
  ).get(verified.payload.event_hash) as
    { id: string; event_type: string; payload_inline: string | null } | undefined;
  if (!row) {
    return { ok: false, reason: "receipt names an event that is not in this ledger" };
  }
  if (row.event_type !== WORK_ACCEPTED_EVENT) {
    return { ok: false, reason: `receipt names a ${row.event_type} event, not an acceptance` };
  }

  const anchored = verifyEvidenceEventIntegrity({
    ledger: params.ledger,
    eventId: row.id,
    requireReceipt: true
  });
  if (!anchored.ok) {
    return { ok: false, reason: `acceptance is not anchored: ${anchored.errors.join("; ")}` };
  }

  let body: { workSessionId?: unknown; request?: unknown };
  try {
    body = JSON.parse(row.payload_inline ?? "") as typeof body;
  } catch {
    return { ok: false, reason: "acceptance payload is not readable" };
  }
  const workSessionId = typeof body.workSessionId === "string" ? body.workSessionId : "";
  if (workSessionId.length === 0) {
    return { ok: false, reason: "acceptance names no work session" };
  }

  return {
    ok: true,
    workSessionId,
    request: body.request as WorkRequest,
    state: workSessionState(
      params.ledger,
      workSessionId,
      params.now ?? Date.now(),
      params.staleAfterMs ?? SESSION_STALE_AFTER_MS
    )
  };
}
