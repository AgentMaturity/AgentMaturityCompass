import { createHash, verify, X509Certificate } from "node:crypto";
import type { TrustContext } from "../trust/trustContext.js";
import type { TimestampAuthority } from "../trust/trustList.js";
import { children, derTime, expectTag, oid, parseDer, uintHex, type Der } from "./der.js";
import type { AttestedTime } from "./timeEvidence.js";

/**
 * Offline RFC 3161 token verification (P1-25): CMS SignedData (RFC 5652), ESSCertID / ESSCertIDv2 (RFC 2634,
 * RFC 5035, RFC 5816) and an X.509 path to an operator-pinned TSA anchor, on Node's crypto alone. A certificate the
 * token carries only helps find the path; it never vouches for the token. Revocation is not checked
 * (revocationChecked: false), and path checks cover issuer signatures, CA flags and validity at genTime, not name or
 * policy constraints.
 */
export type TstErrorCode = "TST_MALFORMED" | "TST_STATUS_REJECTED" | "TST_IMPRINT_MISMATCH" | "TST_NONCE_MISMATCH"
  | "TST_SIGNATURE_INVALID" | "TST_UNTRUSTED_TSA" | "TST_EKU_MISSING" | "TST_CERT_EXPIRED_AT_GENTIME";

export type VerifyTimestampResult = { ok: true; attested: AttestedTime } | { ok: false; code: TstErrorCode; detail: string };

export const TIMESTAMP_TOKEN_MAX_BYTES = 64 * 1024;
const MAX_PATH_LENGTH = 6;

const OID = {
  signedData: "1.2.840.113549.1.7.2",
  tstInfo: "1.2.840.113549.1.9.16.1.4",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertificate: "1.2.840.113549.1.9.16.2.12",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  extKeyUsage: "2.5.29.37",
  timeStamping: "1.3.6.1.5.5.7.3.8"
} as const;
const HASHES: Record<string, string> = {
  "2.16.840.1.101.3.4.2.1": "sha256", "2.16.840.1.101.3.4.2.2": "sha384", "2.16.840.1.101.3.4.2.3": "sha512"
};
const ESS_HASHES: Record<string, string> = { ...HASHES, "1.3.14.3.2.26": "sha1" };
/** Signature algorithm → [key type, hash]; a null hash takes the SignerInfo digestAlgorithm. */
const SIGNATURES: Record<string, [string, string | null]> = {
  "1.2.840.113549.1.1.1": ["rsa", null], "1.2.840.113549.1.1.11": ["rsa", "sha256"],
  "1.2.840.113549.1.1.12": ["rsa", "sha384"], "1.2.840.113549.1.1.13": ["rsa", "sha512"],
  "1.2.840.10045.2.1": ["ec", null], "1.2.840.10045.4.3.2": ["ec", "sha256"],
  "1.2.840.10045.4.3.3": ["ec", "sha384"], "1.2.840.10045.4.3.4": ["ec", "sha512"], "1.3.101.112": ["ed25519", "none"]
};

class TstError extends Error {
  constructor(readonly code: TstErrorCode, message: string) { super(message); }
}
const fail = (code: TstErrorCode, message: string): never => { throw new TstError(code, message); };

/** Every TSA anchor in the trust lists the context verified. */
export function timestampAnchors(context: Pick<TrustContext, "lists">): TimestampAuthority[] {
  return context.lists.flatMap(list => list.timestampAuthorities ?? []);
}

/** The TimeStampToken (ContentInfo) of a TimeStampResp, or the input when it already is one. */
function tokenOf(top: Der): Der {
  const [first, second] = children(expectTag(top, 0x30, "token"));
  if (first?.tag !== 0x30) return top;
  const status = Number.parseInt(uintHex(children(first)[0], "PKIStatus"), 16);
  if (status !== 0 && status !== 1) fail("TST_STATUS_REJECTED", `the TSA answered with PKIStatus ${status}`);
  return second ?? fail("TST_MALFORMED", "a granted response carries no timeStampToken");
}

interface Parsed {
  token: Der; tstInfo: Buffer; certificates: X509Certificate[];
  signer: { digest: string; signedAttrs: Der; signatureAlgorithm: string; signature: Buffer };
  info: { policy: string; imprintAlgorithm: string; imprint: string; serial: string; genTime: Date; accuracyMs: number | null; nonce: string | null };
}

function parseToken(input: Buffer): Parsed {
  const token = tokenOf(parseDer(input));
  const [contentType, content] = children(token);
  if (oid(contentType) !== OID.signedData) fail("TST_MALFORMED", "the token is not CMS SignedData");
  const fields = children(expectTag(children(expectTag(content, 0xa0, "content"))[0], 0x30, "SignedData"));
  const [eType, eContent] = children(expectTag(fields[2], 0x30, "encapContentInfo"));
  if (oid(eType) !== OID.tstInfo) fail("TST_MALFORMED", "the token does not carry id-ct-TSTInfo");
  const tstInfo = expectTag(children(expectTag(eContent, 0xa0, "eContent"))[0], 0x04, "eContent").value;
  const certificates = fields.filter(field => field.tag === 0xa0).flatMap(children).filter(cert => cert.tag === 0x30)
    .map(cert => new X509Certificate(cert.bytes));
  const signerInfos = children(expectTag(fields[fields.length - 1], 0x31, "signerInfos"));
  if (signerInfos.length !== 1) fail("TST_MALFORMED", `a token has exactly one SignerInfo, found ${signerInfos.length}`);
  const [, , digestAlgorithm, signedAttrs, signatureAlgorithm, signature] = children(signerInfos[0]!);
  const info = children(expectTag(parseDer(tstInfo), 0x30, "TSTInfo"));
  if (uintHex(info[0]) !== "1") fail("TST_MALFORMED", "TSTInfo version is not 1");
  const [imprintAlgorithm, imprint] = children(expectTag(info[2], 0x30, "messageImprint"));
  // After genTime: accuracy (SEQUENCE), ordering, nonce (INTEGER), tsa [0], extensions [1].
  const optional = (tag: number) => info.slice(5).find(node => node.tag === tag);
  const accuracy = optional(0x30);
  // Accuracy: seconds INTEGER, millis [0] and micros [1] IMPLICIT INTEGER (RFC 3161 uses IMPLICIT TAGS).
  const part = (tag: number) => {
    const node = children(accuracy!).find(field => field.tag === tag);
    return node ? Number.parseInt(uintHex({ ...node, tag: 0x02 }, "accuracy"), 16) : 0;
  };
  return {
    token, tstInfo, certificates,
    signer: { digest: oid(children(expectTag(digestAlgorithm, 0x30, "digestAlgorithm"))[0]), signedAttrs: expectTag(signedAttrs, 0xa0, "signedAttrs"),
      signatureAlgorithm: oid(children(expectTag(signatureAlgorithm, 0x30, "signatureAlgorithm"))[0]),
      signature: expectTag(signature, 0x04, "signature").value },
    info: {
      policy: oid(info[1], "policy"), imprintAlgorithm: oid(children(expectTag(imprintAlgorithm, 0x30, "hashAlgorithm"))[0]),
      imprint: expectTag(imprint, 0x04, "hashedMessage").value.toString("hex"), serial: uintHex(info[3], "serialNumber"),
      genTime: derTime(expectTag(info[4], 0x18, "genTime")),
      accuracyMs: accuracy ? part(0x02) * 1000 + part(0x80) + part(0x81) / 1000 : null,
      nonce: optional(0x02) ? uintHex(optional(0x02), "nonce") : null
    }
  };
}

/** The signed attributes, one value each; a repeated attribute type is refused (RFC 5652 §5.3). */
function signedAttributes(signedAttrs: Der): Map<string, Der> {
  const attributes = new Map<string, Der>();
  for (const attribute of children(signedAttrs)) {
    const [type, values] = children(expectTag(attribute, 0x30, "attribute"));
    const key = oid(type);
    const set = children(expectTag(values, 0x31, "attrValues"));
    if (attributes.has(key) || set.length !== 1) fail("TST_SIGNATURE_INVALID", `signed attribute ${key} is repeated or multi-valued`);
    attributes.set(key, set[0]!);
  }
  return attributes;
}

/** The certificate the first ESSCertIDv2 (else ESSCertID) names, among the token's certificates and the anchors. */
function essSigner(attributes: Map<string, Der>, pool: readonly X509Certificate[]): X509Certificate {
  const v2 = attributes.get(OID.signingCertificateV2);
  const v1 = attributes.get(OID.signingCertificate);
  if (!v2 && !v1) return fail("TST_SIGNATURE_INVALID", "no signing-certificate attribute binds the signer certificate");
  const first = children(children(expectTag(v2 ?? v1, 0x30, "SigningCertificate"))[0]!)[0];
  const parts = children(expectTag(first, 0x30, "ESSCertID"));
  const hashed = v2 && parts[0]?.tag === 0x30 ? ESS_HASHES[oid(children(parts.shift()!)[0])] : v2 ? "sha256" : "sha1";
  if (!hashed) return fail("TST_SIGNATURE_INVALID", "unsupported ESSCertIDv2 hash algorithm");
  const certHash = expectTag(parts[0], 0x04, "certHash").value;
  return pool.find(cert => createHash(hashed).update(cert.raw).digest().equals(certHash))
    ?? fail("TST_UNTRUSTED_TSA", "the certificate the signing-certificate attribute names is neither in the token nor pinned");
}

function checkSignature(parsed: Parsed, signer: X509Certificate, attributes: Map<string, Der>): void {
  const digest = HASHES[parsed.signer.digest] ?? fail("TST_SIGNATURE_INVALID", `digest algorithm ${parsed.signer.digest} is not accepted`);
  if (oid(attributes.get(OID.contentType), "content-type") !== OID.tstInfo) fail("TST_SIGNATURE_INVALID", "content-type attribute is not id-ct-TSTInfo");
  const messageDigest = expectTag(attributes.get(OID.messageDigest), 0x04, "message-digest").value;
  if (!createHash(digest).update(parsed.tstInfo).digest().equals(messageDigest)) fail("TST_SIGNATURE_INVALID", "message-digest does not match TSTInfo");
  const [keyType, algorithmHash] = SIGNATURES[parsed.signer.signatureAlgorithm]
    ?? fail("TST_SIGNATURE_INVALID", `signature algorithm ${parsed.signer.signatureAlgorithm} is not supported`);
  if (signer.publicKey.asymmetricKeyType !== keyType) fail("TST_SIGNATURE_INVALID", "the signer key does not match the signature algorithm");
  // The signature covers the DER of the SET OF attributes: the [0] IMPLICIT tag becomes SET (0x31).
  const signed = Buffer.concat([Buffer.from([0x31]), parsed.signer.signedAttrs.bytes.subarray(1)]);
  let valid = false;
  try {
    valid = verify(algorithmHash === "none" ? null : algorithmHash ?? digest, signed, signer.publicKey, parsed.signer.signature);
  } catch (error) {
    fail("TST_SIGNATURE_INVALID", `signature check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!valid) fail("TST_SIGNATURE_INVALID", "the CMS signature does not verify under the signer certificate");
}

/** RFC 3161 §2.3: exactly one EKU extension, critical, whose only purpose is id-kp-timeStamping. */
function checkEku(cert: X509Certificate): void {
  const tbs = children(children(parseDer(cert.raw))[0]!);
  const extensions = tbs.find(node => node.tag === 0xa3);
  const eku = extensions ? children(children(extensions)[0]!).map(children).filter(ext => oid(ext[0]) === OID.extKeyUsage) : [];
  const ext = eku.length === 1 ? eku[0]! : fail("TST_EKU_MISSING", `the TSA certificate has ${eku.length} extended key usage extensions`);
  const critical = ext.length === 3 && ext[1]!.tag === 0x01 && ext[1]!.value[0] === 0xff;
  const purposes = children(parseDer(expectTag(ext[ext.length - 1], 0x04, "extnValue").value)).map(node => oid(node));
  if (!critical || purposes.length !== 1 || purposes[0] !== OID.timeStamping) {
    fail("TST_EKU_MISSING", "the TSA certificate's extended key usage must be critical and only id-kp-timeStamping");
  }
}

function validity(cert: X509Certificate): [number, number] {
  const fields = children(children(parseDer(cert.raw))[0]!);
  const [notBefore, notAfter] = children(expectTag(fields[fields[0]!.tag === 0xa0 ? 4 : 3], 0x30, "validity"));
  return [derTime(notBefore).getTime(), derTime(notAfter).getTime()];
}

/** signer → carried intermediates → a pinned anchor (or the signer itself pinned). Throws TST_UNTRUSTED_TSA. */
function pathToAnchor(signer: X509Certificate, carried: readonly X509Certificate[], anchors: ReadonlyArray<{ cert: X509Certificate; anchor: TimestampAuthority }>) {
  const path = [signer];
  for (let current = signer; path.length <= MAX_PATH_LENGTH;) {
    const pinned = anchors.find(({ cert }) => cert.raw.equals(current.raw))
      ?? anchors.find(({ cert }) => cert.ca && current.checkIssued(cert) && current.verify(cert.publicKey));
    if (pinned) return { path: pinned.cert.raw.equals(current.raw) ? path : [...path, pinned.cert], anchor: pinned.anchor };
    const next = carried.find(cert => cert.ca && !path.includes(cert) && current.checkIssued(cert) && current.verify(cert.publicKey));
    if (!next) break;
    path.push(next);
    current = next;
  }
  return fail("TST_UNTRUSTED_TSA", `no path from TSA certificate "${signer.subject.replace(/\n/g, ", ")}" to a pinned TSA anchor`);
}

export function verifyTimestampToken(input: {
  /** A DER TimeStampResp or TimeStampToken. */
  token: Buffer;
  /** sha256 hex of the data the token must cover. */
  expectedDigestHex: string;
  /** The request nonce, hex, when this verifies a fresh response. */
  nonceHex?: string;
  anchors: readonly TimestampAuthority[];
}): VerifyTimestampResult {
  try {
    if (input.token.length > TIMESTAMP_TOKEN_MAX_BYTES) fail("TST_MALFORMED", `the token exceeds ${TIMESTAMP_TOKEN_MAX_BYTES} bytes`);
    let parsed: Parsed;
    try {
      parsed = parseToken(input.token);
    } catch (error) {
      if (error instanceof TstError) throw error;
      return fail("TST_MALFORMED", error instanceof Error ? error.message : String(error));
    }
    const anchors = input.anchors.map(anchor => ({ anchor, cert: new X509Certificate(anchor.rootCertificatePem) }));
    const attributes = signedAttributes(parsed.signer.signedAttrs);
    const signer = essSigner(attributes, [...parsed.certificates, ...anchors.map(({ cert }) => cert)]);
    checkSignature(parsed, signer, attributes);
    const { info } = parsed;
    if (info.imprintAlgorithm !== "2.16.840.1.101.3.4.2.1" || info.imprint !== input.expectedDigestHex.toLowerCase()) {
      fail("TST_IMPRINT_MISMATCH", "the token's messageImprint is not the expected sha256");
    }
    if (input.nonceHex !== undefined && (info.nonce === null || BigInt(`0x${input.nonceHex}`) !== BigInt(`0x${info.nonce}`))) {
      fail("TST_NONCE_MISMATCH", "the token's nonce is not the request nonce");
    }
    const { path, anchor } = pathToAnchor(signer, parsed.certificates, anchors);
    if (anchor.policyOids && !anchor.policyOids.includes(info.policy)) fail("TST_UNTRUSTED_TSA", `TSA policy ${info.policy} is not pinned for anchor ${anchor.anchorId}`);
    checkEku(signer);
    const at = info.genTime.getTime();
    const expired = path.find(cert => { const [from, to] = validity(cert); return at < from || at > to; });
    if (expired) fail("TST_CERT_EXPIRED_AT_GENTIME", `certificate "${expired.subject.replace(/\n/g, ", ")}" is not valid at genTime ${info.genTime.toISOString()}`);
    return {
      ok: true,
      attested: {
        kind: "rfc3161",
        tsa: { subject: signer.subject.replace(/\n/g, ", "), certSha256: createHash("sha256").update(signer.raw).digest("hex"), anchorId: anchor.anchorId },
        genTime: info.genTime.toISOString(), accuracyMs: info.accuracyMs, policyOid: info.policy, serialNumber: info.serial,
        messageImprint: { hashAlgorithm: "sha256", digest: info.imprint }, tokenDerB64: parsed.token.bytes.toString("base64"),
        revocationChecked: false
      }
    };
  } catch (error) {
    if (error instanceof TstError) return { ok: false, code: error.code, detail: error.message };
    // A DER or X.509 parse failure past the token envelope (a certificate, an attribute) is still a malformed token.
    return { ok: false, code: "TST_MALFORMED", detail: error instanceof Error ? error.message : String(error) };
  }
}
