/**
 * Sigstore bundle v0.3 around a DSSE envelope. Key-based (the default) needs no network: the bundle carries the envelope
 * and a public-key hint equal to the AMC key id, with no log entries or timestamps, and verifies offline against a key
 * the verifier pins. Keyless signing (Fulcio certificate, Rekor log entry) is an opt-in seam: it needs the
 * `@sigstore/sign` and `@sigstore/bundle` packages, which await dependency review, network access and an ambient OIDC
 * identity, and it publishes an entry in a public log. Tests mock it; nothing here contacts Sigstore on its own.
 */
import { X509Certificate } from "node:crypto";
import { INTOTO_PAYLOAD_TYPE, type DsseEnvelope, type DsseSigner } from "./dsse.js";

/** The media type `@sigstore/bundle` 4.x emits for a bundle without a certificate chain (BUNDLE_V03_MEDIA_TYPE). */
export const SIGSTORE_BUNDLE_V03_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle.v0.3+json";

export interface KeyBasedSigstoreBundle {
  mediaType: typeof SIGSTORE_BUNDLE_V03_MEDIA_TYPE;
  verificationMaterial: { publicKey: { hint: string }; timestampVerificationData: Record<string, never> };
  dsseEnvelope: { payload: string; payloadType: string; signatures: Array<{ sig: string; keyid: string }> };
}

/**
 * Exactly the JSON `@sigstore/bundle`'s bundleToJSON gives a key-based DSSE bundle without witnesses (checked against
 * DSSEBundleBuilder in qualification/2026-10-12-P1-27): empty repeated fields are omitted, as protobuf JSON does.
 */
export function toSigstoreBundle(envelope: DsseEnvelope): KeyBasedSigstoreBundle {
  const [signature] = envelope.signatures;
  return { mediaType: SIGSTORE_BUNDLE_V03_MEDIA_TYPE,
    verificationMaterial: { publicKey: { hint: signature!.keyid }, timestampVerificationData: {} },
    dsseEnvelope: { payload: envelope.payload, payloadType: envelope.payloadType, signatures: [{ sig: signature!.sig, keyid: signature!.keyid }] } };
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keysAre = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join() === [...keys].sort().join();
const keysWithin = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
/** Absent or an empty array: protobuf JSON may write an empty repeated field either way. */
const noneOrEmpty = (value: unknown) => value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * The DSSE envelope of a key-based bundle with no log entries and no timestamps; anything else throws. AMC does not check
 * log entries or timestamps, so a bundle carrying them is refused rather than half-verified.
 */
export function envelopeFromSigstoreBundle(value: unknown): DsseEnvelope {
  if (!isObject(value) || !keysAre(value, ["mediaType", "verificationMaterial", "dsseEnvelope"])) throw new Error("not a Sigstore DSSE bundle");
  if (value.mediaType !== SIGSTORE_BUNDLE_V03_MEDIA_TYPE) throw new Error(`media type ${String(value.mediaType)} is not ${SIGSTORE_BUNDLE_V03_MEDIA_TYPE}`);
  const material = value.verificationMaterial;
  if (isObject(material) && ("certificate" in material || "x509CertificateChain" in material)) {
    throw new Error("a keyless bundle (certificate material): verify it with Sigstore tooling; AMC admits pinned keys only");
  }
  const timestamps = isObject(material) ? material.timestampVerificationData : undefined;
  if (!isObject(material) || !keysWithin(material, ["publicKey", "tlogEntries", "timestampVerificationData"]) || !noneOrEmpty(material.tlogEntries)
    || (timestamps !== undefined && (!isObject(timestamps) || !keysWithin(timestamps, ["rfc3161Timestamps"]) || !noneOrEmpty(timestamps.rfc3161Timestamps)))
    || !isObject(material.publicKey) || !keysAre(material.publicKey, ["hint"])) {
    throw new Error("verificationMaterial must be a public-key hint with no log entries and no timestamps");
  }
  const envelope = value.dsseEnvelope;
  const signatures = isObject(envelope) && Array.isArray(envelope.signatures) ? envelope.signatures as unknown[] : [];
  if (signatures.length !== 1 || !isObject(signatures[0]) || signatures[0].keyid !== material.publicKey.hint) {
    throw new Error("the public-key hint must equal the key id of the envelope's one signature");
  }
  return envelope as unknown as DsseEnvelope;
}

/** `@sigstore/sign`'s Signer interface over an AMC key: the signature with the public key and its key id as the hint. */
export function sigstoreSigner(signer: DsseSigner) {
  return {
    sign: async (data: Buffer) => ({ signature: signer.sign(data), key: { $case: "publicKey" as const, publicKey: signer.publicKeyPem, hint: signer.keyid } })
  };
}

/** A keyless signing service. The real one (loadSigstoreKeyless) reaches Fulcio and Rekor; tests pass a mock. */
export interface KeylessBackend {
  signDsse(payloadType: string, payload: Buffer): Promise<{ bundle: unknown; identity: string }>;
}

/** Signs an in-toto statement keylessly. The result names its identity basis, so nobody mistakes it for a pinned key. */
export async function signStatementKeyless(statement: Buffer, backend: KeylessBackend): Promise<{ bundle: unknown; identityBasis: string }> {
  const { bundle, identity } = await backend.signDsse(INTOTO_PAYLOAD_TYPE, statement);
  return { bundle, identityBasis: `keyless: Fulcio certificate for ${identity}, logged in Rekor` };
}

type Ctor = new (options: Record<string, unknown>) => unknown;
interface SigstoreSign {
  DSSEBundleBuilder: new (options: Record<string, unknown>) => { create(artifact: { data: Buffer; type: string }): Promise<unknown> };
  FulcioSigner: Ctor; RekorWitness: Ctor; TSAWitness: Ctor; CIContextProvider: new (audience: string) => unknown;
  DEFAULT_FULCIO_URL: string; DEFAULT_REKOR_URL: string;
}

/** The SAN of the Fulcio certificate in a bundle's JSON form. */
function certificateIdentity(bundle: unknown): string {
  const material = isObject(bundle) && isObject(bundle.verificationMaterial) ? bundle.verificationMaterial : {};
  const chain = isObject(material.x509CertificateChain) && Array.isArray(material.x509CertificateChain.certificates) ? material.x509CertificateChain.certificates[0] : undefined;
  const certificate = isObject(material.certificate) ? material.certificate : isObject(chain) ? chain : {};
  return typeof certificate.rawBytes === "string" ? new X509Certificate(Buffer.from(certificate.rawBytes, "base64")).subjectAltName ?? "an unnamed identity" : "an unnamed identity";
}

/**
 * The real keyless backend: Fulcio signer with the ambient CI OIDC identity, a Rekor witness and, when `tsaURL` is
 * given, a TSA witness. Not exercised by AMC's tests (it needs network and an OIDC token).
 */
export async function loadSigstoreKeyless(options: { importer?: (specifier: string) => Promise<unknown>; tsaURL?: string } = {}): Promise<KeylessBackend> {
  const load = options.importer ?? ((specifier: string) => import(specifier) as Promise<unknown>);
  let sign: SigstoreSign;
  let bundleToJSON: (bundle: unknown) => unknown;
  try {
    sign = await load("@sigstore/sign") as SigstoreSign;
    ({ bundleToJSON } = await load("@sigstore/bundle") as { bundleToJSON: (bundle: unknown) => unknown });
  } catch (error) {
    throw new Error(`keyless signing needs @sigstore/sign and @sigstore/bundle, which await dependency review (docs/security/dependency-reviews/attestations.md); key-based signing is the default (${error instanceof Error ? error.message : String(error)})`);
  }
  const witnesses = [new sign.RekorWitness({ rekorBaseURL: sign.DEFAULT_REKOR_URL }), ...(options.tsaURL ? [new sign.TSAWitness({ tsaBaseURL: options.tsaURL })] : [])];
  const builder = new sign.DSSEBundleBuilder({ witnesses,
    signer: new sign.FulcioSigner({ identityProvider: new sign.CIContextProvider("sigstore"), fulcioBaseURL: sign.DEFAULT_FULCIO_URL }) });
  return {
    async signDsse(payloadType, payload) {
      const bundle = bundleToJSON(await builder.create({ data: payload, type: payloadType }));
      return { bundle, identity: certificateIdentity(bundle) };
    }
  };
}
