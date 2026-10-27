/**
 * The external evidence profile v1 (docs/EXTERNAL_EVIDENCE_PROFILE.md). Mirrors validateExternalEvidenceProfile in
 * src/standard/externalEvidenceProfile.ts: the same fields, bounds and reference rules; the digest is checked by the caller.
 */
import { profileCanonical, sha256Hex } from "../bytes.js";
import { arr, int, invalid, isRecord, lit, nullable, obj, oneOf, refine, str, type Check } from "../schema.js";

const wellFormed = (value: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
const validTime = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;
const text = str({ min: 1, max: 4096, check: wellFormed, what: "well-formed text" });
const nullableText = nullable(text);
const digest = str({ regex: /^[a-f0-9]{64}$/, what: "64 hex" });
const time = str({ check: validTime, what: "a canonical UTC time" });
const textList = arr(text, { max: 256 });

const attributes: Check<Record<string, string | number | boolean | null>> = (value, path) => {
  if (!isRecord(value) || Object.keys(value).length > 256) return invalid(path, "expected at most 256 attributes");
  for (const [key, item] of Object.entries(value)) {
    const ok = text(key, path) !== undefined && (item === null || typeof item === "boolean" || (typeof item === "number" && Number.isSafeInteger(item))
      || (typeof item === "string" && item.length <= 16384 && wellFormed(item)));
    if (!ok) invalid(`${path}.${key}`, "invalid attribute value");
  }
  return value as Record<string, string | number | boolean | null>;
};

const event = obj({
  id: text,
  parentId: nullableText,
  toolCallId: nullableText,
  kind: oneOf(["input", "output", "tool-call", "tool-result", "error", "cancel", "metadata"] as const),
  outcome: (value: unknown, path: string) => (value === null ? null : oneOf(["success", "failure", "cancelled", "unknown"] as const)(value, path)),
  sourceTime: nullable(time),
  durationNs: nullable(int({ min: 0 })),
  cost: nullable(obj({ amount: str({ max: 128, regex: /^\d+(?:\.\d+)?$/ }), currency: str({ regex: /^[A-Z]{3}$/ }), source: text, asOf: time })),
  attributes
});
export type ExternalEvent = ReturnType<typeof event>;

/** Event ids unique, parents precede children, tool results settle one preceding call once. */
function references(events: ExternalEvent[]): boolean {
  const ids = new Set<string>();
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const item of events) {
    if (ids.has(item.id) || (item.parentId !== null && !ids.has(item.parentId))) return false;
    ids.add(item.id);
    if (item.kind === "tool-call") {
      if (item.toolCallId === null || calls.has(item.toolCallId)) return false;
      calls.add(item.toolCallId);
    }
    if (item.kind === "tool-result") {
      if (item.toolCallId === null || !calls.has(item.toolCallId) || results.has(item.toolCallId)) return false;
      results.add(item.toolCallId);
    }
  }
  return true;
}

const shape = obj({
  profile: lit("amc.external-evidence"),
  version: lit(1, "UNSUPPORTED_VERSION"),
  source: obj({ producer: text, version: text, originalSha256: digest, mediaType: text }),
  session: refine(obj({ id: text, parentSessionId: nullableText }), value => value.parentSessionId !== value.id, "a session is not its own parent"),
  provenance: obj({ trustTier: oneOf(["SELF_REPORTED", "ATTESTED", "OBSERVED"] as const),
    captureMethod: oneOf(["import", "producer-callback", "governed-capture"] as const), authorityId: nullableText }),
  normalization: obj({ normalizer: text, normalizedSha256: digest, ingestedAt: time, losses: textList }),
  policyRefs: refine(textList, refs => new Set(refs).size === refs.length, "policyRefs must be unique"),
  events: refine(arr(event, { max: 10000 }), references, "event references are invalid"),
  signature: nullable(obj({ algorithm: oneOf(["ed25519", "ecdsa-p256-sha256"] as const), authorityId: text, value: str({ regex: /^[A-Za-z0-9+/]{86}==$/ }) }))
});
export type ExternalEvidence = ReturnType<typeof shape>;

export const externalEvidence: Check<ExternalEvidence> = (value, path) => {
  const profile = shape(value, path);
  if (Buffer.byteLength(profileCanonical(profile)) > 16 * 1024 * 1024) invalid(path, "profile exceeds 16 MiB");
  return profile;
};

/** The semantic digest: canonical {profile, version, source, session, provenance, normalizer, losses, policyRefs, events}. */
export function normalizedDigest(profile: ExternalEvidence): string {
  return sha256Hex(profileCanonical({ profile: profile.profile, version: profile.version, source: profile.source, session: profile.session,
    provenance: profile.provenance, normalizer: profile.normalization.normalizer, losses: profile.normalization.losses,
    policyRefs: profile.policyRefs, events: profile.events }));
}

/** The signed bytes: "amc.external-evidence/v1\n" then the canonical profile without `signature`. */
export function signingBytes(profile: ExternalEvidence): Buffer {
  const { signature: _signature, ...body } = profile;
  return Buffer.from(`amc.external-evidence/v1\n${profileCanonical(body)}`, "utf8");
}
