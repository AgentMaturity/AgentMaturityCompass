/**
 * Spill — the vocabulary and the wire shape (plan P2.3).
 *
 * Spill is the post-execute policy that keeps an oversized tool result out of
 * the model's context without letting it out of the EVIDENCE. New full outputs
 * are encrypted in a session-scoped 0600 file; the model sees a head/tail preview carrying an
 * opaque locator; and the SHA-256 of the FULL bytes rides in the `tool/result`
 * event's meta. A v2 `tool/spill-commitment` is signed before file publication
 * and additionally commits to the encrypted envelope's digest and size.
 *
 * That last clause is the entire security argument, so it is worth stating
 * mechanically rather than by adjective. `meta` is serialised into `meta_json`,
 * `meta_json` is part of `canonicalMetadataForHash`, that canonicalisation is
 * hashed into `event_hash`, and `event_hash` is what the workspace monitor key
 * signs into `writer_sig`. Therefore a `SpillRef` cannot be altered — its
 * locator repointed, its hash relaxed — without breaking the same `event_hash`
 * check and the same signature check that protect every other field of the row.
 * Spilling moves the BYTES out of the ledger; it does not move the COMMITMENT
 * out, and so it opens no unsigned side-channel.
 *
 * What follows from that: the file on disk is never the authority. It is a
 * cache of bytes the log already committed to, so a spill file that no longer
 * hashes to `contentSha256` is a finding, and one that is gone is a gap — never
 * a silently different answer.
 */

/**
 * The knobs of the spill decision.
 *
 * These live here, and are echoed into every ref the policy mints, because the
 * threshold is part of WHY a result looks the way it does. A reader holding a
 * preview and no threshold cannot tell a deliberate spill from a truncation
 * bug; a reader holding the threshold the decision was actually taken under can.
 *
 * The right long-term home for the values is the signed `amc.config.yaml`, so a
 * deployment cannot quietly widen what the model is allowed to see inline. That
 * binding belongs with the tool pipeline (P4.1) that will own the post-execute
 * waterfall; until then a composition passes them explicitly and the ref
 * records what was used.
 */
export interface SpillPolicyConfig {
  /** Results of this many bytes or fewer are recorded verbatim; larger ones spill. */
  readonly maxInlineBytes: number;
  readonly previewHeadBytes: number;
  readonly previewTailBytes: number;
  /** Model-facing sentence saying how the full bytes are obtained. */
  readonly retrievalHint: string;
}

/**
 * Conservative defaults.
 *
 * 32 KiB is roughly 8k tokens of English — large enough that ordinary tool
 * output is untouched, small enough that one `grep` over a monorepo cannot eat
 * a context window. The preview budget is deliberately far below the threshold
 * so a spilled result is visibly smaller than an inline one.
 */
export const DEFAULT_SPILL_POLICY: SpillPolicyConfig = {
  maxInlineBytes: 32_768,
  previewHeadBytes: 4_096,
  previewTailBytes: 2_048,
  retrievalHint:
    "read authenticated ranges with amc session spill-read <locator> --offset 0 --limit 4096; use --json for exact bytes"
};

function requirePositiveInt(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`spill policy ${name} must be a positive integer, received ${String(value)}`);
  }
  return value;
}

/**
 * Fill in the defaults and reject a configuration that cannot mean what it says.
 *
 * A preview budget at or above the threshold would make a "spilled" result no
 * smaller than the inline one it replaced — the policy would cost a file write
 * and buy nothing, while still reporting a truncation to the model. Failing
 * loudly here is cheaper than discovering that from a context-pressure graph.
 */
export function resolveSpillPolicyConfig(overrides: Partial<SpillPolicyConfig> = {}): SpillPolicyConfig {
  const merged: SpillPolicyConfig = { ...DEFAULT_SPILL_POLICY, ...overrides };
  requirePositiveInt("maxInlineBytes", merged.maxInlineBytes);
  requirePositiveInt("previewHeadBytes", merged.previewHeadBytes);
  requirePositiveInt("previewTailBytes", merged.previewTailBytes);
  if (merged.previewHeadBytes + merged.previewTailBytes >= merged.maxInlineBytes) {
    throw new Error(
      `spill policy preview budget (${merged.previewHeadBytes}+${merged.previewTailBytes}) must be smaller ` +
        `than maxInlineBytes (${merged.maxInlineBytes}), otherwise spilling shrinks nothing`
    );
  }
  if (merged.retrievalHint.trim().length === 0) {
    throw new Error("spill policy retrievalHint must be a non-empty sentence");
  }
  return merged;
}

/**
 * The signed record of a spill, embedded in the `tool/result` event's meta.
 *
 * `contentSha256` is over the FULL bytes, not the preview — the preview's hash
 * is already the row's `payload_sha256`, so duplicating it here would add a
 * second copy of a truth the row states better. Everything in this object is
 * either the commitment itself or something a reader needs in order to act on
 * it without re-reading the (possibly deleted) file.
 */
export interface SpillRefCommon {
  /** Opaque object identifier. Null when the store refused the write — see `unretrievable`. */
  readonly locator: string | null;
  /** SHA-256 of the FULL result bytes. The commitment; the file is checked against this. */
  readonly contentSha256: string;
  /** Length of the full result in bytes. */
  readonly bytes: number;
  /** Length of the preview that replaced it — what the model actually read. */
  readonly previewBytes: number;
  /** The threshold this decision was taken under. */
  readonly maxInlineBytes: number;
  readonly retrievalHint: string;
  /**
   * Why the full bytes are not on disk, or null when they are.
   *
   * A spill store failure must not turn a successful tool call into an error,
   * and must not silently claim retrievability either. When the write fails the
   * policy still commits `contentSha256` — so the log still says exactly what
   * the output was — and records the reason here, so an operator reads "the
   * bytes are gone and here is why" rather than chasing a locator that never
   * pointed at anything.
   */
  readonly unretrievable: string | null;
}

/** Legacy plaintext objects remain readable but are never newly written. */
export interface SpillRefV1 extends SpillRefCommon {
  readonly v: 1;
}

/** Authenticated metadata for the encrypted bytes prepared before commitment. */
export interface SpillRefV2 extends SpillRefCommon {
  readonly v: 2;
  readonly format: "amc-blob-v1";
  readonly keyVersion: number | null;
  readonly encodedBytes: number | null;
  readonly encodedSha256: string | null;
}

export type SpillRef = SpillRefV1 | SpillRefV2;

/** Meta key under which a `SpillRef` (or null) rides on a `tool/result` event. */
export const SPILL_META_KEY = "spilled";

export const SPILL_LOCATOR_PREFIX = "amc-spill:v1:";
export const SPILL_LOCATOR_V2_PREFIX = "amc-spill:v2:";

/**
 * A locator's two halves once parsed: which session's directory, which object.
 *
 * Neither half is a path fragment supplied by a caller — the session half is a
 * SHA-256 and the object half is a random hex id plus a sanitised name — so a
 * hostile locator has nothing to traverse WITH. See `parseSpillLocator`.
 */
export interface SpillLocatorParts {
  readonly version: 1 | 2;
  readonly sessionHash: string;
  readonly objectName: string;
}

const SESSION_HASH_RE = /^[0-9a-f]{64}$/;
const OBJECT_NAME_RE = /^[0-9a-f]{32}-[A-Za-z0-9._-]{1,64}$/;

export function formatSpillLocator(parts: Omit<SpillLocatorParts, "version"> & { readonly version?: 1 | 2 }): string {
  const locator = `amc-spill:v${parts.version ?? 1}:${parts.sessionHash}:${parts.objectName}`;
  if (parseSpillLocator(locator) === null) throw new Error("invalid spill locator components");
  return locator;
}

/**
 * Parse a locator, returning null for anything that is not exactly one.
 *
 * This is the only place a locator becomes a path, and it is written as an
 * allow-list of two fixed shapes rather than a deny-list of dangerous ones.
 * `..`, absolute paths, separators, NUL bytes and unicode look-alikes all fail
 * the same way: they are not 64 lowercase hex characters, and they are not 32
 * lowercase hex characters followed by `-` and a bounded `[A-Za-z0-9._-]` name.
 * Filesystem readers must additionally refuse linked or replaced directory
 * components and objects; the locator grammar alone does not enforce that.
 */
export function parseSpillLocator(locator: string): SpillLocatorParts | null {
  const version = locator.startsWith(SPILL_LOCATOR_PREFIX) ? 1 : locator.startsWith(SPILL_LOCATOR_V2_PREFIX) ? 2 : null;
  if (version === null) return null;
  const rest = locator.slice(SPILL_LOCATOR_PREFIX.length);
  const separator = rest.indexOf(":");
  if (separator < 0) {
    return null;
  }
  const sessionHash = rest.slice(0, separator);
  const objectName = rest.slice(separator + 1);
  if (sessionHash.length !== 64 || !SESSION_HASH_RE.test(sessionHash) ||
      !OBJECT_NAME_RE.test(objectName) || /[^A-Za-z0-9._-]/.test(objectName)) {
    return null;
  }
  return { version, sessionHash, objectName };
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

/**
 * Shape guard for a ref pulled back out of stored meta.
 *
 * A stored row is untrusted input until its shape is checked — the same posture
 * `isSessionEnvelope` takes — so nothing downstream casts.
 */
export function isSpillRef(value: unknown): value is SpillRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const common = (
    (candidate.v === 1 || candidate.v === 2) &&
    isNullableString(candidate.locator) &&
    typeof candidate.contentSha256 === "string" &&
    candidate.contentSha256.length === 64 && /^[0-9a-f]{64}$/.test(candidate.contentSha256) &&
    typeof candidate.bytes === "number" &&
    Number.isSafeInteger(candidate.bytes) &&
    candidate.bytes >= 0 &&
    typeof candidate.previewBytes === "number" && Number.isSafeInteger(candidate.previewBytes) && candidate.previewBytes >= 0 &&
    typeof candidate.maxInlineBytes === "number" && Number.isSafeInteger(candidate.maxInlineBytes) && candidate.maxInlineBytes > 0 &&
    typeof candidate.retrievalHint === "string" &&
    isNullableString(candidate.unretrievable)
  );
  if (!common) return false;
  if (candidate.v === 1) return true;
  if (candidate.format !== "amc-blob-v1") return false;
  const prepared = typeof candidate.keyVersion === "number" && Number.isSafeInteger(candidate.keyVersion) &&
    candidate.keyVersion > 0 && candidate.keyVersion <= 0xffffffff &&
    typeof candidate.encodedBytes === "number" && Number.isSafeInteger(candidate.encodedBytes) && candidate.encodedBytes > 0 &&
    typeof candidate.encodedSha256 === "string" && candidate.encodedSha256.length === 64 && /^[0-9a-f]{64}$/.test(candidate.encodedSha256);
  const unavailable = candidate.locator === null && candidate.keyVersion === null &&
    candidate.encodedBytes === null && candidate.encodedSha256 === null;
  return prepared || unavailable;
}

/**
 * Pull the spill ref out of a stored event's `meta_json`.
 *
 * Returns null both for "this row never spilled" and "this row's meta is not
 * parseable as a spill ref". The caller that needs to tell those apart is the
 * verifier, and it can: a row with no spill is a row whose meta has no
 * `spilled` key at all.
 */
export function extractSpillRef(metaJson: string): SpillRef | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const candidate = (parsed as Record<string, unknown>)[SPILL_META_KEY];
  return isSpillRef(candidate) ? candidate : null;
}
