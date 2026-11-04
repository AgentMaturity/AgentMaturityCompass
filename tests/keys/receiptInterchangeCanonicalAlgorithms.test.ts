import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { describe, expect, test } from "vitest";
import { buildInteroperableReceipt, interoperableReceiptJsonSchema, parseInteroperableReceipt, serializeInteroperableReceipt,
  verifyInteroperableReceipt, type BuildInteroperableReceiptInput, type InteroperableReceipt, type InteroperableReceiptKind } from "../../src/passport/receiptInterchange.js";
import { lowS } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";

const pemOf = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const privatePem = (key: KeyObject) => key.export({ type: "pkcs8", format: "pem" }).toString();
const fingerprint = (pem: string) => sha256Hex(Buffer.from(pem, "utf8")).slice(0, 16);
const payloadFor = (kind: InteroperableReceiptKind): Record<string, unknown> => ({
  score: { claimId: "claim-1", questionId: "AMC-1.1", score: 4.2, level: "L4" },
  policy: { policyId: "policy-1", decision: "allow" }, tool: { toolId: "fixture-tool", callId: "call-1" },
  audit: { auditId: "audit-1", severity: "LOW" }, lifecycle: { lifecycleId: "lifecycle-1", stage: "release.gate" }
}[kind]);
function input(kind: InteroperableReceiptKind, publicKeyPem: string, privateKeyPem: string): BuildInteroperableReceiptInput {
  return { kind, receiptId: `receipt-${kind}-fixture`, issuedAt: "2026-10-20T10:00:00.000Z",
    // Existing v1 callers supply issuer provenance that need not equal the actual signer fingerprint.
    issuer: { platform: "amc", workspaceId: "fixture-workspace", keyFingerprint: "issuer-provenance-legacy-value" },
    subject: { agentId: "fixture-agent", passportId: "pass-fixture" },
    eventRef: { eventId: `event-${kind}`, eventHash: "a".repeat(64), sourceReceiptRef: "ledger-receipt-fixture" },
    payload: payloadFor(kind), evidenceRefs: ["ledger-evidence-fixture"],
    sourceCitations: [{ sourceId: "fixture", title: "Local fixture", url: "https://example.invalid/fixture", retrievedAt: "2026-10-20T09:00:00.000Z" }],
    publicKeyPem, privateKeyPem };
}
function body(receipt: InteroperableReceipt): Buffer {
  const { signature: _signature, ...withoutSignature } = receipt;
  return Buffer.from(canonicalize(withoutSignature), "utf8");
}
function patchSignature(receipt: InteroperableReceipt, patch: Record<string, unknown>): InteroperableReceipt {
  return parseInteroperableReceipt(JSON.stringify({ ...receipt, signature: { ...receipt.signature, ...patch } }));
}
function highS(signature: Buffer): Buffer {
  const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((n - BigInt(`0x${signature.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]);
}

describe("receipt interchange v1 canonical signing algorithms and actual signer binding", () => {
  test.each(["score", "policy", "tool", "audit", "lifecycle"] as const)("%s producer and public JSON round trip admit real canonical P-256 signatures", (kind) => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    const receipt = buildInteroperableReceipt(input(kind, pem, privatePem(keys.privateKey)));
    expect(receipt.signature.algorithm).toBe("ecdsa-p256-sha256");
    expect(receipt.signature.publicKeyFingerprint).toBe(fingerprint(pem));
    expect(receipt.issuer.keyFingerprint).toBe("issuer-provenance-legacy-value");
    const bytes = body(receipt), signature = Buffer.from(receipt.signature.value, "base64");
    expect(signature.length).toBe(64);
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
    const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
    expect(s <= BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551") / 2n).toBe(true);
    const parsed = parseInteroperableReceipt(serializeInteroperableReceipt(receipt));
    expect(parsed).toEqual(receipt);
    expect(verifyInteroperableReceipt(parsed, ["malformed key", pem])).toEqual({ valid: true, reasons: [] });
    expect(interoperableReceiptJsonSchema.properties.signature.properties.algorithm).toEqual({ enum: ["ed25519", "ecdsa-p256-sha256"] });
  });

  test("an unchanged cryptographically valid signature cannot name another signer fingerprint", () => {
    const keys = generateKeyPairSync("ed25519"), pem = pemOf(keys.publicKey);
    const receipt = buildInteroperableReceipt(input("tool", pem, privatePem(keys.privateKey)));
    expect(verify(null, body(receipt), keys.publicKey, Buffer.from(receipt.signature.value, "base64"))).toBe(true);
    const wrongFingerprint = patchSignature(receipt, { publicKeyFingerprint: "0".repeat(16) });
    // Signature headers are outside the signed body, so this mutation remains mathematically valid.
    expect(body(wrongFingerprint).equals(body(receipt))).toBe(true);
    expect(verify(null, body(wrongFingerprint), keys.publicKey, Buffer.from(wrongFingerprint.signature.value, "base64"))).toBe(true);
    expect(verifyInteroperableReceipt(wrongFingerprint, [pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
    const other = generateKeyPairSync("ed25519");
    expect(verifyInteroperableReceipt(patchSignature(receipt, { publicKeyFingerprint: fingerprint(pemOf(other.publicKey)) }), [pem, pemOf(other.publicKey)]).valid).toBe(false);
  });

  test("declared algorithm, canonical encoding, key algorithm and exact signed body must all agree", () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    // Use an existing Ed25519 producer's real artifact as the external signing payload. This fixture needs no new producer API.
    const ed = generateKeyPairSync("ed25519"), legacy = buildInteroperableReceipt(input("audit", pemOf(ed.publicKey), privatePem(ed.privateKey)));
    const bytes = body(legacy), canonical = lowS(sign("sha256", bytes, { key: keys.privateKey, dsaEncoding: "ieee-p1363" }));
    const external = patchSignature(legacy, { algorithm: "ecdsa-p256-sha256", publicKeyFingerprint: fingerprint(pem), value: canonical.toString("base64") });
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, canonical)).toBe(true);
    expect(verifyInteroperableReceipt(external, [pem])).toEqual({ valid: true, reasons: [] });
    expect(verifyInteroperableReceipt(patchSignature(external, { algorithm: "ed25519" }), [pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
    for (const algorithm of ["rsa-sha256", "ecdsa-p384-sha384", "unknown"]) {
      expect(verifyInteroperableReceipt(patchSignature(external, { algorithm }), [pem])).toEqual({ valid: false, reasons: ["signature.algorithm:unsupported"] });
    }
    const high = highS(canonical), der = sign("sha256", bytes, keys.privateKey);
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
    expect(verify("sha256", bytes, keys.publicKey, der)).toBe(true);
    for (const value of [high, der]) {
      expect(verifyInteroperableReceipt(patchSignature(external, { value: value.toString("base64") }), [pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
    }
    // Old verify(null, ..., EC-key, DER) can admit this mislabeled Ed25519 artifact. Declared label and canonical encoding must both refuse it.
    expect(verifyInteroperableReceipt(patchSignature(external, { algorithm: "ed25519", value: der.toString("base64") }), [pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }), p384Pem = pemOf(p384.publicKey);
    const unsupported = patchSignature(external, { publicKeyFingerprint: fingerprint(p384Pem), value: sign("sha256", bytes, { key: p384.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64") });
    expect(verifyInteroperableReceipt(unsupported, [p384Pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
    expect(verifyInteroperableReceipt({ ...external, receiptId: "changed-after-signing" }, [pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
    expect(verifyInteroperableReceipt(external, [pemOf(ed.publicKey)]).valid).toBe(false);
  });

  test("private/public mismatch and unsupported public algorithms refuse before emitting a receipt", () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    expect(() => buildInteroperableReceipt(input("tool", pemOf(keys.publicKey), privatePem(other.privateKey)))).toThrow(/does not match its public key/);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    expect(() => buildInteroperableReceipt(input("tool", pemOf(p384.publicKey), privatePem(p384.privateKey)))).toThrow(/unsupported algorithm/);
  });

  test("default Ed25519 signing bytes, short raw-PEM fingerprint, JSON property layout and issuer provenance remain byte compatible", () => {
    const keys = generateKeyPairSync("ed25519"), pem = pemOf(keys.publicKey), supplied = input("tool", pem, privatePem(keys.privateKey));
    const receipt = buildInteroperableReceipt(supplied);
    // Independent legacy v1 layout: preserve signed body and signature header fields without canonicalizing caller provenance.
    const withoutSignature = { schemaVersion: "amc.receipt.interchange.v1", receiptId: supplied.receiptId, kind: supplied.kind, issuedAt: supplied.issuedAt,
      issuer: supplied.issuer, subject: supplied.subject, eventRef: supplied.eventRef, payload: supplied.payload,
      payloadHash: sha256Hex(Buffer.from(canonicalize(supplied.payload), "utf8")), evidenceRefs: supplied.evidenceRefs, sourceCitations: supplied.sourceCitations };
    const expected = { ...withoutSignature, signature: { algorithm: "ed25519", publicKeyFingerprint: fingerprint(pem),
      value: sign(null, Buffer.from(canonicalize(withoutSignature), "utf8"), keys.privateKey).toString("base64") } };
    expect(serializeInteroperableReceipt(receipt)).toBe(JSON.stringify(expected, null, 2));
    expect(verifyInteroperableReceipt(receipt, [pem])).toEqual({ valid: true, reasons: [] });
    // A CRLF PEM was historically fingerprinted as supplied; the same exact spelling remains a valid v1 candidate.
    const crlf = pem.replace(/\n/g, "\r\n"), crlfReceipt = buildInteroperableReceipt(input("tool", crlf, privatePem(keys.privateKey)));
    expect(crlfReceipt.signature.publicKeyFingerprint).toBe(fingerprint(crlf));
    expect(verifyInteroperableReceipt(crlfReceipt, [crlf])).toEqual({ valid: true, reasons: [] });
    expect(verifyInteroperableReceipt(crlfReceipt, [pem])).toEqual({ valid: false, reasons: ["signature:invalid"] });
  });
});
