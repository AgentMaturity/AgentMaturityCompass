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
 * Nothing here writes. A verifier that can mutate what it verifies is not a
 * verifier, and keeping the boundary at the module edge makes that checkable.
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
import { loadBlobPlaintext } from "../storage/blobs/blobStore.js";
import { openLedger, targetsDir, canonicalMetadataForHash, type Ledger, type EvidenceLedgerReader } from "./ledger.js";
import type { EvidenceEvent } from "../types.js";

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
}


function verifyEvidencePayload(
  event: EvidenceEvent,
  workspace: string,
  errors: string[],
  externallyAuthenticatedPayloads?: ReadonlyMap<string, string>,
  retentionProofs?: RetentionProofIndex
): void {
  verifyEventRetentionState(event, workspace, errors, retentionProofs);
  if (event.payload_inline !== null) {
    const payloadSha = sha256Hex(Buffer.from(event.payload_inline, "utf8"));
    if (payloadSha !== event.payload_sha256) errors.push(`Event ${event.id} payload hash mismatch`);
    return;
  }

  const payloadPath = event.payload_pruned === 1
    ? event.canonical_payload_path ?? event.payload_path ?? null
    : event.payload_path ?? event.canonical_payload_path ?? null;
  if (event.payload_pruned === 1 && (!payloadPath || !pathExists(join(workspace, payloadPath)))) return;
  if (!payloadPath) {
    if (event.payload_sha256 !== sha256Hex(Buffer.alloc(0))) errors.push(`Event ${event.id} payload hash mismatch`);
    return;
  }
  if (!pathExists(join(workspace, payloadPath))) {
    errors.push(`Missing blob file for event ${event.id}`);
    return;
  }

  try {
    const loaded = loadBlobPlaintext(workspace, payloadPath);
    const plaintextSha = sha256Hex(loaded.bytes);
    if (plaintextSha !== event.payload_sha256 || loaded.payloadSha256 !== event.payload_sha256) {
      errors.push(`Event ${event.id} payload hash mismatch`);
    }
  } catch {
    const normalizedPath = payloadPath.replace(/\\/g, "/");
    const expectedStoredDigest = externallyAuthenticatedPayloads?.get(normalizedPath);
    if (expectedStoredDigest) {
      const actualStoredDigest = sha256Hex(readFileSync(join(workspace, payloadPath)));
      if (actualStoredDigest === expectedStoredDigest) return;
    }
    errors.push(`Event ${event.id} payload authentication failed`);
  }
}

function verifyArchivedEventRetentionProof(
  event: EvidenceEvent,
  errors: string[],
  retentionProofs?: RetentionProofIndex
): EvidenceEvent | null {
  const archivedState = event.archived ?? 0;
  if (archivedState === 0) {
    if (event.archive_segment_id != null || event.archive_manifest_sha256 != null) {
      errors.push(`Event ${event.id} archive references exist without archived state`);
    }
    return null;
  }
  if (archivedState !== 1 || !event.archive_segment_id || !event.archive_manifest_sha256) {
    errors.push(`Event ${event.id} archived retention state invalid`);
    return null;
  }
  if (!retentionProofs) {
    errors.push(`Event ${event.id} signed retention proof missing`);
    return null;
  }
  const archived = retentionProofs.archivedEvents.get(event.id);
  if (!archived) {
    errors.push(`Event ${event.id} archived retention proof missing`);
    return null;
  }
  if (
    archived.segmentId !== event.archive_segment_id
    || archived.manifestSha256 !== event.archive_manifest_sha256
  ) {
    errors.push(`Event ${event.id} archive reference mismatch`);
  }

  const original = archived.event;
  const immutableFields: Array<keyof EvidenceEvent> = [
    "id",
    "ts",
    "session_id",
    "runtime",
    "event_type",
    "payload_sha256",
    "meta_json",
    "prev_event_hash",
    "event_hash",
    "writer_sig",
    "canonical_payload_path",
    "canonical_payload_inline",
    "blob_ref"
  ];
  for (const field of immutableFields) {
    if ((event[field] ?? null) !== (original[field] ?? null)) {
      errors.push(`Event ${event.id} archived ${field} mismatch`);
    }
  }
  if ((original.archived ?? 0) !== 0 || (original.payload_pruned ?? 0) !== 0) {
    errors.push(`Event ${event.id} archive does not contain the pre-retention row`);
  }
  return original;
}

function verifyEventRetentionState(
  event: EvidenceEvent,
  workspace: string,
  errors: string[],
  retentionProofs?: RetentionProofIndex
): void {
  const original = verifyArchivedEventRetentionProof(event, errors, retentionProofs);
  const prunedState = event.payload_pruned ?? 0;
  if (prunedState === 0) {
    if (event.payload_pruned_ts != null) {
      errors.push(`Event ${event.id} pruning timestamp exists without pruned state`);
    }
    return;
  }
  if (
    prunedState !== 1
    || event.archived !== 1
    || !original
    || !retentionProofs
    || !Number.isInteger(event.payload_pruned_ts)
    || Number(event.payload_pruned_ts) < event.ts
    || event.payload_path !== null
    || event.payload_inline !== null
  ) {
    errors.push(`Event ${event.id} pruned retention state invalid`);
    return;
  }

  const originalInline = original.canonical_payload_inline ?? original.payload_inline ?? null;
  if (originalInline !== null) {
    if (sha256Hex(Buffer.from(originalInline, "utf8")) !== event.payload_sha256) {
      errors.push(`Event ${event.id} archived payload hash mismatch`);
    }
    return;
  }

  const originalPath = original.canonical_payload_path ?? original.payload_path ?? null;
  if (!originalPath) {
    if (event.payload_sha256 !== sha256Hex(Buffer.alloc(0))) {
      errors.push(`Event ${event.id} archived empty payload hash mismatch`);
    }
    return;
  }
  if (pathExists(join(workspace, originalPath))) return;
  if (!event.blob_ref) {
    errors.push(`Event ${event.id} missing retained payload without blob pruning proof`);
    return;
  }
  const prunedBlob = retentionProofs.prunedBlobs.get(event.blob_ref);
  if (!prunedBlob || prunedBlob.ts < Number(event.payload_pruned_ts)) {
    errors.push(`Event ${event.id} signed blob pruning proof missing`);
  }
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
    trustRoot: { anchored: false, monitorFingerprint: null, expectedFingerprint: null }
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

function verifySessions(ledger: Ledger, workspace: string, errors: string[]): void {
  const monitorKeys = getPublicKeyHistory(workspace, "monitor");
  const sessions = ledger.getAllSessions();
  const events = ledger.getAllEvents();
  const lastEventHashBySession = new Map<string, string>();
  for (const event of events) {
    lastEventHashBySession.set(event.session_id, event.event_hash);
  }
  const knownSessionIds = new Set(sessions.map((session) => session.session_id));
  for (const event of events) {
    if (!knownSessionIds.has(event.session_id)) {
      errors.push(`Event ${event.id} references missing session ${event.session_id}`);
    }
  }

  for (const session of sessions) {
    if (session.ended_ts !== null && session.ended_ts < session.started_ts) {
      errors.push(`Session ${session.session_id} has ended_ts earlier than started_ts`);
    }
    const expectedFinalHash = lastEventHashBySession.get(session.session_id) ?? sha256Hex("EMPTY_SESSION");
    if (!session.session_final_event_hash || !session.session_seal_sig) {
      errors.push(`Session ${session.session_id} missing seal`);
      continue;
    }
    if (session.session_final_event_hash !== expectedFinalHash) {
      errors.push(`Session ${session.session_id} final hash mismatch`);
    }

    if (!verifyHexDigestAny(session.session_final_event_hash, session.session_seal_sig, monitorKeys)) {
      errors.push(`Session ${session.session_id} seal signature invalid`);
    }
  }
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

export async function verifyLedgerIntegrity(
  workspacePath: string,
  options: LedgerVerifyOptions = {}
): Promise<VerifyResult> {
  const ledger = openLedger(workspacePath);
  const chainErrors: string[] = [];
  const governanceErrors: string[] = [];

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

  try {
    verifyEvents(ledger, workspacePath, chainErrors, options.externallyAuthenticatedPayloads);
    verifySessions(ledger, workspacePath, chainErrors);
    verifyRuns(ledger, workspacePath, chainErrors);
    verifyOutcomeEvents(ledger, workspacePath, chainErrors);
    verifyTargets(workspacePath, governanceErrors);
    verifyFleetAndAgents(workspacePath, governanceErrors);
    const gatewaySig = verifyGatewayConfigSignature(workspacePath);
    if (gatewaySig.signatureExists && !gatewaySig.valid) {
      governanceErrors.push(`Gateway config signature invalid: ${gatewaySig.reason ?? "unknown reason"}`);
    }
  } finally {
    ledger.close();
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
    }
  };
}
