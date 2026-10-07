import { verifyHexDigest } from "../crypto/keys.js";
import { admitKey } from "../trust/admission.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import type { EvidenceEvent, TrustTier } from "../types.js";

/**
 * Who produced a ledger event. Only "amc-runtime" evidence (AMC observed it itself) may support a
 * positive regulated result; imported, manual, external and synthetic rows are recorded but never
 * admitted as proof. P0-18 owns this table and derives trust tiers from it.
 */
export type EvidenceProducer = "amc-runtime" | "import" | "manual" | "external-report" | "synthetic";

/** Every `meta.source` that is not AMC runtime evidence. Anything absent is amc-runtime. */
export const PRODUCER_BY_SOURCE: Readonly<Record<string, Exclude<EvidenceProducer, "amc-runtime">>> = Object.freeze({
  "dogfood-maturity": "synthetic",
  eval_import: "import",
  import: "import",
  watch: "import",
  attested_ingest: "import",
  chatgpt: "import",
  claude_console: "import",
  gemini_ui: "import",
  generic_json: "import",
  generic_text: "import",
  manual: "manual",
  operator: "manual",
  "feedback.ingest": "manual",
  webhook: "external-report"
});

const metaCache = new WeakMap<object, Record<string, unknown>>();

/** The event's parsed meta, or {} when it is missing or malformed. Cached per event object. */
export function eventMeta(event: Pick<EvidenceEvent, "meta_json">): Record<string, unknown> {
  const cached = metaCache.get(event);
  if (cached) return cached;
  let meta: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(event.meta_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
  } catch {
    // malformed meta claims nothing
  }
  metaCache.set(event, meta);
  return meta;
}

export function evidenceProducer(event: Pick<EvidenceEvent, "meta_json">): EvidenceProducer {
  return producerOfMeta(eventMeta(event));
}

/** evidenceProducer for meta already parsed (the ledger write guard, parsed diagnostic events). */
export function producerOfMeta(meta: Record<string, unknown>): EvidenceProducer {
  if (meta.provenance === "dogfood" || meta.claimKind === "synthetic_example") return "synthetic";
  const source = meta.source;
  const producer = typeof source === "string" && Object.hasOwn(PRODUCER_BY_SOURCE, source) ? PRODUCER_BY_SOURCE[source] : undefined;
  return producer ?? "amc-runtime";
}

/** A third party's Ed25519 signature over a sha256 digest (an ingest bundle hash), as stored in `meta.attestation`. */
export interface ThirdPartyAttestation {
  keyId: string;
  sigB64: string;
  digestSha256: string;
  attestedBy?: string;
}

const TIERS: readonly string[] = ["OBSERVED", "OBSERVED_HARDENED", "ATTESTED", "SELF_REPORTED"];

/**
 * Whether `attestation` is a signature by a key the operator pinned for independent-attestation in a signed trust
 * list: not distrusted or revoked, inside its validity window now, and verifying over the digest. The workspace's own
 * monitor and auditor keys (`ownKeyIds`) never qualify, whatever a trust list says.
 */
export function verifyThirdPartyAttestation(
  attestation: unknown, trustList: TrustContext | null, ownKeyIds: readonly string[] = []
): { verified: boolean; reason: string } {
  const refuse = (reason: string) => ({ verified: false, reason });
  const record = attestation as Partial<Record<keyof ThirdPartyAttestation, unknown>> | null;
  if (!record || typeof record !== "object" || typeof record.keyId !== "string" || typeof record.sigB64 !== "string"
    || typeof record.digestSha256 !== "string") {
    return refuse("malformed attestation: keyId, sigB64 and digestSha256 are required");
  }
  if (ownKeyIds.includes(record.keyId)) return refuse(`key ${record.keyId} is one of the operator's own keys, not a third party`);
  if (!trustList) return refuse("no trust list is loaded, so no attester key is pinned");
  const entry = trustList.lists.flatMap(list => list.entries).find(candidate => candidate.keyId === record.keyId);
  if (!entry) return refuse(`not pinned: key ${record.keyId} is in no loaded trust list`);
  const admission = admitKey({ publicKeyPem: entry.publicKeyPem, purpose: "independent-attestation",
    signature: "attester signature", context: trustList });
  if (admission.status !== "admitted") return refuse(`${admission.status}: ${admission.detail ?? "key not admitted"}`);
  if (!verifyHexDigest(record.digestSha256, record.sigB64, entry.publicKeyPem)) {
    return refuse(`signature by ${record.keyId} does not verify over ${record.digestSha256}`);
  }
  return { verified: true, reason: `signed by ${record.keyId} (${entry.subject}), pinned in trust list ${admission.listId ?? "?"}` };
}

/** The operator's trust lists for readers, or null when none load (then no row reads ATTESTED). */
export function readerTrustList(): TrustContext | null {
  try {
    return loadTrustContext();
  } catch {
    return null;
  }
}

/**
 * The tier a reader may use. Synthetic rows are excluded (null). ATTESTED counts only while its attestation verifies
 * against the trust list. Imported, manual and external rows are otherwise SELF_REPORTED, and AMC runtime rows keep
 * their declared tier, a missing or unknown one reading SELF_REPORTED. Stored rows are never rewritten.
 * `trustList` may be a loader, which runs only for a row that claims ATTESTED.
 */
export function effectiveTrustTier(
  event: Pick<EvidenceEvent, "meta_json">, opts: { trustList: TrustContext | null | (() => TrustContext | null) }
): TrustTier | null {
  const meta = eventMeta(event);
  const producer = producerOfMeta(meta);
  if (producer === "synthetic") return null;
  const declared = typeof meta.trustTier === "string" && TIERS.includes(meta.trustTier) ? meta.trustTier as TrustTier : "SELF_REPORTED";
  if (declared === "ATTESTED") {
    // ponytail: the loader reads the trust list once per ATTESTED row; cache it per evaluation if such rows get common.
    const trustList = typeof opts.trustList === "function" ? opts.trustList() : opts.trustList;
    return verifyThirdPartyAttestation(meta.attestation, trustList).verified ? "ATTESTED" : "SELF_REPORTED";
  }
  return producer === "amc-runtime" ? declared : "SELF_REPORTED";
}
