/**
 * Verification of the evidence ledger.
 *
 * Split out of ledger.ts as part of P2.1's decomposition. Two things follow
 * from putting it here rather than beside the writers:
 *
 * The evidence chain and the configuration signatures are verified separately.
 * They used to share one error list, so a gateway config that had been edited
 * reported as "ledger integrity failed" — indistinguishable from a rewritten
 * event. One is an operational problem, the other is a breach, and collapsing
 * them devalues the alarm that matters. `VerifyResult` now carries both halves
 * as well as the conjoined verdict, so no caller gets a weaker answer than it
 * had while every caller can tell the two apart.
 *
 * Verification does not initialize trust keys, migrate the schema, or rewrite
 * evidence data. SQLite may create WAL coordination sidecars while opening a
 * read-only connection; live WAL contents must remain visible to verification.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getPublicKeyHistory, getPublicKeyPem, verifyHexDigestAny } from "../crypto/keys.js";
import { pathExists } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { verifyGatewayConfigSignature } from "../gateway/config.js";
import { buildRetentionProofIndex, type RetentionProofIndex } from "../ops/retention/retentionArchive.js";
import { listAgents, verifyAgentConfigSignature, verifyFleetConfigSignature } from "../fleet/registry.js";
import { listWorkOrders, verifyWorkOrder } from "../workorders/workorderEngine.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { verifyEvidencePayload } from "./retentionVerification.js";
import { openLedger, targetsDir, canonicalMetadataForHash, type Ledger, type EvidenceLedgerReader } from "./ledger.js";
import { extractEnvelope } from "../session/sessionTypes.js";
import { readSessionWriter } from "../session/sessionOwnership.js";
import { verifySessionChains } from "./sessionVerification.js";
import { verifyAlternateBackendEvidence } from "./alternateBackendVerification.js";
import { readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import type { EvidenceEvent } from "../types.js";

/**
 * Default heartbeat window for the OPEN vs INTERRUPTED verdict on an unsealed,
 * unclosed agent session without a completed signed handoff. 60s: long enough
 * that a slow turn is not misread as a crash, short enough to surface a stale tail. A
 * caller can override it per verification via LedgerVerifyOptions.
 */
export const SESSION_STALE_AFTER_MS = 60_000;

export interface VerifyResult {
  /** Everything below, conjoined. Unchanged: no caller gets a weaker verdict. */
  ok: boolean;
  /** Every error, in one list. Unchanged: no caller loses information. */
  errors: string[];
  /**
   * The evidence chain alone: hash linkage and signatures over events,
   * sessions, runs and outcome events.
   *
   * Kept apart from `governance` because the two answer different questions. A
   * misconfigured gateway and a rewritten event both used to surface as
   * "ledger integrity failed", which reads as tampering. One is an operational
   * problem; the other is a breach. Reporting them as the same thing devalues
   * the alarm that matters.
   */
  chain: { ok: boolean; errors: string[] };
  /**
   * Configuration and governance signatures: targets, fleet, action policy,
   * gateway config. A failure here means a config is unsigned or was edited,
   * not that recorded evidence was altered.
   */
  governance: { ok: boolean; errors: string[] };
  /**
   * What the verdict above actually rests on.
   *
   * `anchored` is false when no expected fingerprint was supplied, which means
   * the run proved internal consistency and nothing about authorship. Reporting
   * a bare "PASSED" for that case overstates it, so the flag is part of the
   * result rather than a detail of the CLI.
   */
  trustRoot: {
    anchored: boolean;
    monitorFingerprint: string | null;
    expectedFingerprint: string | null;
  };
  /**
   * Per-session lifecycle verdicts for agent sessions — those whose events carry
   * a SessionEnvelope, or that opened with a `session/open` event.
   *
   * Openness is derived from the ABSENCE of a chained, signed `session/close`
   * event, not from a nullable seal column, so it cannot be manufactured by
   * NULLing a field. RELEASED identifies a verified explicit handoff with no unsealed turn.
   * OPEN and INTERRUPTED are surfaced here rather than pushed to
   * `chain.errors`: a running or crashed agent must not make its own workspace
   * fail verification, yet an interrupted session must never be laundered into a
   * clean seal — the two are reported distinctly. Legacy (non-agent) sessions
   * keep the strict must-be-sealed rule and are not listed here; an unsealed one
   * is a `chain` error exactly as before.
   */
  sessions: {
    /** Unclosed agent sessions without an accepted handoff, within the staleness window. Not an error. */
    open: readonly string[];
    /** Verified terminal signed handoff with a released owner and no unsealed turn; remains resumable regardless of age. */
    released: readonly string[];
    /** Agent sessions with no `session/close` without an accepted handoff whose last event is older than the staleness window. */
    interrupted: readonly string[];
    /** Agent sessions closed by a `session/close` event and carrying a valid row seal. */
    closed: readonly string[];
  };
}

export interface LedgerVerifyOptions {
  externallyAuthenticatedPayloads?: ReadonlyMap<string, string>;
  /**
   * SHA-256 of the monitor public key PEM this workspace is expected to use.
   *
   * Without it, verification is not adversarial. Every signature is checked
   * against `.amc/keys/monitor_ed25519.pub`, which lives inside the workspace,
   * so anyone who can rewrite the evidence can also replace the key it is
   * checked against and re-sign everything. Demonstrated, not theorised: doing
   * exactly that yields chain.ok = true with no errors.
   *
   * The fingerprint therefore has to come from outside the workspace — an
   * operator's records, a deployment manifest, a notary — or the verdict says
   * only "these bytes are internally consistent".
   */
  expectedMonitorFingerprint?: string;
  /**
   * How long an agent session may go without a new event before an unsealed,
   * unclosed session without an accepted handoff is judged INTERRUPTED rather
   * than OPEN. Defaults to SESSION_STALE_AFTER_MS. Exposed so a caller — or a test — can pin the window
   * instead of depending on wall-clock timing.
   */
  sessionStaleAfterMs?: number;
}


export function verifyEvidenceEventIntegrity(input: {
  ledger: EvidenceLedgerReader;
  eventId: string;
  requireReceipt?: boolean;
  requireSealedSession?: boolean;
}): VerifyResult {
  const errors: string[] = [];
  const event = input.ledger.db.prepare(
    "SELECT rowid AS row_id, * FROM evidence_events WHERE id = ? LIMIT 1"
  ).get(input.eventId) as (EvidenceEvent & { row_id: number }) | undefined;
  if (!event) {
    return chainOnlyResult([`Missing evidence event ${input.eventId}`]);
  }

  const monitorKeys = getPublicKeyHistory(input.ledger.workspace, "monitor");
  const retentionProofs = event.archived === 1 || event.payload_pruned === 1
    ? buildRetentionProofIndex(input.ledger.workspace)
    : undefined;
  if (retentionProofs && !retentionProofs.ok) errors.push(...retentionProofs.errors);
  verifyEvidencePayload(event, input.ledger.workspace, errors, undefined, retentionProofs);
  const prefix = input.ledger.db.prepare(
    "SELECT * FROM evidence_events WHERE rowid <= ? ORDER BY rowid ASC"
  ).all(event.row_id) as EvidenceEvent[];
  let previousHash = "GENESIS";
  for (const prefixEvent of prefix) {
    if (prefixEvent.prev_event_hash !== previousHash) {
      errors.push(`Event ${prefixEvent.id} previous hash mismatch`);
    }
    const canonicalMetadata = canonicalMetadataForHash({
      id: prefixEvent.id,
      ts: prefixEvent.ts,
      sessionId: prefixEvent.session_id,
      runtime: prefixEvent.runtime,
      eventType: prefixEvent.event_type,
      payloadPath: prefixEvent.canonical_payload_path ?? prefixEvent.payload_path,
      payloadInline: prefixEvent.canonical_payload_inline ?? prefixEvent.payload_inline,
      metaJson: prefixEvent.meta_json
    });
    const recalculated = sha256Hex(`${prefixEvent.prev_event_hash}${canonicalMetadata}${prefixEvent.payload_sha256}`);
    if (recalculated !== prefixEvent.event_hash) errors.push(`Event ${prefixEvent.id} event_hash mismatch`);
    if (!verifyHexDigestAny(prefixEvent.event_hash, prefixEvent.writer_sig, monitorKeys)) {
      errors.push(`Event ${prefixEvent.id} writer signature invalid`);
    }
    previousHash = prefixEvent.event_hash;
  }

  let meta: Record<string, unknown> | null = null;
  try {
    meta = JSON.parse(event.meta_json) as Record<string, unknown>;
  } catch {
    errors.push(`Event ${event.id} metadata is invalid JSON`);
  }
  const receipt = typeof meta?.receipt === "string" && meta.receipt.length > 0 ? meta.receipt : null;
  if (!receipt) {
    if (input.requireReceipt) errors.push(`Event ${event.id} receipt missing`);
  } else {
    const verified = verifyReceipt(receipt, monitorKeys);
    if (!verified.ok || !verified.payload) {
      errors.push(`Event ${event.id} receipt verification failed`);
    } else {
      if (verified.payload.event_hash !== event.event_hash) errors.push(`Event ${event.id} receipt event_hash mismatch`);
      if (verified.payload.session_id !== event.session_id) errors.push(`Event ${event.id} receipt session mismatch`);
      const expectedBodySha = typeof meta?.bodySha256 === "string" && meta.bodySha256.length === 64
        ? meta.bodySha256
        : event.payload_sha256;
      if (verified.payload.body_sha256 !== expectedBodySha) errors.push(`Event ${event.id} receipt body_sha256 mismatch`);
      if (typeof meta?.receipt_id !== "string" || meta.receipt_id !== verified.payload.receipt_id) {
        errors.push(`Event ${event.id} receipt_id mismatch`);
      }
    }
    if (typeof meta?.receipt_sha256 !== "string" || sha256Hex(Buffer.from(receipt, "utf8")) !== meta.receipt_sha256) {
      errors.push(`Event ${event.id} receipt_sha256 mismatch`);
    }
  }

  if (input.requireSealedSession) {
    const session = input.ledger.db.prepare(
      "SELECT session_final_event_hash, session_seal_sig FROM sessions WHERE session_id = ? LIMIT 1"
    ).get(event.session_id) as { session_final_event_hash: string | null; session_seal_sig: string | null } | undefined;
    const last = input.ledger.db.prepare(
      "SELECT event_hash FROM evidence_events WHERE session_id = ? ORDER BY rowid DESC LIMIT 1"
    ).get(event.session_id) as { event_hash: string } | undefined;
    if (!session || !session.session_final_event_hash || !session.session_seal_sig || !last) {
      errors.push(`Session ${event.session_id} missing seal`);
    } else {
      if (session.session_final_event_hash !== last.event_hash) errors.push(`Session ${event.session_id} final hash mismatch`);
      if (!verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, monitorKeys)) {
        errors.push(`Session ${event.session_id} seal signature invalid`);
      }
    }
  }

  return chainOnlyResult(errors);
}

/**
 * A verdict from a check that only inspects the evidence chain.
 *
 * Its governance half is vacuously clean because it examined no configuration —
 * which is different from having examined it and found it sound, and callers
 * that need the latter run verifyLedgerIntegrity.
 */
function chainOnlyResult(errors: string[]): VerifyResult {
  return {
    ok: errors.length === 0,
    errors,
    chain: { ok: errors.length === 0, errors },
    governance: { ok: true, errors: [] },
    // Unanchored: this check inspected rows, not the key they were signed with.
    trustRoot: { anchored: false, monitorFingerprint: null, expectedFingerprint: null },
    // This check inspects a single event, not the whole session population, so it
    // makes no lifecycle claim about any session.
    sessions: { open: [], released: [], interrupted: [], closed: [] }
  };
}

function verifyEvents(
  ledger: Ledger,
  workspace: string,
  errors: string[],
  externallyAuthenticatedPayloads?: ReadonlyMap<string, string>
): void {
  const events = ledger.getAllEvents();
  const retentionProofs = events.some((event) => event.archived === 1 || event.payload_pruned === 1)
    ? buildRetentionProofIndex(workspace)
    : undefined;
  if (retentionProofs && !retentionProofs.ok) errors.push(...retentionProofs.errors);
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const eventByHash = new Map<string, EvidenceEvent>();
  for (const event of events) {
    eventByHash.set(event.event_hash, event);
  }

  let previous = "GENESIS";
  for (const event of events) {
    verifyEvidencePayload(event, workspace, errors, externallyAuthenticatedPayloads, retentionProofs);

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

    const recalculated = sha256Hex(`${event.prev_event_hash}${canonicalMetadata}${event.payload_sha256}`);
    if (recalculated !== event.event_hash) {
      errors.push(`Event ${event.id} event_hash mismatch`);
    }

    if (!verifyHexDigestAny(event.event_hash, event.writer_sig, monitorKeys)) {
      errors.push(`Event ${event.id} writer signature invalid`);
    }

    try {
      const meta = JSON.parse(event.meta_json) as Record<string, unknown>;
      if (typeof meta.receipt === "string" && meta.receipt.length > 0) {
        const verifyReceiptResult = verifyReceipt(meta.receipt, monitorKeys);
        if (!verifyReceiptResult.ok || !verifyReceiptResult.payload) {
          errors.push(`Event ${event.id} receipt verification failed: ${verifyReceiptResult.error ?? "unknown"}`);
        } else {
          const payload = verifyReceiptResult.payload;
          if (payload.event_hash !== event.event_hash) {
            errors.push(`Event ${event.id} receipt event_hash mismatch`);
          }
          if (payload.session_id !== event.session_id) {
            errors.push(`Event ${event.id} receipt session mismatch`);
          }
          if (typeof meta.receipt_id === "string" && meta.receipt_id !== payload.receipt_id) {
            errors.push(`Event ${event.id} receipt_id mismatch`);
          }
          const expectedBodySha =
            typeof meta.bodySha256 === "string" && meta.bodySha256.length === 64
              ? meta.bodySha256
              : event.payload_sha256;
          if (payload.body_sha256 !== expectedBodySha) {
            errors.push(`Event ${event.id} receipt body_sha256 mismatch`);
          }
          if (typeof meta.receipt_sha256 === "string") {
            const actualReceiptSha = sha256Hex(Buffer.from(meta.receipt, "utf8"));
            if (actualReceiptSha !== meta.receipt_sha256) {
              errors.push(`Event ${event.id} receipt_sha256 mismatch`);
            }
          }
          if (!eventByHash.has(payload.event_hash)) {
            errors.push(`Event ${event.id} receipt references missing event_hash`);
          }
        }
      }
    } catch {
      // non-JSON or invalid meta is handled elsewhere.
    }

    previous = event.event_hash;
  }
}

/**
 * The verdict verifySessions reaches for each agent session, surfaced on
 * VerifyResult without weakening chain.ok. Legacy (non-agent) sessions never
 * appear here — they keep the strict must-be-sealed rule enforced via `errors`.
 */
interface SessionLifecycle {
  open: string[];
  released: string[];
  interrupted: string[];
  closed: string[];
}


function verifySessions(
  ledger: Ledger,
  workspace: string,
  errors: string[],
  staleAfterMs: number
): SessionLifecycle {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const sessions = ledger.getAllSessions();
  const events = ledger.getAllEvents();

  // One pass gathers the per-session facts. lastEvent* take the final value
  // because events arrive in rowid (append) order, so the last write wins.
  const lastEventBySession = new Map<string, EvidenceEvent>();
  const unsealedTurns = new Set<string>();
  const lastEventHashBySession = new Map<string, string>();
  const lastEventTsBySession = new Map<string, number>();
  const openedSessions = new Set<string>();
  const closedSessions = new Set<string>();
  const agentSessions = new Set<string>();
  for (const event of events) {
    lastEventBySession.set(event.session_id, event);
    if (event.event_type === "turn/start") unsealedTurns.add(event.session_id);
    if (event.event_type === "turn/seal") unsealedTurns.delete(event.session_id);
    lastEventHashBySession.set(event.session_id, event.event_hash);
    lastEventTsBySession.set(event.session_id, event.ts);
    if (event.event_type === "session/open") openedSessions.add(event.session_id);
    if (event.event_type === "session/close") closedSessions.add(event.session_id);
    if (extractEnvelope(event.meta_json) !== null) agentSessions.add(event.session_id);
  }

  const knownSessionIds = new Set(sessions.map((session) => session.session_id));
  for (const event of events) {
    if (!knownSessionIds.has(event.session_id)) {
      errors.push(`Event ${event.id} references missing session ${event.session_id}`);
    }
  }

  const lifecycle: SessionLifecycle = { open: [], released: [], interrupted: [], closed: [] };
  // verifyEvents and verifySessionChains ran first. Never accept a handoff
  // from unauthenticated evidence; lifecycle labels do not suppress their errors.
  const authenticatedEvidence = errors.length === 0;
  const now = Date.now();

  for (const session of sessions) {
    if (session.ended_ts !== null && session.ended_ts < session.started_ts) {
      errors.push(`Session ${session.session_id} has ended_ts earlier than started_ts`);
    }

    const isAgentSession =
      openedSessions.has(session.session_id) || agentSessions.has(session.session_id);
    const isClosed = closedSessions.has(session.session_id);

    // An agent session with no chained, signed session/close is live, not broken.
    // Its openness is read from the ABSENCE of that event — not from a nullable
    // seal column an attacker could NULL — so it cannot be manufactured. A recent
    // heartbeat reads as OPEN; a stale tail as INTERRUPTED, unless an explicit
    // verified handoff ended ownership after sealing the turn. Neither is an error,
    // and the two are kept distinct so an interruption is never mistaken for a
    // clean seal.
    if (isAgentSession && !isClosed) {
      const tail = lastEventBySession.get(session.session_id) ?? null;
      if (authenticatedEvidence && tail?.event_type === "session/release"
        && extractEnvelope(tail.meta_json) !== null && readSessionWriter(tail)?.state === "released"
        && !unsealedTurns.has(session.session_id)) {
        lifecycle.released.push(session.session_id);
        continue;
      }
      const lastTs = lastEventTsBySession.get(session.session_id) ?? session.started_ts;
      if (now - lastTs <= staleAfterMs) lifecycle.open.push(session.session_id);
      else lifecycle.interrupted.push(session.session_id);
      continue;
    }

    // Everything else keeps today's strict rule verbatim — a closed agent session
    // and every legacy (non-agent) session must carry a valid row seal.
    const expectedFinalHash = lastEventHashBySession.get(session.session_id) ?? sha256Hex("EMPTY_SESSION");
    if (!session.session_final_event_hash || !session.session_seal_sig) {
      errors.push(`Session ${session.session_id} missing seal`);
      continue;
    }
    let sealOk = true;
    if (session.session_final_event_hash !== expectedFinalHash) {
      errors.push(`Session ${session.session_id} final hash mismatch`);
      sealOk = false;
    }
    if (!verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, monitorKeys)) {
      errors.push(`Session ${session.session_id} seal signature invalid`);
      sealOk = false;
    }
    if (isAgentSession && isClosed && sealOk) lifecycle.closed.push(session.session_id);
  }

  return lifecycle;
}

function verifyRuns(ledger: Ledger, workspace: string, errors: string[]): void {
  const auditorKeys = getPublicKeyHistory(workspace, "auditor");
  const runs = ledger.getAllRuns();
  for (const run of runs) {
    if (!verifyHexDigestAny(run.report_json_sha256, run.run_seal_sig, auditorKeys)) {
      errors.push(`Run ${run.run_id} seal signature invalid`);
    }
  }

  const assuranceRuns = ledger.getAllAssuranceRuns();
  for (const run of assuranceRuns) {
    if (!verifyHexDigestAny(run.report_json_sha256, run.run_seal_sig, auditorKeys)) {
      errors.push(`Assurance run ${run.assurance_run_id} seal signature invalid`);
    }
  }
}

function verifyOutcomeEvents(ledger: Ledger, workspace: string, errors: string[]): void {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const rows = ledger.getAllOutcomeEvents();
  let previous = "GENESIS_OUTCOME";
  for (const row of rows) {
    if (row.prev_event_hash !== previous) {
      errors.push(`Outcome event ${row.outcome_event_id} previous hash mismatch`);
    }
    const metaJson = row.meta_json;
    let parsedValue: unknown = row.value;
    try {
      parsedValue = JSON.parse(row.value);
    } catch {
      parsedValue = row.value;
    }
    const recalculated = sha256Hex(
      `${row.prev_event_hash}${canonicalize({
        outcome_event_id: row.outcome_event_id,
        ts: row.ts,
        agent_id: row.agent_id,
        work_order_id: row.work_order_id,
        category: row.category,
        metric_id: row.metric_id,
        value: parsedValue,
        unit: row.unit,
        trust_tier: row.trust_tier,
        source: row.source,
        meta_json: metaJson,
        payload_sha256: row.payload_sha256
      })}`
    );
    if (recalculated !== row.event_hash) {
      errors.push(`Outcome event ${row.outcome_event_id} event_hash mismatch`);
    }
    if (!verifyHexDigestAny(row.event_hash, row.signature, monitorKeys)) {
      errors.push(`Outcome event ${row.outcome_event_id} signature invalid`);
    }
    const verifiedReceipt = verifyReceipt(row.receipt, monitorKeys);
    if (!verifiedReceipt.ok || !verifiedReceipt.payload) {
      errors.push(`Outcome event ${row.outcome_event_id} receipt invalid`);
    } else {
      if (verifiedReceipt.payload.event_hash !== row.event_hash) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt event hash mismatch`);
      }
      if (verifiedReceipt.payload.body_sha256 !== row.payload_sha256) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt payload hash mismatch`);
      }
      if (verifiedReceipt.payload.receipt_id !== row.receipt_id) {
        errors.push(`Outcome event ${row.outcome_event_id} receipt id mismatch`);
      }
    }
    previous = row.event_hash;
  }
}

function verifyTargets(workspace: string, errors: string[]): void {
  const auditorKeys = getPublicKeyHistory(workspace, "auditor");
  const dir = targetsDir(workspace);
  if (!pathExists(dir)) {
    return;
  }

  const files = readdirSync(dir).filter((f) => f.endsWith(".target.json"));

  for (const file of files) {
    const full = join(dir, file);
    const raw = readFileSync(full, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const signature = String(parsed.signature ?? "");
    const clone = { ...parsed };
    delete clone.signature;
    const digest = sha256Hex(canonicalize(clone));

    if (!verifyHexDigestAny(digest, signature, auditorKeys)) {
      errors.push(`Target profile signature invalid: ${file}`);
    }
  }
}

function verifyFleetAndAgents(workspace: string, errors: string[]): void {
  const fleetSig = verifyFleetConfigSignature(workspace);
  if (fleetSig.signatureExists && !fleetSig.valid) {
    errors.push(`Fleet config signature invalid: ${fleetSig.reason ?? "unknown reason"}`);
  }

  const actionPolicySig = verifyActionPolicySignature(workspace);
  if (actionPolicySig.signatureExists && !actionPolicySig.valid) {
    errors.push(`Action policy signature invalid: ${actionPolicySig.reason ?? "unknown reason"}`);
  }

  const toolsSig = verifyToolsConfigSignature(workspace);
  if (toolsSig.signatureExists && !toolsSig.valid) {
    errors.push(`Tools config signature invalid: ${toolsSig.reason ?? "unknown reason"}`);
  }

  const agents = listAgents(workspace);
  for (const agent of agents) {
    if (!agent.hasConfig) {
      continue;
    }
    const sig = verifyAgentConfigSignature(workspace, agent.id);
    if (!sig.valid) {
      errors.push(`Agent config signature invalid for ${agent.id}: ${sig.reason ?? "unknown reason"}`);
    }

    for (const row of listWorkOrders({ workspace, agentId: agent.id })) {
      const verify = verifyWorkOrder({ workspace, agentId: agent.id, workOrderId: row.workOrderId });
      if (!verify.valid) {
        errors.push(`Work order signature invalid for ${agent.id}/${row.workOrderId}: ${verify.reason ?? "unknown reason"}`);
      }
    }
  }
}

/**
 * Synchronous, and deliberately so.
 *
 * This was declared `async` while its body awaited nothing — every read is a
 * better-sqlite3 call or a `readFileSync`. The Promise bought no concurrency and
 * cost callers their own colour: anything wanting to verify a ledger had to
 * become async too, which is how `exportSessionAnchorProof` acquired an async
 * signature and ~20 call sites acquired an `await`, for a function that never
 * yielded.
 *
 * Existing `await verifyLedgerIntegrity(...)` call sites keep working unchanged:
 * awaiting a non-thenable is legal and still queues a microtask, so ordering is
 * preserved. They are now redundant rather than wrong, and can go one at a time.
 */
export function verifyLedgerIntegrity(
  workspacePath: string,
  options: LedgerVerifyOptions = {}
): VerifyResult {
  let ledger: Ledger | null = null;
  const chainErrors: string[] = [];
  const governanceErrors: string[] = [];
  const staleAfterMs = options.sessionStaleAfterMs ?? SESSION_STALE_AFTER_MS;
  let sessionLifecycle: SessionLifecycle = { open: [], released: [], interrupted: [], closed: [] };

  // The trust root comes first: if the key every signature is checked against
  // is not the key the operator expects, nothing below this line means
  // anything. An explicit option wins over the environment so a caller can
  // verify one workspace against a specific key without changing process state.
  const expectedFingerprint =
    options.expectedMonitorFingerprint ?? process.env["AMC_EXPECTED_MONITOR_FINGERPRINT"] ?? null;
  let monitorFingerprint: string | null = null;
  try {
    monitorFingerprint = sha256Hex(Buffer.from(getPublicKeyPem(workspacePath, "monitor"), "utf8"));
  } catch {
    // No monitor key at all. verifyEvents reports the consequences per event;
    // recording null here keeps the trust-root verdict honest rather than
    // claiming a match against a key that is absent.
    monitorFingerprint = null;
  }
  if (expectedFingerprint) {
    if (!monitorFingerprint) {
      chainErrors.push("trust root: no monitor public key present to compare against the expected fingerprint");
    } else if (monitorFingerprint !== expectedFingerprint) {
      chainErrors.push(
        `trust root: monitor key fingerprint ${monitorFingerprint.slice(0, 16)}… does not match the expected ` +
          `${expectedFingerprint.slice(0, 16)}… — the evidence may have been re-signed with a substituted key`
      );
    }
  }

  // A workspace pinned to the JSONL backend keeps its evidence in
  // .amc/sessions/*.jsonl, not in the evidence_events table this function
  // reads. Verifying only the table would find it EMPTY and report success —
  // demonstrated: a JSONL workspace whose evidence had been openly rewritten
  // returned chain.ok = true with no errors. A verifier that cannot see the
  // evidence must never call it verified, so the JSONL rows are verified
  // through the backend-independent verifier and their failures land here.
  try {
    const jsonlBackend = readSessionStoreMarker(workspacePath) === "jsonl";
    if (pathExists(join(workspacePath, ".amc", "evidence.sqlite"))) {
      ledger = openLedger(workspacePath, { readonly: true });
    } else if (!jsonlBackend) {
      chainErrors.push("Evidence ledger is missing; verification does not initialize a workspace");
    }
    chainErrors.push(...verifyAlternateBackendEvidence(workspacePath, expectedFingerprint));
    if (ledger) {
      verifyEvents(ledger, workspacePath, chainErrors, options.externallyAuthenticatedPayloads);
      verifySessionChains(ledger, chainErrors);
      sessionLifecycle = verifySessions(ledger, workspacePath, chainErrors, staleAfterMs);
      verifyRuns(ledger, workspacePath, chainErrors);
      verifyOutcomeEvents(ledger, workspacePath, chainErrors);
    }
    if (ledger || jsonlBackend) {
      try {
        verifyTargets(workspacePath, governanceErrors);
        verifyFleetAndAgents(workspacePath, governanceErrors);
        const gatewaySig = verifyGatewayConfigSignature(workspacePath);
        if (gatewaySig.signatureExists && !gatewaySig.valid) {
          governanceErrors.push(`Gateway config signature invalid: ${gatewaySig.reason ?? "unknown reason"}`);
        }
      } catch (error) {
        governanceErrors.push(`Governance verification could not complete: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    chainErrors.push(`Evidence verification could not complete: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    ledger?.close();
  }

  const errors = [...chainErrors, ...governanceErrors];
  return {
    ok: errors.length === 0,
    errors,
    chain: { ok: chainErrors.length === 0, errors: chainErrors },
    governance: { ok: governanceErrors.length === 0, errors: governanceErrors },
    trustRoot: {
      anchored: Boolean(expectedFingerprint) && monitorFingerprint === expectedFingerprint,
      monitorFingerprint,
      expectedFingerprint
    },
    sessions: {
      open: sessionLifecycle.open,
      released: sessionLifecycle.released,
      interrupted: sessionLifecycle.interrupted,
      closed: sessionLifecycle.closed
    }
  };
}
