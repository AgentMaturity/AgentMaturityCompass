/**
 * Ledger-row delegation (P2-08). The ledger signs every event, so it never calls a remote provider per event: it keeps
 * a local software `ledger-row` key (the delegate), and the provider-held key certifies that key's public key for a
 * window of at most 24 hours and at most `maxEvents` rows. A verifier admits a delegate's row only through a valid
 * delegation from a provider key it pinned, checked at the row's own signing time and event index.
 *
 * Signed bytes: `AMC_KEY_DELEGATION_V1`, one 0x00 byte, then the canonical statement. A signed delegation exists in one
 * encoding only (canonical JSON, toISOString times, canonical base64), so a changed byte is a different statement.
 */
import { z } from "zod";
import { canonicalize, isCanonicalSignatureBase64, isExactIsoTime, parseCanonicalJson } from "../utils/json.js";
import { canonicalSigningKey, SIGNING_ALGORITHMS, signingKeyId, verifyCanonical, verifyWithKey } from "./algorithmPolicy.js";
import { signChecked, type KeyDescription, type KeyProvider } from "./provider.js";

const TAG = "AMC_KEY_DELEGATION_V1";
export const MAX_DELEGATION_HOURS = 24;
const HOUR_MS = 3_600_000;
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const time = z.iso.datetime().refine(isExactIsoTime, "time must be in toISOString form");

const delegationSchema = z.strictObject({
  type: z.literal("amc.key-delegation"),
  version: z.literal(1),
  delegateKeyId: hex,
  delegatePublicKeyPem: z.string().min(1).max(4096),
  purpose: z.literal("ledger-row"),
  notBefore: time,
  notAfter: time,
  maxEvents: z.number().int().positive().safe(),
  issuerKeyId: hex
});
const signedDelegationSchema = z.strictObject({
  delegation: delegationSchema,
  algorithm: z.enum(SIGNING_ALGORITHMS),
  signature: z.string().refine(isCanonicalSignatureBase64, "signature must be canonical base64 of 64 bytes")
});
export type KeyDelegationV1 = z.infer<typeof delegationSchema>;
export type SignedKeyDelegation = z.infer<typeof signedDelegationSchema>;

function signedBytes(delegation: KeyDelegationV1): Buffer {
  return Buffer.concat([Buffer.from(TAG, "ascii"), Buffer.from([0]), Buffer.from(canonicalize(delegation), "utf8")]);
}

export function encodeDelegation(signed: SignedKeyDelegation): Buffer {
  return Buffer.from(canonicalize(signedDelegationSchema.parse(signed)), "utf8");
}

/** The provider key `issuer` certifies the Ed25519 delegate for [notBefore, notBefore + hours], hours at most 24. */
export async function issueDelegation(provider: KeyProvider, issuer: KeyDescription,
  input: { delegatePublicKeyPem: string; notBefore: Date; hours: number; maxEvents: number }): Promise<SignedKeyDelegation> {
  if (!(input.hours > 0 && input.hours <= MAX_DELEGATION_HOURS)) throw new Error(`a delegation lasts at most ${MAX_DELEGATION_HOURS} hours`);
  const delegate = canonicalSigningKey(input.delegatePublicKeyPem);
  if (delegate?.algorithm !== "ed25519") throw new Error("the ledger-row delegate must be an Ed25519 public key");
  const delegation = delegationSchema.parse({
    type: "amc.key-delegation", version: 1, delegateKeyId: signingKeyId(delegate.pem), delegatePublicKeyPem: delegate.pem, purpose: "ledger-row",
    notBefore: input.notBefore.toISOString(), notAfter: new Date(input.notBefore.getTime() + input.hours * HOUR_MS).toISOString(),
    maxEvents: input.maxEvents, issuerKeyId: issuer.keyId
  });
  const signature = await signChecked(provider, issuer, signedBytes(delegation));
  return { delegation, algorithm: issuer.algorithm, signature: signature.toString("base64") };
}

export type DelegationVerdict = { valid: true; delegation: KeyDelegationV1 } | { valid: false; reason: string };

/**
 * Valid only for the canonical encoding of a delegation whose issuer is one of `issuerPublicKeyPems` (pinned by the
 * verifier, never named by the file), whose signature verifies under it, which lasts at most 24 hours, covers `at`
 * and, when given, has not delegated more than maxEvents rows by `eventsSigned`.
 */
export function verifyDelegation(bytes: Buffer, opts: { issuerPublicKeyPems: readonly string[]; at: Date; eventsSigned?: number }): DelegationVerdict {
  const fail = (reason: string): DelegationVerdict => ({ valid: false, reason });
  let signed: SignedKeyDelegation;
  try {
    signed = signedDelegationSchema.parse(parseCanonicalJson(bytes));
  } catch {
    return fail("not a canonical signed amc.key-delegation");
  }
  const { delegation } = signed;
  const issuer = opts.issuerPublicKeyPems.find(pem => signingKeyId(pem) === delegation.issuerKeyId);
  if (issuer === undefined) return fail(`issuer ${delegation.issuerKeyId} is not a pinned provider key`);
  if (!verifyCanonical(signed.algorithm, signedBytes(delegation), issuer, Buffer.from(signed.signature, "base64"))) return fail("the issuer's signature does not verify");
  const delegate = canonicalSigningKey(delegation.delegatePublicKeyPem);
  if (delegate?.algorithm !== "ed25519" || delegate.pem !== delegation.delegatePublicKeyPem || signingKeyId(delegate.pem) !== delegation.delegateKeyId) {
    return fail("the delegate is not the canonical Ed25519 key its key id names");
  }
  const from = Date.parse(delegation.notBefore);
  const to = Date.parse(delegation.notAfter);
  if (!(to > from && to - from <= MAX_DELEGATION_HOURS * HOUR_MS)) return fail(`a delegation must last more than 0 and at most ${MAX_DELEGATION_HOURS} hours`);
  const at = opts.at.getTime();
  if (at < from || at > to) return fail(`${opts.at.toISOString()} is outside the delegation window (expired or not yet valid)`);
  if (opts.eventsSigned !== undefined && opts.eventsSigned > delegation.maxEvents) return fail(`the delegate signed more than maxEvents (${delegation.maxEvents}) rows`);
  return { valid: true, delegation };
}

/** A delegate's ledger row: admitted when the delegation is valid at the row's time and index and the row verifies. */
export function admitDelegatedRow(input: {
  delegation: Buffer; issuerPublicKeyPems: readonly string[]; digestHex: string; signatureB64: string; signedAt: Date; eventIndex: number;
}): { admitted: true } | { admitted: false; reason: string } {
  const verdict = verifyDelegation(input.delegation, { issuerPublicKeyPems: input.issuerPublicKeyPems, at: input.signedAt, eventsSigned: input.eventIndex });
  if (!verdict.valid) return { admitted: false, reason: verdict.reason };
  if (!/^[0-9a-f]{64}$/.test(input.digestHex) || !verifyWithKey(Buffer.from(input.digestHex, "hex"), verdict.delegation.delegatePublicKeyPem, Buffer.from(input.signatureB64, "base64"))) {
    return { admitted: false, reason: "the row signature does not verify under the delegate key" };
  }
  return { admitted: true };
}
