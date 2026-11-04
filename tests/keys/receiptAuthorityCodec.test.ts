/** Real issuer/child math, using the actually committed owner certificate; no parser-only crypto admission claim. */
import { sign, verify, type KeyObject } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { getReceiptChildKey } from "../../src/vault/vault.js";
import { RECEIPT_AUTHORITY_CURRENT, parseReceiptAuthority } from "../../src/keys/receiptAuthority.js";
import { verifyReceipt } from "../../src/receipts/receipt.js";
import { parseReceiptTransport } from "../../src/receipts/receiptTransport.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { publicPem } from "./providerFakes.js";
import { cleanupReceiptAuthorityFixtures, makeReceiptAuthorityFixture } from "../helpers/receiptAuthorityFixture.js";
afterEach(() => { vi.restoreAllMocks(); cleanupReceiptAuthorityFixtures(); vi.unstubAllEnvs(); });
const ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
function token(payload: Buffer, certificate: unknown, issuer: string, child: KeyObject) {
  const digest = sha256Hex(canonicalize(certificate)), bytes = Buffer.concat([Buffer.from("AMC_LEDGER_RECEIPT_V1\0", "ascii"), Buffer.from(digest, "hex"), payload]);
  const signature = sign(null, bytes, child), proof = Buffer.from(canonicalize({ version: 1, authority: certificate, issuerPublicKeyPem: issuer }));
  return `amc-receipt-delegated-v1.${payload.toString("base64url")}.${signature.toString("base64url")}.${proof.toString("base64url")}`;
}
test.each(["algorithm", "high-S", "DER", "wrong-operation", "wrong-purpose", "unknown-field"] as const)("a real raw-valid %s certificate cannot be admitted by receipt token transport", async change => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const real = f.evidence(), parsed = parseReceiptTransport(real.receipt), cert = parseReceiptAuthority(f.read(RECEIPT_AUTHORITY_CURRENT));
  let certificate: unknown = cert;
  if (change === "algorithm") certificate = { ...cert, algorithm: "ed25519" };
  if (change === "high-S") {
    const bytes = Buffer.from(cert.signature, "base64"), s = BigInt(`0x${bytes.subarray(32).toString("hex")}`);
    certificate = { ...cert, signature: Buffer.concat([bytes.subarray(0, 32), Buffer.from((ORDER - s).toString(16).padStart(64, "0"), "hex")]).toString("base64") };
  }
  if (change === "DER") certificate = { ...cert, signature: sign("sha256", Buffer.concat([Buffer.from("AMC_RECEIPT_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(cert.authority))]), f.a.privateKey).toString("base64") };
  if (["wrong-operation", "wrong-purpose", "unknown-field"].includes(change)) {
    const authority = { ...cert.authority, ...(change === "wrong-operation" ? { operation: "blob-index" } : change === "wrong-purpose" ? { purpose: "artifact-seal" } : { ignoredAuthority: true }) };
    const signature = await f.provider.sign({ provider: "aws-kms", id: f.id }, Buffer.concat([Buffer.from("AMC_RECEIPT_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(authority))]));
    certificate = { authority, algorithm: cert.algorithm, signature: Buffer.from(signature).toString("base64") };
  }
  const raw = certificate as { authority: unknown; signature: string };
  const rawBytes = Buffer.concat([Buffer.from("AMC_RECEIPT_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(raw.authority))]);
  expect(verify("sha256", rawBytes, { key: publicPem(f.a), dsaEncoding: change === "DER" ? "der" : "ieee-p1363" }, Buffer.from(raw.signature, "base64"))).toBe(true);
  const changed = token(parsed.payloadBytes, certificate, publicPem(f.a), getReceiptChildKey(f.workspace));
  expect(verifyReceipt(real.receipt, [publicPem(f.a)]).ok).toBe(true); expect(verifyReceipt(changed, [publicPem(f.a)]).ok).toBe(false);
});
test("canonical issuer PEM identity accepts CRLF candidates but proof locator and child alone never self-pin", async () => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const receipt = f.evidence().receipt, parsed = parseReceiptTransport(receipt);
  expect(verifyReceipt(receipt, [publicPem(f.a).replace(/\n/g, "\r\n")]).ok).toBe(true);
  expect(verifyReceipt(receipt, [])).toMatchObject({ ok: false }); expect(verifyReceipt(receipt, [parsed.signed.authority.childPublicKeyPem]).ok).toBe(false);
});
test.each(["strip-proof", "extra-segment", "noncanonical", "payload-byte"] as const)("actual tagged token %s refuses and never retries a legacy signature path", async change => {
  const f = makeReceiptAuthorityFixture(); await f.own(); const receipt = f.evidence().receipt, parts = receipt.split(".");
  const mutated = change === "strip-proof" ? parts.slice(0, 3).join(".") : change === "extra-segment" ? receipt + ".AA"
    : change === "noncanonical" ? [parts[0], parts[1] + "=", parts[2], parts[3]].join(".")
    : [parts[0], Buffer.from(Buffer.from(parts[1]!, "base64url").toString("utf8").replace('"default"', '"another"')).toString("base64url"), parts[2], parts[3]].join(".");
  expect(verifyReceipt(mutated, [publicPem(f.a)]).ok).toBe(false); expect(verifyReceipt(receipt, [publicPem(f.a)]).ok).toBe(true);
});
