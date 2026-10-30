/**
 * SPIFFE IDs and X.509-SVIDs (P2-25), checked with node:crypto only. Pinned to the SPIFFE specifications named in
 * docs/AGENT_IDENTITY.md (SPIFFE-ID, X509-SVID and the trust bundle format). AMC verifies a presented chain against the
 * trust bundle pinned in signed config; it never fetches a bundle, runs SPIRE or holds a workload's key.
 */
import { X509Certificate } from "node:crypto";

const MAX_ID_BYTES = 2048;
const TRUST_DOMAIN = /^[a-z0-9._-]+$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export interface SpiffeId { readonly id: string; readonly trustDomain: string; readonly path: string }

/** A SPIFFE ID per SPIFFE-ID §2: lowercase trust domain, no port, user info, query or fragment, no empty, "." or ".." segment. */
export function parseSpiffeId(raw: string): SpiffeId | null {
  if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_ID_BYTES || !raw.startsWith("spiffe://")) return null;
  const rest = raw.slice("spiffe://".length);
  const slash = rest.indexOf("/");
  const trustDomain = slash === -1 ? rest : rest.slice(0, slash), path = slash === -1 ? "" : rest.slice(slash);
  if (!TRUST_DOMAIN.test(trustDomain)) return null;
  if (path !== "" && !path.slice(1).split("/").every((segment) => SEGMENT.test(segment) && segment !== "." && segment !== "..")) return null;
  return { id: raw, trustDomain, path };
}

/** PEM blocks in order; anything that is not a certificate refuses the whole input. */
function parseCertificates(pem: string): X509Certificate[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((block) => new X509Certificate(block));
}

function validAt(cert: X509Certificate, nowMs: number): boolean {
  return Date.parse(cert.validFrom) <= nowMs && nowMs <= Date.parse(cert.validTo);
}

function issuedBy(child: X509Certificate, issuer: X509Certificate): boolean {
  return child.checkIssued(issuer) && child.verify(issuer.publicKey);
}

/** The URI SANs of a certificate, from node's comma-separated rendering (a SPIFFE ID cannot contain a comma). */
function uriSans(cert: X509Certificate): string[] {
  return (cert.subjectAltName ?? "").split(", ").filter((entry) => entry.startsWith("URI:")).map((entry) => entry.slice(4));
}

export type X509SvidResult =
  | { readonly ok: true; readonly spiffeId: SpiffeId; readonly notAfter: number; readonly leafFingerprint256: string }
  | { readonly ok: false; readonly reason: string };

/**
 * An X.509-SVID chain (leaf first, then intermediates) against one trust domain's pinned X.509 authorities (X509-SVID
 * §4, §5): the leaf is not a CA, carries exactly one URI SAN that is a SPIFFE ID in `trustDomain`, and every link up to a
 * pinned authority is in its validity period and signed by the next. A self-signed leaf, or a chain that ends at any
 * root that is not pinned, is refused. The caller must take the chain from a TLS session that proved key possession.
 */
export function verifyX509Svid(chainPem: string, authoritiesPem: readonly string[], trustDomain: string, nowMs: number): X509SvidResult {
  const refuse = (reason: string): X509SvidResult => ({ ok: false, reason });
  let chain: X509Certificate[], anchors: X509Certificate[];
  try {
    chain = parseCertificates(chainPem);
    anchors = authoritiesPem.flatMap((pem) => parseCertificates(pem));
  } catch {
    return refuse("x509-svid: a certificate does not parse");
  }
  const leaf = chain[0];
  if (leaf === undefined) return refuse("x509-svid: no certificate presented");
  if (anchors.length === 0) return refuse(`x509-svid: no pinned X.509 authority for trust domain ${trustDomain}`);
  if (leaf.ca) return refuse("x509-svid: the leaf is a CA certificate");
  const sans = uriSans(leaf);
  const spiffeId = sans.length === 1 ? parseSpiffeId(sans[0]!) : null;
  if (spiffeId === null) return refuse("x509-svid: the leaf must carry exactly one URI SAN that is a SPIFFE ID");
  if (spiffeId.trustDomain !== trustDomain) return refuse(`x509-svid: ${spiffeId.id} is not in trust domain ${trustDomain}`);
  let current = leaf;
  for (let index = 0; index < chain.length; index += 1) {
    if (!validAt(current, nowMs)) return refuse("x509-svid: a certificate in the chain is outside its validity period");
    const anchor = anchors.find((candidate) => validAt(candidate, nowMs) && issuedBy(current, candidate));
    if (anchor !== undefined) return { ok: true, spiffeId, notAfter: Date.parse(leaf.validTo), leafFingerprint256: leaf.fingerprint256 };
    const next = chain[index + 1];
    if (next === undefined || !next.ca || !issuedBy(current, next)) return refuse("x509-svid: the chain does not reach a pinned authority");
    current = next;
  }
  return refuse("x509-svid: the chain does not reach a pinned authority");
}
