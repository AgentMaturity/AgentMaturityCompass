/** The signed trust list (P0-09, with P1-08's rootThreshold and P1-25/P1-26's optional anchors). Mirrors src/trust/trustList.ts. */
import { createPublicKey, X509Certificate } from "node:crypto";
import { canonicalSigningPem, isCanonicalSignatureBase64, signingKeyId } from "../bytes.js";
import { KEY_PURPOSES } from "../codes.js";
import { arr, bool, int, isoTime, lit, nonEmpty, nullable, obj, oneOf, opt, refine, sha256, str, text } from "../schema.js";

const listIdRule = str({ regex: /^[a-z0-9][a-z0-9._-]{0,63}$/, what: "a list id" });
const unique = <T>(key: (item: T) => string) => (items: T[]) => new Set(items.map(key)).size === items.length;

const entryShape = obj({
  keyId: sha256,
  algorithm: oneOf(["ed25519", "ecdsa-p256-sha256"] as const),
  publicKeyPem: str({ min: 1, max: 4096 }),
  purposes: refine(arr(oneOf(KEY_PURPOSES), { min: 1 }), unique(purpose => purpose), "purposes must be unique"),
  subject: nonEmpty,
  validFrom: isoTime,
  validTo: nullable(isoTime),
  revokedAt: opt(isoTime),
  revocationReason: opt(oneOf(["superseded", "cessation", "key-compromise", "unspecified"] as const)),
  allowKeyHistory: opt(bool),
  source: str({ regex: /^(operator|amc-project|imported:.+)$/, what: '"operator", "amc-project" or "imported:<uri>"' }),
  authority: opt(obj({
    producers: arr(nonEmpty, { min: 1 }),
    captureMethods: arr(oneOf(["producer-callback", "governed-capture"] as const), { min: 1 }),
    maxTrustTier: oneOf(["ATTESTED", "OBSERVED"] as const)
  }))
});
export type TrustListEntry = ReturnType<typeof entryShape>;

const entry = refine(entryShape, value => canonicalSigningPem(value.publicKeyPem)?.pem === value.publicKeyPem
  && canonicalSigningPem(value.publicKeyPem)?.algorithm === value.algorithm
  && signingKeyId(value.publicKeyPem) === value.keyId
  && (value.validTo === null || Date.parse(value.validTo) > Date.parse(value.validFrom))
  && (value.revokedAt === undefined) === (value.revocationReason === undefined)
  && (!value.purposes.includes("evidence-authority") || value.authority !== undefined),
"entry rules: canonical PEM of the entry's algorithm (Ed25519 or ECDSA P-256) whose sha256 is keyId, validTo after validFrom, revokedAt with revocationReason, evidence-authority with authority");

const distrust = obj({
  keyId: sha256,
  distrustedFrom: nullable(isoTime),
  reason: oneOf(["key-compromise", "exposed-in-public-history", "superseded", "unspecified"] as const),
  note: text,
  reference: opt(nonEmpty),
  source: nonEmpty
});
export type DistrustEntry = ReturnType<typeof distrust>;
export const distrustEntry = distrust;

function oneCertificate(pem: string): boolean {
  if ((pem.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0) !== 1) return false;
  try {
    return new X509Certificate(pem).raw.length > 0;
  } catch {
    return false;
  }
}

/** A C2SP note key: Ed25519, or ECDSA on P-256, P-384 or P-521. */
function noteKey(pem: string): boolean {
  if (!pem.trimStart().startsWith("-----BEGIN PUBLIC KEY-----")) return false;
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType === "ed25519") return true;
    const curve = key.asymmetricKeyDetails?.namedCurve;
    return key.asymmetricKeyType === "ec" && (curve === "prime256v1" || curve === "secp384r1" || curve === "secp521r1");
  } catch {
    return false;
  }
}

const timestampAuthority = refine(obj({
  anchorId: listIdRule,
  name: nonEmpty,
  rootCertificatePem: str({ min: 1, max: 16 * 1024 }),
  policyOids: opt(arr(str({ regex: /^[0-2](\.(0|[1-9][0-9]*))+$/, what: "an OID" }), { min: 1 }))
}), value => oneCertificate(value.rootCertificatePem), "rootCertificatePem must be exactly one PEM X.509 certificate");

const transparencyLog = refine(obj({
  logId: listIdRule,
  name: nonEmpty,
  origin: str({ max: 256, regex: /^[^\s+]+$/, what: "an origin without spaces or plus signs" }),
  publicKeyPem: str({ min: 1, max: 4096 })
}), value => noteKey(value.publicKeyPem), "publicKeyPem must be an Ed25519 or ECDSA P-256, P-384 or P-521 SPKI public key");

const list = obj({
  type: lit("amc.trust-list"),
  version: lit(1, "UNSUPPORTED_VERSION"),
  listId: listIdRule,
  sequence: int({ min: 1 }),
  issuedAt: isoTime,
  expiresAt: isoTime,
  entries: refine(arr(entry, { max: 4096 }), unique(item => item.keyId), "duplicate keyId"),
  distrust: arr(distrust),
  timestampAuthorities: opt(refine(arr(timestampAuthority, { max: 64 }), unique(item => item.anchorId), "duplicate anchorId")),
  transparencyLogs: opt(refine(arr(transparencyLog, { max: 64 }), unique(item => item.logId), "duplicate logId")),
  rootThreshold: opt(int({ min: 1, max: 64 }))
});
export type TrustList = ReturnType<typeof list>;

/** One row per root key, each signature in its canonical base64 spelling. */
export const signedTrustList = obj({
  list,
  signatures: refine(arr(obj({
    keyId: sha256,
    publicKeyPem: str({ min: 1, max: 4096 }),
    signature: str({ check: isCanonicalSignatureBase64, what: "canonical base64 of 64 bytes" })
  }), { max: 64 }), unique(row => row.keyId), "one signature per root key")
});
export type SignedTrustList = ReturnType<typeof signedTrustList>;
