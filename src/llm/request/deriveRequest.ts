/**
 * `derive(header, log) → bytes` — the reconstruction VERIFY-3 asks for.
 *
 * THE GAP THIS CLOSES. `request/header` is appended with NO payload and surface
 * `{op:"none"}`: the log holds `requestDigest`, never the bytes. A digest proves
 * the bytes were not altered after the fact and proves nothing about what they
 * were. Until this module there was no function anywhere in the tree that could
 * turn a session log back into the bytes that digest names, which meant the
 * signed commitment could be CHECKED only by someone who still had the bytes —
 * i.e. by nobody, a week later.
 *
 * WHAT MAKES THE RESULT REAL. Derivation is handed a workspace, a session id and
 * one event id. It receives no request, no messages, no encoder instance. It
 * rebuilds the bytes from signed rows and then hashes them and compares against
 * the digest that was signed at send time. A `reconstructed` verdict therefore
 * says: these exact bytes are what the signed row committed to. Nothing weaker
 * would be worth reporting.
 *
 * WHY THE VERDICTS ARE SEPARATE. Three outcomes look alike from a distance and
 * must never be merged:
 *   - `payload-pruned` — retention lawfully deleted something the request was
 *     built from. Reconstruction is impossible AND nothing is wrong. Reporting
 *     this as a mismatch would make every compliant deletion look like tampering.
 *   - `payload-missing` — bytes are gone with no prune record. That IS a finding.
 *   - `digest-mismatch` — the bytes came back and do not hash to the signed
 *     digest. Either the log was altered or the encoder's output changed without
 *     its version changing. Both are serious; neither is a deletion.
 *
 * WHAT DERIVATION DOES NOT DO. It does not recompute `event_hash` from
 * `meta_json`, and must not: `meta_json`'s internal key order is load-bearing
 * for that hash (`sanitizeMetaForHash` re-stringifies in insertion order while
 * `canonicalize` never descends into it), so a reconstructor that rebuilt the
 * meta object would produce a different hash for an identical request. Row-level
 * integrity is `verifyLedgerIntegrity`'s job, over the stored string, and the
 * two checks are complementary: the verifier proves the row was not edited, this
 * proves the row describes the bytes that were sent.
 *
 * WHY NOT THE GATEWAY'S `llm_request` EVIDENCE. Because the gateway redacts
 * before it records and does not retain `originalPayloadSha256`, so byte
 * fidelity is not available there at all. Derivation reads the session spine.
 */
import type { EvidenceEvent } from "../../types.js";
import { openSessionEventStore } from "../../persistence/openSessionEventStore.js";
import { parseRequestHeaderMeta } from "../../session/requestHeaderMeta.js";
import type { RequestHeaderMeta } from "../../session/requestHeaderMeta.js";
import { sha256Hex } from "../../utils/hash.js";
import { BUILT_IN_REQUEST_ENCODERS } from "./builtInEncoders.js";
import { RequestEncoderRegistry } from "./requestEncoder.js";
import { RequestEncodingError } from "./requestSpec.js";
import { resolveRequestSources } from "./requestSources.js";

/** The registry derivation uses when a caller does not pin one. */
export const DEFAULT_REQUEST_ENCODERS = new RequestEncoderRegistry(BUILT_IN_REQUEST_ENCODERS);

export type RequestDerivationStatus =
  /** Bytes rebuilt, they hash to the signed digest, and every commitment holds. */
  | "reconstructed"
  /** Bytes rebuilt and they hash correctly, but a commitment in the row is wrong. */
  | "evidence-inconsistent"
  /** Bytes rebuilt and they do NOT hash to the signed digest. */
  | "digest-mismatch"
  /** A referenced payload was lawfully deleted. Not an alarm. */
  | "payload-pruned"
  /** A referenced payload is gone with no prune record, or unreadable. */
  | "payload-missing"
  /** The log does not describe a request this code can rebuild. */
  | "unreconstructable";

export interface RequestDerivation {
  readonly status: RequestDerivationStatus;
  readonly headerEventId: string;
  /** The rebuilt bytes, or null when they could not be produced. */
  readonly bytes: Buffer | null;
  /** sha256 of `bytes`, or null. */
  readonly derivedDigest: string | null;
  /** The digest the signed row commits to, or null when the row was unreadable. */
  readonly recordedDigest: string | null;
  /**
   * Commitments in the row that do not match what the log yields. Populated even
   * on a `digest-mismatch`, because "which commitment broke" is what tells an
   * operator whether to look at the log or at the encoder.
   */
  readonly inconsistencies: readonly string[];
  /** Why the status is what it is, in one sentence. Null when reconstructed. */
  readonly detail: string | null;
}

export interface DeriveRequestInput {
  readonly workspace: string;
  /** This session's committed rows, in commit order. */
  readonly events: readonly EvidenceEvent[];
  readonly headerEventId: string;
  readonly encoders?: RequestEncoderRegistry;
}

function unreconstructable(
  headerEventId: string,
  detail: string,
  recordedDigest: string | null = null
): RequestDerivation {
  return {
    status: "unreconstructable",
    headerEventId,
    bytes: null,
    derivedDigest: null,
    recordedDigest,
    inconsistencies: [],
    detail
  };
}

/** Rebuild the bytes one `request/header` row committed to, and check them. */
export function deriveRecordedRequest(input: DeriveRequestInput): RequestDerivation {
  const header = input.events.find((event) => event.id === input.headerEventId);
  if (header === undefined) {
    return unreconstructable(input.headerEventId, "no such event in this session");
  }
  if (header.event_type !== "request/header") {
    return unreconstructable(input.headerEventId, `event is a ${header.event_type}, not a request/header`);
  }
  const meta = parseRequestHeaderMeta(header.meta_json);
  if (meta === null) {
    return unreconstructable(input.headerEventId, "request/header meta is not a well-formed header");
  }

  const resolution = resolveRequestSources({
    workspace: input.workspace,
    events: input.events,
    model: meta.model,
    params: meta.params,
    systemPromptEventId: meta.systemPromptEventId,
    toolSchemaEventId: meta.toolSchemaEventId,
    toolSchemaSha256: meta.toolSchemaSha256,
    projectionCutoffEventId: meta.projectionCutoffEventId
  });
  if (resolution.failure !== null || resolution.request === null) {
    const failure = resolution.failure ?? { kind: "unreconstructable" as const, detail: "assembly produced no request" };
    return {
      status: failure.kind,
      headerEventId: input.headerEventId,
      bytes: null,
      derivedDigest: null,
      recordedDigest: meta.requestDigest,
      inconsistencies: resolution.notes,
      detail: failure.detail
    };
  }

  const encoder = (input.encoders ?? DEFAULT_REQUEST_ENCODERS).get(meta.encoderId, meta.encoderVersion);
  if (encoder === null) {
    return unreconstructable(
      input.headerEventId,
      `no encoder ${meta.encoderId}@${meta.encoderVersion} is available (have: ${(input.encoders ?? DEFAULT_REQUEST_ENCODERS).list().join(", ") || "none"})`,
      meta.requestDigest
    );
  }

  let bytes: Buffer;
  try {
    bytes = encoder.encode(resolution.request);
  } catch (error: unknown) {
    const reason = error instanceof RequestEncodingError || error instanceof Error ? error.message : String(error);
    return unreconstructable(input.headerEventId, `encoder ${encoder.id}@${encoder.version} refused: ${reason}`, meta.requestDigest);
  }

  const derivedDigest = sha256Hex(bytes);
  const inconsistencies = [...resolution.notes, ...commitmentMismatches(meta, resolution.sourceEventIds, resolution.projectionDigest)];

  if (derivedDigest !== meta.requestDigest) {
    return {
      status: "digest-mismatch",
      headerEventId: input.headerEventId,
      bytes,
      derivedDigest,
      recordedDigest: meta.requestDigest,
      inconsistencies,
      detail: "the bytes rebuilt from the log do not hash to the digest the signed row commits to"
    };
  }
  return {
    status: inconsistencies.length === 0 ? "reconstructed" : "evidence-inconsistent",
    headerEventId: input.headerEventId,
    bytes,
    derivedDigest,
    recordedDigest: meta.requestDigest,
    inconsistencies,
    detail:
      inconsistencies.length === 0
        ? null
        : "the bytes reconstruct, but the row's auxiliary commitments do not match the log"
  };
}

/**
 * The row's other commitments, checked against what the log yields.
 *
 * These can hold or break independently of the byte digest, and that is exactly
 * why they are worth recording: `sourceEventIds` and `projectionDigest` describe
 * WHICH rows composed the request. A header whose bytes reconstruct but whose
 * source list is wrong is metadata that would mislead the next reader, and
 * saying so is cheaper than letting them find out.
 */
function commitmentMismatches(
  meta: RequestHeaderMeta,
  sourceEventIds: readonly string[],
  projectionDigest: string
): readonly string[] {
  const problems: string[] = [];
  if (meta.projectionDigest !== projectionDigest) {
    problems.push(`projectionDigest commits to ${meta.projectionDigest} but the log at the cutoff yields ${projectionDigest}`);
  }
  const recorded = meta.sourceEventIds.join(",");
  const derived = sourceEventIds.join(",");
  if (recorded !== derived) {
    problems.push(`sourceEventIds commits to [${recorded}] but the request was assembled from [${derived}]`);
  }
  return problems;
}

/**
 * Every `request/header` in one session, derived, reading the log through a
 * READ-ONLY store.
 *
 * Read-only matters twice: it takes no writer lock, so a live session can be
 * checked while it runs, and it does not pin a backend, so verifying a workspace
 * never changes it. A verifier that mutated what it inspects would be a poor
 * verifier.
 */
export function deriveSessionRequests(params: {
  readonly workspace: string;
  readonly sessionId: string;
  readonly encoders?: RequestEncoderRegistry;
}): readonly RequestDerivation[] {
  const store = openSessionEventStore(params.workspace, undefined, { readOnly: true });
  try {
    const events = store.readSessionEvents(params.sessionId);
    return events
      .filter((event) => event.event_type === "request/header")
      .map((event) =>
        deriveRecordedRequest({
          workspace: params.workspace,
          events,
          headerEventId: event.id,
          ...(params.encoders !== undefined ? { encoders: params.encoders } : {})
        })
      );
  } finally {
    store.close();
  }
}
