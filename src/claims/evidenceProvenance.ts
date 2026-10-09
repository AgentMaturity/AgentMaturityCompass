import { getPublicKeyHistory, verifyHexDigest } from "../crypto/keys.js";
import { admitKey } from "../trust/admission.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import { ed25519KeyId } from "../trust/trustList.js";
import type { EvidenceEvent, TrustTier } from "../types.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

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
  webhook: "external-report",
  // A4 Forge rows are human statements recorded by AMC, never runtime observations (P1-56).
  "a4-store": "manual"
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

/**
 * One source event of an ingest bundle; the bundle hash is sha256 of the canonical list of these. `agentId` and
 * `sessionId` are the subject the attester signs for: the agent and session the attested copy is written to.
 */
export interface BundleEntry {
  id: string;
  sha256: string;
  ts: number;
  agentId: string;
  sessionId: string;
}

/**
 * A third party's Ed25519 signature over a sha256 digest (an ingest bundle hash), as stored in `meta.attestation`.
 * `bundle` is the signed list itself, so a reader can tie the signature to the row it sits on.
 */
export interface ThirdPartyAttestation {
  keyId: string;
  sigB64: string;
  digestSha256: string;
  attestedBy?: string;
  bundle?: BundleEntry[];
}

/** The ingest bundle hash: what a third-party attester signs. */
export function bundleDigest(bundle: readonly BundleEntry[]): string {
  return sha256Hex(canonicalize(bundle));
}

/** Key ids of the workspace's monitor and auditor keys, current and historical. They never attest as a third party. */
export function workspaceOwnKeyIds(workspace: string): string[] {
  return (["monitor", "auditor"] as const).flatMap((role) => {
    try {
      return getPublicKeyHistory(workspace, role);
    } catch {
      return []; // a role without a key has nothing to exclude
    }
  }).map((pem) => ed25519KeyId(pem)).filter((keyId): keyId is string => keyId !== null);
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
  if (!hasAttestationShape(attestation)) return refuse("malformed attestation: keyId, sigB64 and digestSha256 are required");
  const record = attestation;
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
function readerTrustList(): TrustContext | null {
  try {
    return loadTrustContext();
  } catch {
    return null;
  }
}

/** What a reader checks an ATTESTED row against: the pinned trust lists and the workspace's own key ids. */
export interface ReaderTrust {
  trustList: TrustContext | null;
  ownKeyIds?: readonly string[];
}

/** Reader trust for one evaluation, loaded on the first row that carries an attestation and then reused. */
export function readerTrustFor(workspace?: string): () => ReaderTrust {
  let loaded: ReaderTrust | undefined;
  return () => (loaded ??= { trustList: readerTrustList(), ownKeyIds: workspace ? workspaceOwnKeyIds(workspace) : [] });
}

function hasAttestationShape(value: unknown): value is ThirdPartyAttestation {
  const record = value as Record<string, unknown> | null;
  return !!record && typeof record === "object" && ["keyId", "sigB64", "digestSha256"].every((field) => typeof record[field] === "string");
}

type ReadRow = Pick<EvidenceEvent, "meta_json"> & { payload_sha256?: string; session_id?: string };

/**
 * The bundle entry the attestation binds to this row, if any: the signed bundle hashes to the signed digest and lists
 * the row's original event with this row's payload hash, agent (`meta.agentId`) and session. Without that, one genuine
 * signature could be copied onto any row, or onto another agent's. A bundle whose entries name no subject binds nothing.
 */
function boundEntry(attestation: ThirdPartyAttestation, meta: Record<string, unknown>, row: ReadRow): BundleEntry | undefined {
  const bundle = attestation.bundle;
  if (!Array.isArray(bundle) || typeof meta.originalEventId !== "string" || typeof row.payload_sha256 !== "string"
    || typeof meta.agentId !== "string" || typeof row.session_id !== "string") return undefined;
  // ponytail: every copy stores the whole bundle (quadratic in session size); store a Merkle path if sessions get large.
  if (bundleDigest(bundle) !== attestation.digestSha256) return undefined;
  return bundle.find((entry) => entry?.id === meta.originalEventId && entry?.sha256 === row.payload_sha256
    && entry?.agentId === meta.agentId && entry?.sessionId === row.session_id);
}

/**
 * The tier a reader may use. Synthetic rows are excluded (null). ATTESTED counts only while its attestation is bound
 * to this row and verifies against the trust list by a key that is not the workspace's own. Imported, manual and
 * external rows are otherwise SELF_REPORTED, and AMC runtime rows keep their declared tier, a missing or unknown one
 * reading SELF_REPORTED. Stored rows are never rewritten. `reader` may be a loader, which runs only for a row that
 * claims ATTESTED with an attestation bound to it.
 */
export function effectiveTrustTier(event: ReadRow, reader: ReaderTrust | (() => ReaderTrust)): TrustTier | null {
  const meta = eventMeta(event);
  const producer = producerOfMeta(meta);
  if (producer === "synthetic") return null;
  const declared = typeof meta.trustTier === "string" && TIERS.includes(meta.trustTier) ? meta.trustTier as TrustTier : "SELF_REPORTED";
  if (declared === "ATTESTED") {
    const attestation = meta.attestation;
    if (!hasAttestationShape(attestation) || !boundEntry(attestation, meta, event)) return "SELF_REPORTED";
    const { trustList, ownKeyIds } = typeof reader === "function" ? reader() : reader;
    return verifyThirdPartyAttestation(attestation, trustList, ownKeyIds).verified ? "ATTESTED" : "SELF_REPORTED";
  }
  return producer === "amc-runtime" ? declared : "SELF_REPORTED";
}

/**
 * The rows a reader counts over [startTs, endTs] (P0-18). A row that reads ATTESTED (`tierOf`) counts once per attested
 * event (original event id, payload hash, agent and session), as its earliest copy, whichever key or bundle attests it,
 * and only while the attested event's own time lies in the window, so a copy appended later never carries attested
 * evidence into a later window. Other
 * rows, and rows read ATTESTED without a bound attestation (stale OBSERVED in the diagnostic), pass unchanged.
 */
export function countAttestedOnce<T extends ReadRow & Pick<EvidenceEvent, "ts">>(
  rows: readonly T[], tierOf: (row: T) => string | null | undefined, window: { startTs: number; endTs: number }
): T[] {
  const attested = new Map<T, { key: string; ts: number }>();
  const earliest = new Map<string, T>();
  for (const row of rows) {
    const meta = eventMeta(row);
    const attestation = meta.attestation;
    if (tierOf(row) !== "ATTESTED" || !hasAttestationShape(attestation)) continue;
    const entry = boundEntry(attestation, meta, row);
    if (!entry) continue;
    const key = `${entry.id}\n${entry.sha256}\n${entry.agentId}\n${entry.sessionId}`;
    attested.set(row, { key, ts: entry.ts });
    const kept = earliest.get(key);
    if (!kept || row.ts < kept.ts) earliest.set(key, row);
  }
  return rows.filter((row) => {
    const event = attested.get(row);
    return !event || (event.ts >= window.startTs && event.ts <= window.endTs && earliest.get(event.key) === row);
  });
}

/**
 * Event id to provenance tier for bundle and certificate readers, which only ask whether a row is OBSERVED. No trust
 * list loads, so ATTESTED rows read SELF_REPORTED, as do synthetic rows.
 */
export function trustTierByEventId(rows: ReadonlyArray<Pick<EvidenceEvent, "id" | "meta_json">>): Map<string, string> {
  return new Map(rows.map((row) => [row.id, effectiveTrustTier(row, { trustList: null }) ?? "SELF_REPORTED"]));
}
