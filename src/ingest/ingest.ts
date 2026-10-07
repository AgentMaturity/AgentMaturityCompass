import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { bundleDigest, eventMeta, verifyThirdPartyAttestation, workspaceOwnKeyIds, type BundleEntry } from "../claims/evidenceProvenance.js";
import { openLedger, hashBinaryOrPath } from "../ledger/ledger.js";
import { readEventPayload } from "../session/eventPayload.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { EvidenceEvent } from "../types.js";
import { resolveAgentId } from "../fleet/paths.js";
import { assertNotExample } from "../claims/eligibility/exampleMode.js";

export type IngestType = "chatgpt" | "claude_console" | "gemini_ui" | "generic_json" | "generic_text";

function collectFiles(inputPath: string): string[] {
  const absolute = resolve(inputPath);
  const stat = statSync(absolute);
  if (stat.isFile()) {
    return [absolute];
  }
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  walk(absolute);
  return out.sort((a, b) => a.localeCompare(b));
}

function toIngestPayload(file: string, type: IngestType): string {
  const raw = readFileSync(file, "utf8");
  if (type === "generic_text") {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export function ingestEvidence(params: {
  workspace: string;
  agentId?: string;
  inputPath: string;
  type: IngestType;
}): {
  ingestSessionId: string;
  fileCount: number;
  eventIds: string[];
} {
  const workspace = params.workspace;
  const agentId = resolveAgentId(workspace, params.agentId);
  const files = collectFiles(params.inputPath);
  if (files.length === 0) {
    throw new Error(`No files found to ingest: ${params.inputPath}`);
  }

  const ledger = openLedger(workspace);
  const ingestSessionId = randomUUID();
  try {
    ledger.startSession({
      sessionId: ingestSessionId,
      runtime: "unknown",
      binaryPath: "ingest",
      binarySha256: hashBinaryOrPath("ingest", "1")
    });

    const batchResults = ledger.appendEvidenceBatch(
      files.map((file) => ({
        sessionId: ingestSessionId,
        runtime: "unknown" as const,
        eventType: "review" as const,
        payload: toIngestPayload(file, params.type),
        payloadExt: file.endsWith(".json") ? ("json" as const) : ("txt" as const),
        meta: {
          trustTier: "SELF_REPORTED",
          source: params.type,
          agentId,
          ingestSessionId,
          filePath: file
        }
      }))
    );
    const eventIds = batchResults.map((row) => row.id);
    ledger.sealSession(ingestSessionId);
    return {
      ingestSessionId,
      fileCount: files.length,
      eventIds
    };
  } finally {
    ledger.close();
  }
}

/** The original's plaintext payload (blobs are stored encrypted), so the copy keeps the payload hash the bundle lists. */
function payloadForEvent(workspace: string, event: EvidenceEvent): Buffer {
  const read = readEventPayload(workspace, event);
  if (read.status !== "ok") throw new Error(`cannot attest event ${event.id}: its payload is ${read.status === "pruned" ? "pruned" : read.detail}`);
  return read.bytes;
}

type IngestMeta = { source?: unknown; trustTier?: unknown; originalEventId?: unknown; attestation?: { keyId?: unknown } };

/** The ingest session's review events: the originals, oldest first, and earlier attestation copies. */
function ingestSessionEvents(ledger: ReturnType<typeof openLedger>, ingestSessionId: string): { sources: EvidenceEvent[]; copies: IngestMeta[] } {
  const review = ledger.getAllEvents().filter((event) => event.session_id === ingestSessionId && event.event_type === "review")
    .map((event) => ({ event, meta: JSON.parse(event.meta_json) as IngestMeta }));
  const sources = review.filter(({ meta }) => meta.source !== "attested_ingest").map(({ event }) => event).sort((a, b) => a.ts - b.ts);
  if (sources.length === 0) {
    throw new Error(`No ingest review events found for session ${ingestSessionId}`);
  }
  return { sources, copies: review.filter(({ meta }) => meta.source === "attested_ingest").map(({ meta }) => meta) };
}

/** The signed bundle names its subject: the agent the copies are written for and the ingest session they are written to. */
function bundleOf(sourceEvents: EvidenceEvent[], agentId: string, sessionId: string): BundleEntry[] {
  return sourceEvents.map((event) => ({ id: event.id, sha256: event.payload_sha256, ts: event.ts, agentId, sessionId }));
}

/** The digest a third-party attester signs for `amc attest --attester-signature` (printed by `amc attest` as the bundle hash). */
export function ingestBundleHash(workspace: string, ingestSessionId: string, agentId?: string): string {
  const ledger = openLedger(workspace);
  try {
    return bundleDigest(bundleOf(ingestSessionEvents(ledger, ingestSessionId).sources, resolveAgentId(workspace, agentId), ingestSessionId));
  } finally {
    ledger.close();
  }
}

/**
 * Records a human or system attestation over an ingest session (P0-18).
 *
 * The attester and their statement are required and recorded. That alone is a self-attestation: the rows stay
 * SELF_REPORTED with `attestation.kind: "self_attested"`, because the operator vouching for their own import is not
 * independent evidence. Only a signature over the bundle hash by a third-party key pinned for independent-attestation
 * in a signed trust list makes the rows ATTESTED; the workspace's own monitor and auditor keys never do.
 */
export function attestIngestSession(params: {
  workspace: string;
  ingestSessionId: string;
  agentId?: string;
  /** Identity of the party vouching for this content (person or system id). */
  attestedBy: string;
  /** What they are attesting to (e.g. provenance of the exported logs). */
  statement: string;
  /** A third party's Ed25519 signature over the bundle hash. */
  attesterSignature?: { keyId: string; sigB64: string };
  /** Trust lists that may pin the attester; without one no signature is admitted. */
  trust?: TrustContext | null;
}): {
  attestedEventCount: number;
  bundleHash: string;
  trustTier: "ATTESTED" | "SELF_REPORTED";
  reason: string;
} {
  const workspace = params.workspace;
  const attestedBy = params.attestedBy?.trim() ?? "";
  const statement = params.statement?.trim() ?? "";
  if (attestedBy.length === 0 || statement.length === 0) {
    throw new Error(
      "Attestation requires attestedBy and statement: an attestation names who vouches for the content and what they vouch for."
    );
  }
  const agentId = resolveAgentId(workspace, params.agentId);
  const ledger = openLedger(workspace);
  try {
    const { sources: sourceEvents, copies } = ingestSessionEvents(ledger, params.ingestSessionId);
    const bundle = bundleOf(sourceEvents, agentId, params.ingestSessionId);
    const bundleHash = bundleDigest(bundle);
    const thirdParty = params.attesterSignature
      ? { kind: "third_party", keyId: params.attesterSignature.keyId, sigB64: params.attesterSignature.sigB64, digestSha256: bundleHash }
      : null;
    const verdict = thirdParty
      ? verifyThirdPartyAttestation(thirdParty, params.trust ?? null, workspaceOwnKeyIds(workspace))
      : { verified: false, reason: "self-attested: no third-party signature was given" };
    // A key attests an event once: a replay, or a re-signed wider bundle, would only multiply the same ATTESTED rows.
    const sourceIds = new Set(sourceEvents.map((event) => event.id));
    const covered = verdict.verified && thirdParty ? copies.find((meta) => meta.trustTier === "ATTESTED"
      && meta.attestation?.keyId === thirdParty.keyId && sourceIds.has(meta.originalEventId as string)) : undefined;
    if (covered && thirdParty) {
      throw new Error(`ingest session ${params.ingestSessionId} is already attested by key ${thirdParty.keyId} (event ${String(covered.originalEventId)}); attest new evidence in a new ingest session`);
    }
    // P0-15: a synthetic_example row is never attested, by the operator or a third party.
    for (const event of sourceEvents) assertNotExample(eventMeta(event), "attested");
    const trustTier = verdict.verified ? "ATTESTED" : "SELF_REPORTED";
    const attestation = verdict.verified && thirdParty
      ? { ...thirdParty, attestedBy, statement, bundle }
      : { kind: "self_attested", attestedBy, statement };
    const attestationSig = ledger.signRunHash(bundleHash);

    for (const event of sourceEvents) {
      const payload = payloadForEvent(workspace, event);
      ledger.appendEvidence({
        sessionId: params.ingestSessionId,
        runtime: "unknown",
        eventType: "review",
        payload,
        payloadExt: event.payload_path?.endsWith(".json") ? "json" : "txt",
        meta: {
          trustTier,
          source: "attested_ingest",
          agentId,
          ingestSessionId: params.ingestSessionId,
          originalEventId: event.id,
          attestation
        }
      });
    }

    ledger.appendEvidence({
      sessionId: params.ingestSessionId,
      runtime: "unknown",
      eventType: "audit",
      payload: JSON.stringify({
        auditType: "INGEST_ATTESTED",
        severity: "LOW",
        ingestSessionId: params.ingestSessionId,
        bundleHash,
        signature: attestationSig
      }),
      payloadExt: "json",
      inline: true,
      meta: {
        source: "attested_ingest",
        auditType: "INGEST_ATTESTED",
        severity: "LOW",
        ingestSessionId: params.ingestSessionId,
        bundleHash,
        // The monitor key seals the record; it says who wrote it, not that the content is true.
        signature: attestationSig,
        attestation,
        attestationReason: verdict.reason,
        trustTier,
        agentId
      }
    });

    return {
      attestedEventCount: sourceEvents.length,
      bundleHash,
      trustTier,
      reason: verdict.reason
    };
  } finally {
    ledger.close();
  }
}
