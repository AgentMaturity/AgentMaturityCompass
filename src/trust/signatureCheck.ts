import { readFileSync } from "node:fs";
import { verifyHexDigest } from "../crypto/keys.js";
import { sha256Hex } from "../utils/hash.js";
import { admitKey, type IssuerAdmission } from "./admission.js";
import type { KeyPurpose } from "./keyPurposes.js";
import type { TrustContext } from "./trustContext.js";
import type { VerifierReportV1 } from "./verifierReport.js";

export interface SignatureCheckInput {
  /** Which signature this is, e.g. "manifest.sig". */
  signature: string;
  purpose: KeyPurpose;
  /** True when the signature verifies under this public key. */
  verify: (publicKeyPem: string) => boolean;
  /**
   * Keys that may have made the signature: the ones the artifact names, and an operator-supplied --pubkey. They are
   * only searched for the signer; none of them vouches for the artifact by being here. admitKey decides that.
   */
  candidates: ReadonlyArray<string | null | undefined>;
  context: TrustContext;
  keyHistory?: unknown;
  /** The signing time the artifact claims (step 6): untrusted until P1-25, but it decides revocation and validity windows. */
  claimedSignedAt?: string | number | Date | null;
}

export interface SignatureCheck {
  /** Integrity: some candidate key made this signature. */
  verified: boolean;
  /** Issuer admission of the key that made it (or of the first named key when none did). */
  admission: IssuerAdmission;
}

/** Finds the key that made a signature, then asks admitKey whether the operator pinned it for the purpose. */
export function checkSignature(input: SignatureCheckInput): SignatureCheck {
  const keys = [...new Set(input.candidates.filter((pem): pem is string => typeof pem === "string" && pem.trim().length > 0))];
  const signer = keys.find(pem => input.verify(pem)) ?? null;
  return {
    verified: signer !== null,
    admission: admitKey({ publicKeyPem: signer ?? keys[0] ?? null, purpose: input.purpose, signature: input.signature,
      context: input.context, keyHistory: input.keyHistory, claimedSignedAt: claimedTime(input.claimedSignedAt) })
  };
}

/** A claimed time as admitKey takes it; epoch milliseconds (signedTs, ts) become a Date, anything unusable is no claim. */
export function claimedTime(value: string | number | Date | null | undefined): string | Date | null {
  if (typeof value !== "number") return value ?? null;
  return Number.isFinite(value) && value > 0 ? new Date(value) : null;
}

/** A signature refused for the key itself (distrusted, or revoked): no allow flag turns it into an integrity-only result. */
export function isKeyRefused(admission: IssuerAdmission): boolean {
  return admission.status === "distrusted" || admission.status === "revoked";
}

/**
 * Anchoring of a ledger an artifact carries (bundle, .amccert). Anchored only when the carried monitor key is admitted
 * for ledger-row AND the ledger verified against it, never on an environment pin alone. A distrusted or revoked
 * monitor key also joins `signatures`, so the verdict is a failure that --allow-unanchored cannot turn into exit 2.
 */
export function carriedLedgerAnchoring(monitor: IssuerAdmission, ledgerAnchored: boolean, signatures: IssuerAdmission[]): VerifierReportV1["anchoring"] {
  if (isKeyRefused(monitor)) signatures.push(monitor);
  return monitor.status === "admitted" && ledgerAnchored
    ? { status: "anchored", detail: `monitor key ${monitor.keyId} admitted for ledger-row (${monitor.source})` }
    : { status: "unanchored", detail: `monitor key ${monitor.status}: ${monitor.detail ?? "not admitted for ledger-row"}` };
}

/** checkSignature for the common case: an Ed25519 signature over a sha256 hex digest (signHexDigest). */
export function checkDigestSignature(input: Omit<SignatureCheckInput, "verify"> & { digestHex: string; signatureB64: string }): SignatureCheck {
  return checkSignature({ ...input, verify: pem => verifyHexDigest(input.digestHex, input.signatureB64, pem) });
}

/** The public key an envelope carries (signDigestWithPolicy), or null. Only a candidate, never a vouch. */
export function envelopePublicKey(envelope: unknown): string | null {
  const b64 = (envelope as { pubkeyB64?: unknown } | null | undefined)?.pubkeyB64;
  return typeof b64 === "string" ? Buffer.from(b64, "base64").toString("utf8") : null;
}

export function fileSha256(path: string): string {
  try {
    return sha256Hex(readFileSync(path));
  } catch {
    return "0".repeat(64);
  }
}
