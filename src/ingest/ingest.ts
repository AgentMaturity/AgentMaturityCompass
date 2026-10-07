import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { verifyThirdPartyAttestation } from "../claims/evidenceProvenance.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { openLedger, hashBinaryOrPath } from "../ledger/ledger.js";
import type { TrustContext } from "../trust/trustContext.js";
import { ed25519KeyId } from "../trust/trustList.js";
import type { EvidenceEvent } from "../types.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { resolveAgentId } from "../fleet/paths.js";

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

function payloadForEvent(workspace: string, event: { payload_inline: string | null; payload_path: string | null }): string {
  if (event.payload_inline !== null) {
    return event.payload_inline;
  }
  if (event.payload_path !== null) {
    return readFileSync(resolve(workspace, event.payload_path), "utf8");
  }
  return "";
}

/** The ingest session's original review events (not earlier attestation copies), oldest first. */
function ingestSourceEvents(ledger: ReturnType<typeof openLedger>, ingestSessionId: string): EvidenceEvent[] {
  const sourceEvents = ledger
    .getAllEvents()
    .filter((event) => event.session_id === ingestSessionId && event.event_type === "review"
      && (JSON.parse(event.meta_json) as { source?: unknown }).source !== "attested_ingest")
    .sort((a, b) => a.ts - b.ts);
  if (sourceEvents.length === 0) {
    throw new Error(`No ingest review events found for session ${ingestSessionId}`);
  }
  return sourceEvents;
}

function bundleHashOf(sourceEvents: EvidenceEvent[]): string {
  return sha256Hex(canonicalize(sourceEvents.map((event) => ({ id: event.id, sha256: event.payload_sha256, ts: event.ts }))));
}

/** The digest a third-party attester signs for `amc attest --attester-signature` (printed by `amc attest` as the bundle hash). */
export function ingestBundleHash(workspace: string, ingestSessionId: string): string {
  const ledger = openLedger(workspace);
  try {
    return bundleHashOf(ingestSourceEvents(ledger, ingestSessionId));
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
    const sourceEvents = ingestSourceEvents(ledger, params.ingestSessionId);
    const bundleHash = bundleHashOf(sourceEvents);
    const ownKeyIds = (["monitor", "auditor"] as const).flatMap((role) => getPublicKeyHistory(workspace, role))
      .map((pem) => ed25519KeyId(pem)).filter((keyId): keyId is string => keyId !== null);
    const thirdParty = params.attesterSignature
      ? { kind: "third_party", keyId: params.attesterSignature.keyId, sigB64: params.attesterSignature.sigB64, digestSha256: bundleHash }
      : null;
    const verdict = thirdParty
      ? verifyThirdPartyAttestation(thirdParty, params.trust ?? null, ownKeyIds)
      : { verified: false, reason: "self-attested: no third-party signature was given" };
    const trustTier = verdict.verified ? "ATTESTED" : "SELF_REPORTED";
    const attestation = verdict.verified && thirdParty
      ? { ...thirdParty, attestedBy, statement }
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
