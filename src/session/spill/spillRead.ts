import type { EvidenceEvent } from "../../types.js";
import { inventorySessionSpillReferences } from "./spillLifecycle.js";
import { retrieveSpilledContent, type SpillRetrievalOptions } from "./spillEvidence.js";
import { parseSpillLocator } from "./spillTypes.js";

/** Byte limit for one operator read, independent of a session's preview policy. */
export const MAX_SPILL_READ_BYTES = 16_384;

export interface SessionSpillRange {
  readonly locator: string;
  readonly contentSha256: string;
  readonly totalBytes: number;
  readonly offset: number;
  readonly returnedBytes: number;
  readonly nextOffset: number | null;
  readonly contentBase64: string;
  readonly eventIds: readonly string[];
  readonly sessionIds: readonly string[];
  readonly storage: "encrypted-v2" | "legacy-plaintext-v1";
  readonly verification: {
    readonly fullContentVerified: true;
    readonly expectedMonitorFingerprint: string | null;
    readonly history: "supplied-references-only";
  };
}

/**
 * Read a bounded range only after authenticating references and the full object.
 * The caller supplies the complete applicable history. This is not a whole-log
 * verifier, a streaming decryptor, or an authorization grant for another user.
 */
export function readSessionSpillRange(input: {
  readonly workspace: string;
  readonly events: readonly EvidenceEvent[];
  readonly locator: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly options?: SpillRetrievalOptions;
}): SessionSpillRange {
  if (parseSpillLocator(input.locator) === null) throw new Error("Invalid spill locator; copy the complete locator from its signed preview or inventory.");
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 4_096;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Spill offset must be a nonnegative safe integer.");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SPILL_READ_BYTES) {
    throw new Error(`Spill limit must be an integer from 1 to ${MAX_SPILL_READ_BYTES} bytes.`);
  }
  if (input.events.length === 0) throw new Error("No signed session history is available; restore the matching evidence before reading retained output.");
  const expectedMonitorFingerprint = input.options?.expectedMonitorFingerprint ?? process.env.AMC_EXPECTED_MONITOR_FINGERPRINT ?? null;
  if (expectedMonitorFingerprint !== null && !/^[a-f0-9]{64}$/.test(expectedMonitorFingerprint)) {
    throw new Error("Expected monitor fingerprint must be a complete lowercase SHA-256 obtained independently; omit it for an explicitly unanchored read.");
  }
  const options = { ...input.options, ...(expectedMonitorFingerprint === null ? {} : { expectedMonitorFingerprint }) };
  const inventory = inventorySessionSpillReferences({ workspace: input.workspace, events: input.events, options });
  if (!inventory.ok) throw new Error(`Spill read refused: ${inventory.errors.join("; ")}`);
  const entry = inventory.entries.find(candidate => candidate.locator === input.locator);
  if (!entry) throw new Error("No authenticated reference names this locator in the supplied history; select the originating workspace.");
  if (offset > entry.ref.bytes) throw new Error(`Spill offset exceeds the committed output size (${entry.ref.bytes} bytes).`);
  const event = input.events.find(candidate => candidate.id === entry.eventIds[0]);
  if (!event) throw new Error("The authenticated spill origin is absent from the supplied history.");
  // Retrieval rechecks the actual object against its signed plaintext/ciphertext
  // commitments. A valid header or a requested range alone cannot prove it.
  const full = retrieveSpilledContent(input.workspace, event, options);
  try {
    const end = Math.min(full.length, offset + limit);
    return {
      locator: input.locator, contentSha256: entry.ref.contentSha256,
      totalBytes: full.length, offset, returnedBytes: end - offset,
      nextOffset: end < full.length ? end : null,
      contentBase64: full.subarray(offset, end).toString("base64"),
      eventIds: entry.eventIds, sessionIds: entry.sessionIds,
      storage: entry.ref.v === 2 ? "encrypted-v2" : "legacy-plaintext-v1",
      verification: { fullContentVerified: true, expectedMonitorFingerprint, history: "supplied-references-only" }
    };
  } finally { full.fill(0); }
}
