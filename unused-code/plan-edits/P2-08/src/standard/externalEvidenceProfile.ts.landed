/** Producer-neutral interchange. This module imports only Node crypto and can run outside AMC. */
import { createHash, createPublicKey, verify } from "node:crypto";

export type ExternalTrustTier = "SELF_REPORTED" | "ATTESTED" | "OBSERVED";
export interface ExternalEvidenceEvent {
  id: string;
  parentId: string | null;
  toolCallId: string | null;
  kind: "input" | "output" | "tool-call" | "tool-result" | "error" | "cancel" | "metadata";
  outcome: "success" | "failure" | "cancelled" | "unknown" | null;
  sourceTime: string | null;
  durationNs: number | null;
  cost: { amount: string; currency: string; source: string; asOf: string } | null;
  attributes: Record<string, string | number | boolean | null>;
}
export interface ExternalEvidenceProfile {
  profile: "amc.external-evidence";
  version: 1;
  source: { producer: string; version: string; originalSha256: string; mediaType: string };
  session: { id: string; parentSessionId: string | null };
  provenance: { trustTier: ExternalTrustTier; captureMethod: "import" | "producer-callback" | "governed-capture"; authorityId: string | null };
  normalization: { normalizer: string; normalizedSha256: string; ingestedAt: string; losses: string[] };
  policyRefs: string[];
  events: ExternalEvidenceEvent[];
  signature: { algorithm: "ed25519"; authorityId: string; value: string } | null;
}

const text = { type: "string", minLength: 1, maxLength: 4096 };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" };
const nullableText = { anyOf: [text, { type: "null" }] };
const timestamp = { type: "string", format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" };
const integer = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const costSchema = obj({ amount: { type: "string", pattern: "^\\d+(?:\\.\\d+)?$", maxLength: 128 },
  currency: { type: "string", pattern: "^[A-Z]{3}$" }, source: text, asOf: timestamp });

export const externalEvidenceProfileSchema: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://agentmaturity.co/standards/external-evidence/v1/schema.json",
  title: "AMC External Evidence Profile v1",
  $comment: "Shape validation does not establish provenance authority. Use verifyExternalEvidence with independently admitted authority keys. Import signatures cannot elevate source trust.",
  ...obj({
    profile: { const: "amc.external-evidence" }, version: { const: 1 },
    source: obj({ producer: text, version: text, originalSha256: digest, mediaType: text }),
    session: obj({ id: text, parentSessionId: nullableText }),
    provenance: obj({ trustTier: { enum: ["SELF_REPORTED", "ATTESTED", "OBSERVED"] },
      captureMethod: { enum: ["import", "producer-callback", "governed-capture"] }, authorityId: nullableText }),
    normalization: obj({ normalizer: text, normalizedSha256: digest, ingestedAt: timestamp,
      losses: { type: "array", maxItems: 256, items: text } }),
    policyRefs: { type: "array", maxItems: 256, uniqueItems: true, items: text },
    events: { type: "array", maxItems: 10000, items: obj({
      id: text, parentId: nullableText, toolCallId: nullableText,
      kind: { enum: ["input", "output", "tool-call", "tool-result", "error", "cancel", "metadata"] },
      outcome: { enum: ["success", "failure", "cancelled", "unknown", null] },
      sourceTime: { anyOf: [timestamp, { type: "null" }] }, durationNs: { anyOf: [integer, { type: "null" }] },
      cost: { anyOf: [costSchema, { type: "null" }] },
      attributes: { type: "object", maxProperties: 256, propertyNames: text, additionalProperties: { anyOf: [
        { type: "string", maxLength: 16384 }, { type: "integer", minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
        { type: "boolean" }, { type: "null" }
      ] } }
    }) },
    signature: { anyOf: [obj({ algorithm: { const: "ed25519" }, authorityId: text,
      value: { type: "string", pattern: "^[A-Za-z0-9+/]{86}==$" } }), { type: "null" }] }
  })
};

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function wellFormed(value: string): boolean { return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value); }
function validText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 4096 && wellFormed(value); }
function nullable(value: unknown): boolean { return value === null || validText(value); }
function validTime(value: unknown): boolean { if (typeof value !== "string") return false;
  try { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value; } catch { return false; } }
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function stringList(value: unknown): value is string[] { return Array.isArray(value) && value.length <= 256 && value.every(validText); }
function sha(bytes: string | Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Evidence canonicalization requires JSON values");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

/** Hashes semantic fields. Receipt time and the signature are excluded, with no inferred event times. */
export function externalEvidenceNormalizedDigest(profile: ExternalEvidenceProfile): string {
  return sha(canonical({ profile: profile.profile, version: profile.version, source: profile.source, session: profile.session,
    provenance: profile.provenance, normalizer: profile.normalization.normalizer, losses: profile.normalization.losses,
    policyRefs: profile.policyRefs, events: profile.events }));
}

/** Domain-separated UTF-8 bytes signed by an external authority; the key is never taken from the evidence. */
export function externalEvidenceSigningBytes(profile: ExternalEvidenceProfile): Buffer {
  const { signature: _signature, ...body } = profile;
  return Buffer.from(`amc.external-evidence/v1\n${canonical(body)}`, "utf8");
}

/** Structural, referential and digest checks; no AMC service, workspace or credential access. */
export function validateExternalEvidenceProfile(value: unknown): string[] {
  const errors: string[] = [];
  const bad = (path: string) => { if (errors.length < 100) errors.push(path); };
  if (!keys(value, ["profile", "version", "source", "session", "provenance", "normalization", "policyRefs", "events", "signature"])) return ["profile: invalid fields"];
  if (value.profile !== "amc.external-evidence" || value.version !== 1) bad("profile: unsupported version");
  if (!keys(value.source, ["producer", "version", "originalSha256", "mediaType"]) || !validText(value.source.producer)
    || !validText(value.source.version) || !validText(value.source.mediaType) || typeof value.source.originalSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.source.originalSha256)) bad("source: invalid metadata");
  if (!keys(value.session, ["id", "parentSessionId"]) || !validText(value.session.id) || !nullable(value.session.parentSessionId)
    || value.session.parentSessionId === value.session.id) bad("session: invalid identity");
  if (!keys(value.provenance, ["trustTier", "captureMethod", "authorityId"])
    || typeof value.provenance.trustTier !== "string" || !["SELF_REPORTED", "ATTESTED", "OBSERVED"].includes(value.provenance.trustTier)
    || typeof value.provenance.captureMethod !== "string" || !["import", "producer-callback", "governed-capture"].includes(value.provenance.captureMethod)
    || !nullable(value.provenance.authorityId)) bad("provenance: invalid declaration");
  if (!keys(value.normalization, ["normalizer", "normalizedSha256", "ingestedAt", "losses"])
    || !validText(value.normalization.normalizer) || typeof value.normalization.normalizedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.normalization.normalizedSha256)
    || !validTime(value.normalization.ingestedAt) || !stringList(value.normalization.losses)) bad("normalization: invalid receipt");
  if (!stringList(value.policyRefs) || new Set(value.policyRefs).size !== value.policyRefs.length) bad("policyRefs: invalid references");
  if (!Array.isArray(value.events) || value.events.length > 10000) return [...errors, "events: invalid count"];
  const ids = new Set<string>(); const calls = new Set<string>(); const results = new Set<string>();
  for (let index = 0; index < value.events.length; index += 1) {
    const event: unknown = value.events[index]; const path = `events[${index}]`;
    if (!keys(event, ["id", "parentId", "toolCallId", "kind", "outcome", "sourceTime", "durationNs", "cost", "attributes"])) { bad(`${path}: invalid fields`); continue; }
    if (!validText(event.id) || ids.has(event.id)) bad(`${path}: duplicate or invalid identity`);
    if (!nullable(event.parentId) || (event.parentId !== null && !ids.has(event.parentId as string))) bad(`${path}: missing or nonpreceding parent`);
    if (validText(event.id)) ids.add(event.id);
    if (!nullable(event.toolCallId) || typeof event.kind !== "string" || !["input", "output", "tool-call", "tool-result", "error", "cancel", "metadata"].includes(event.kind)) bad(`${path}: invalid kind or tool identity`);
    if (!["success", "failure", "cancelled", "unknown", null].includes(event.outcome as string | null)) bad(`${path}: invalid outcome`);
    if (event.sourceTime !== null && !validTime(event.sourceTime)) bad(`${path}: invalid source time`);
    if (event.durationNs !== null && (!Number.isSafeInteger(event.durationNs) || (event.durationNs as number) < 0)) bad(`${path}: invalid duration`);
    if (event.cost !== null && (!keys(event.cost, ["amount", "currency", "source", "asOf"])
      || typeof event.cost.amount !== "string" || event.cost.amount.length > 128 || !/^\d+(?:\.\d+)?$/.test(event.cost.amount)
      || typeof event.cost.currency !== "string" || !/^[A-Z]{3}$/.test(event.cost.currency) || !validText(event.cost.source) || !validTime(event.cost.asOf))) bad(`${path}: invalid cost provenance`);
    if (!record(event.attributes) || Object.keys(event.attributes).length > 256
      || !Object.entries(event.attributes).every(([key, item]) => validText(key) && (item === null || typeof item === "boolean"
        || (typeof item === "number" && Number.isSafeInteger(item)) || (typeof item === "string" && item.length <= 16384
          && wellFormed(item))))) bad(`${path}: invalid attributes`);
    if (event.kind === "tool-call") {
      if (!validText(event.toolCallId) || calls.has(event.toolCallId)) bad(`${path}: missing or duplicate tool call`);
      else calls.add(event.toolCallId);
    }
    if (event.kind === "tool-result") {
      if (!validText(event.toolCallId) || !calls.has(event.toolCallId) || results.has(event.toolCallId)) bad(`${path}: unmatched or duplicate tool result`);
      else results.add(event.toolCallId);
    }
  }
  if (value.signature !== null && (!keys(value.signature, ["algorithm", "authorityId", "value"])
    || value.signature.algorithm !== "ed25519" || !validText(value.signature.authorityId)
    || typeof value.signature.value !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(value.signature.value))) bad("signature: invalid envelope");
  if (!errors.length) {
    const profile = value as unknown as ExternalEvidenceProfile;
    if (externalEvidenceNormalizedDigest(profile) !== profile.normalization.normalizedSha256) bad("normalization: digest mismatch");
    if (Buffer.byteLength(canonical(profile)) > 16 * 1024 * 1024) bad("profile: size limit exceeded");
  }
  return errors;
}

/** Construct an unsigned import. Importing never grants authority, even when the importer has a signing key. */
export function createImportedExternalEvidence(input: {
  source: ExternalEvidenceProfile["source"];
  session: ExternalEvidenceProfile["session"];
  normalizer: string;
  ingestedAt: string;
  losses: string[];
  events: ExternalEvidenceEvent[];
  policyRefs?: string[];
}): ExternalEvidenceProfile {
  const profile: ExternalEvidenceProfile = {
    profile: "amc.external-evidence", version: 1, source: structuredClone(input.source), session: structuredClone(input.session),
    provenance: { trustTier: "SELF_REPORTED", captureMethod: "import", authorityId: null },
    normalization: { normalizer: input.normalizer, normalizedSha256: "", ingestedAt: input.ingestedAt, losses: [...input.losses] },
    policyRefs: [...(input.policyRefs ?? [])], events: structuredClone(input.events), signature: null
  };
  profile.normalization.normalizedSha256 = externalEvidenceNormalizedDigest(profile);
  const errors = validateExternalEvidenceProfile(profile);
  if (errors.length) throw new Error(`Invalid imported evidence: ${errors.join("; ")}`);
  return profile;
}

export interface ExternalEvidenceAuthority {
  id: string;
  publicKeyPem: string;
  maxTrustTier: "ATTESTED" | "OBSERVED";
  captureMethods: Array<"producer-callback" | "governed-capture">;
  /** Match the producer identity that this independently configured authority is admitted to attest. */
  producers: string[];
}

export function verifyExternalEvidence(value: unknown, options: {
  authorities?: readonly ExternalEvidenceAuthority[];
  originalBytes?: Uint8Array;
  expectedNormalizedDigest?: string;
} = {}): {
  ok: boolean; errors: string[]; trustTier: ExternalTrustTier; signatureVerified: boolean;
  originalDigest: "verified" | "declared-not-checked" | "mismatch";
  parentSession: "none" | "declared-not-verified";
} {
  const errors = validateExternalEvidenceProfile(value);
  let trustTier: ExternalTrustTier = "SELF_REPORTED"; let signatureVerified = false;
  let originalDigest: "verified" | "declared-not-checked" | "mismatch" = "declared-not-checked";
  if (errors.length) return { ok: false, errors, trustTier, signatureVerified, originalDigest, parentSession: "declared-not-verified" };
  const profile = value as ExternalEvidenceProfile;
  if (options.expectedNormalizedDigest !== undefined && options.expectedNormalizedDigest !== profile.normalization.normalizedSha256) errors.push("normalization: expected digest mismatch");
  if (options.originalBytes !== undefined) {
    originalDigest = sha(options.originalBytes) === profile.source.originalSha256 ? "verified" : "mismatch";
    if (originalDigest === "mismatch") errors.push("source: original digest mismatch");
  }
  if (profile.signature !== null) {
    const matches = (options.authorities ?? []).filter((item) => item.id === profile.signature!.authorityId);
    const authority = matches.length === 1 ? matches[0] : undefined;
    if (!authority || profile.provenance.authorityId !== authority.id || !authority.producers.includes(profile.source.producer)) {
      errors.push("signature: authority not independently admitted for this producer");
    } else {
      try {
        const key = createPublicKey(authority.publicKeyPem);
        const signature = Buffer.from(profile.signature.value, "base64");
        signatureVerified = key.asymmetricKeyType === "ed25519" && signature.length === 64
          && signature.toString("base64") === profile.signature.value && verify(null, externalEvidenceSigningBytes(profile), key, signature);
      } catch { signatureVerified = false; }
      if (!signatureVerified) errors.push("signature: verification failed");
      if (signatureVerified && profile.provenance.captureMethod !== "import"
        && authority.captureMethods.includes(profile.provenance.captureMethod)) {
        trustTier = authority.maxTrustTier === "OBSERVED" && profile.provenance.captureMethod === "governed-capture" ? "OBSERVED" : "ATTESTED";
      }
    }
  }
  const ranks = { SELF_REPORTED: 0, ATTESTED: 1, OBSERVED: 2 };
  if (ranks[profile.provenance.trustTier] > ranks[trustTier]) errors.push("provenance: declared trust exceeds admitted capture authority");
  // Return no higher claim than the producer actually made, even if the admitted key could support it.
  if (ranks[profile.provenance.trustTier] < ranks[trustTier]) trustTier = profile.provenance.trustTier;
  if (errors.length) trustTier = "SELF_REPORTED";
  return { ok: errors.length === 0, errors, trustTier, signatureVerified, originalDigest,
    parentSession: profile.session.parentSessionId === null ? "none" : "declared-not-verified" };
}
