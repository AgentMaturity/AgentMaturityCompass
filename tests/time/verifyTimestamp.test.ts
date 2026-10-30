import { createHash, X509Certificate } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, expect, it } from "vitest";
import { z } from "zod";
import { artifactTime, verifyTimestampToken } from "../../src/time/verifyTimestamp.js";
import type { TimestampAuthority } from "../../src/trust/trustList.js";
import { trustList } from "../trust/trustFixtures.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const hex256 = z.string().regex(/^[0-9a-f]{64}$/);
const certificate = z.object({ pem: z.string(), derSha256: hex256, pemBytes: z.number().int().positive(), pemSha256: hex256 });
const certificatesSchema = z.object({
  schema: z.literal("p125-public-certificates/1"),
  testOnly: z.literal(true),
  certificates: z.object({ root: certificate, intermediate: certificate, valid: certificate,
    missingEku: certificate, noncriticalEku: certificate, expired: certificate, unrelated: certificate })
});
const provenanceSchema = z.object({
  schema: z.literal("p125-offline-signed-fixtures/1"),
  input: z.object({ dataUtf8: z.string(), digestHex: hex256, nonceHex: z.string().regex(/^[0-9a-f]{16}$/),
    genTimeIso: z.iso.datetime(), genTimeDer: z.string().min(1), policyOid: z.string().min(1) }),
  files: z.record(z.string(), z.object({ bytes: z.number().int().positive(), sha256: hex256 })),
  primary: z.object({ tsaCertSha256: hex256, rootCertSha256: hex256, serialNumberHex: z.string().regex(/^(0|[1-9a-f][0-9a-f]*)$/),
    accuracyMs: z.null(), revocationChecked: z.literal(false) }),
  tamperedAttribute: z.object({ originalSha256: hex256, offset: z.number().int().nonnegative(),
    originalByte: z.number().int().min(0).max(255), changedByte: z.number().int().min(0).max(255) })
});

function loadFixture() {
  const directory = realpathSync(fileURLToPath(new URL("../fixtures/rfc3161/", import.meta.url)));
  expect(directory).toBe(join(CHECKOUT, "tests", "fixtures", "rfc3161"));
  const read = (name: string): Buffer => {
    const path = join(directory, name);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`fixture ${name} must be a regular file`);
    return readFileSync(path);
  };
  const provenance = provenanceSchema.parse(JSON.parse(read("provenance.json").toString("utf8")));
  const pinned = (name: string): Buffer => {
    const expected = provenance.files[name];
    if (expected === undefined) throw new Error(`missing independent fixture pin for ${name}`);
    const bytes = read(name);
    expect({ bytes: bytes.length, sha256: sha256(bytes) }).toEqual(expected);
    return bytes;
  };
  const certificates = certificatesSchema.parse(JSON.parse(pinned("public-certificates.json").toString("utf8"))).certificates;
  for (const entry of Object.values(certificates)) {
    const pem = Buffer.from(entry.pem, "utf8");
    expect(entry.pem.startsWith("-----BEGIN CERTIFICATE-----")).toBe(true);
    expect({ bytes: pem.length, sha256: sha256(pem) }).toEqual({ bytes: entry.pemBytes, sha256: entry.pemSha256 });
    expect(sha256(new X509Certificate(pem).raw)).toBe(entry.derSha256);
  }
  expect(sha256(Buffer.from(provenance.input.dataUtf8, "utf8"))).toBe(provenance.input.digestHex);
  expect(provenance.primary.rootCertSha256).toBe(certificates.root.derSha256);
  expect(provenance.primary.tsaCertSha256).toBe(certificates.valid.derSha256);
  pinned("query.der");
  pinned("tstinfo.der");
  const valid = pinned("valid.token.der");
  const response = pinned("valid.response.der");
  const missingEku = pinned("missing-eku.token.der");
  const noncriticalEku = pinned("noncritical-eku.token.der");
  const expired = pinned("expired.token.der");
  const tamperedAttribute = pinned("tampered-attribute.token.der");
  const mutation = provenance.tamperedAttribute;
  expect(sha256(valid)).toBe(mutation.originalSha256);
  expect(mutation.offset).toBeLessThan(valid.length);
  expect(valid[mutation.offset]).toBe(mutation.originalByte);
  expect(mutation.changedByte).not.toBe(mutation.originalByte);
  const derived = Buffer.from(valid);
  derived[mutation.offset] = mutation.changedByte;
  expect(tamperedAttribute).toEqual(derived);
  return { provenance, certificates, valid, response, missingEku, noncriticalEku, expired, tamperedAttribute };
}

let fixture: ReturnType<typeof loadFixture>;
beforeAll(() => { fixture = loadFixture(); });

function anchor(unrelated = false): TimestampAuthority {
  return { anchorId: unrelated ? "p125-unrelated" : "p125-root", name: "locally generated test-only TSA root",
    rootCertificatePem: fixture.certificates[unrelated ? "unrelated" : "root"].pem,
    policyOids: [fixture.provenance.input.policyOid] };
}

function verify(token: Buffer, overrides: Partial<Parameters<typeof verifyTimestampToken>[0]> = {}) {
  return verifyTimestampToken({ token, expectedDigestHex: fixture.provenance.input.digestHex,
    nonceHex: fixture.provenance.input.nonceHex, anchors: [anchor()], ...overrides });
}

function validAttestation(token = fixture.valid) {
  const result = verify(token);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`positive fixture refused: ${result.code}`);
  const { input, primary } = fixture.provenance;
  expect(result.attested).toEqual({
    kind: "rfc3161", tsa: { subject: expect.any(String), certSha256: primary.tsaCertSha256, anchorId: "p125-root" },
    genTime: input.genTimeIso, accuracyMs: primary.accuracyMs, policyOid: input.policyOid,
    serialNumber: primary.serialNumberHex, messageImprint: { hashAlgorithm: "sha256", digest: input.digestHex },
    tokenDerB64: fixture.valid.toString("base64"), revocationChecked: false
  });
  expect(result.attested.tsa.subject.trim().length).toBeGreaterThan(0);
  return result.attested;
}

// The container supplies configured anchors at this seam; it does not claim signed trust-list verification.
function trust(anchors: TimestampAuthority[]) {
  return { lists: [trustList([], { timestampAuthorities: anchors })] };
}

function claimedAt(): string {
  return new Date(Date.parse(fixture.provenance.input.genTimeIso) - 60_000).toISOString();
}

it("verifies the genuine raw CMS timestamp against its digest nonce and pinned test root", () => {
  validAttestation();
});

it("verifies the granted response and returns its exact signed CMS token bytes", () => {
  validAttestation(fixture.response);
});

it("refuses a different expected digest for the unchanged genuine signed token", () => {
  validAttestation();
  const wrong = fixture.provenance.input.digestHex === "00".repeat(32) ? "11".repeat(32) : "00".repeat(32);
  expect(verify(fixture.valid, { expectedDigestHex: wrong })).toMatchObject({ ok: false, code: "TST_IMPRINT_MISMATCH" });
});

it("refuses a different expected nonce for the unchanged genuine signed token", () => {
  validAttestation();
  const wrong = fixture.provenance.input.nonceHex === "0000000000000000" ? "0000000000000001" : "0000000000000000";
  expect(verify(fixture.valid, { nonceHex: wrong })).toMatchObject({ ok: false, code: "TST_NONCE_MISMATCH" });
});

it("refuses the independently located signed-attribute corruption", () => {
  validAttestation();
  expect(verify(fixture.tamperedAttribute)).toMatchObject({ ok: false, code: "TST_SIGNATURE_INVALID" });
});

it("refuses the genuine token under a different real root with the same permitted policy", () => {
  validAttestation();
  expect(verify(fixture.valid, { anchors: [anchor(true)] })).toMatchObject({ ok: false, code: "TST_UNTRUSTED_TSA" });
});

it("refuses a policy excluded by the correctly pinned real root", () => {
  validAttestation();
  const wrongPolicy = fixture.provenance.input.policyOid === "1.2.3.4.999" ? "1.2.3.4.998" : "1.2.3.4.999";
  const result = verify(fixture.valid, { anchors: [{ ...anchor(), policyOids: [wrongPolicy] }] });
  expect(result).toMatchObject({ ok: false, code: "TST_UNTRUSTED_TSA" });
  if (!result.ok) expect(result.detail).toContain("is not pinned for anchor");
});

it("refuses a genuinely signed TSA certificate without an EKU extension", () => {
  expect(verify(fixture.missingEku)).toMatchObject({ ok: false, code: "TST_EKU_MISSING" });
});

it("refuses a genuinely signed TSA certificate with noncritical timestamping EKU", () => {
  expect(verify(fixture.noncriticalEku)).toMatchObject({ ok: false, code: "TST_EKU_MISSING" });
});

it("refuses a genuinely signed TSA certificate expired at the fixed signed genTime", () => {
  expect(verify(fixture.expired)).toMatchObject({ ok: false, code: "TST_CERT_EXPIRED_AT_GENTIME" });
});

it("refuses explicit rejection status before requiring a timestamp token", () => {
  expect(verify(Buffer.from("30053003020102", "hex"))).toMatchObject({ ok: false, code: "TST_STATUS_REJECTED" });
});

it("refuses a truncated copy of the genuine token", () => {
  expect(verify(fixture.valid.subarray(0, fixture.valid.length - 1))).toMatchObject({ ok: false, code: "TST_MALFORMED" });
});

it("refuses 65537 bytes at the token size boundary before DER parsing", () => {
  expect(verify(Buffer.alloc(65_537))).toMatchObject({ ok: false, code: "TST_MALFORMED", detail: "the token exceeds 65536 bytes" });
});

it("keeps claimed time separate from the genuine attested upper bound", () => {
  const attested = validAttestation();
  const claimed = claimedAt();
  const result = artifactTime({ token: fixture.valid, digestHex: fixture.provenance.input.digestHex,
    claimedAt: claimed, trust: trust([anchor()]) });
  expect(result).toEqual({ time: { evidence: { claimedAt: claimed, attested, basis: "attested-upper-bound",
    window: { notBefore: null, notAfter: fixture.provenance.input.genTimeIso } }, findings: [] }, integrityError: null, warning: null });
});

it("keeps an artifact without a timestamp at claimed time", () => {
  const claimed = claimedAt();
  expect(artifactTime({ token: null, digestHex: fixture.provenance.input.digestHex, claimedAt: claimed,
    trust: trust([anchor()]) })).toEqual({ time: { evidence: { claimedAt: claimed, attested: null, basis: "claimed" }, findings: [] },
    integrityError: null, warning: null });
});

it("reports an untrusted TSA as a warning while the artifact time stays claimed", () => {
  validAttestation();
  const claimed = claimedAt();
  const result = artifactTime({ token: fixture.valid, digestHex: fixture.provenance.input.digestHex,
    claimedAt: claimed, trust: trust([anchor(true)]) });
  expect(result.time).toEqual({ evidence: { claimedAt: claimed, attested: null, basis: "claimed" }, findings: [] });
  expect(result.integrityError).toBeNull();
  expect(result.warning).toContain("timestamp TST_UNTRUSTED_TSA:");
  expect(result.warning).toContain("time basis stays claimed");
});

it("reports a broken supplied token as an artifact integrity error", () => {
  const claimed = claimedAt();
  const result = artifactTime({ token: fixture.valid.subarray(0, fixture.valid.length - 1), digestHex: fixture.provenance.input.digestHex,
    claimedAt: claimed, trust: trust([anchor()]) });
  expect(result.time).toEqual({ evidence: { claimedAt: claimed, attested: null, basis: "claimed" }, findings: [] });
  expect(result.warning).toBeNull();
  expect(result.integrityError).toContain("timestamp TST_MALFORMED:");
});
