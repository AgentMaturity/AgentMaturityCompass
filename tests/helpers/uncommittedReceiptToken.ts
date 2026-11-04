/** Deliberately uncommitted but genuinely signed test certificate. This never publishes a provider generation. */
import { createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { parseReceipt } from "../../src/receipts/receipt.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { ReceiptAuthority, SignedReceiptAuthority } from "../../src/keys/receiptAuthority.js";
export function uncommittedReceiptToken(legacyToken: string, issuerPrivatePem: string, workspaceId: string) {
  const parsed = parseReceipt(legacyToken), payloadBytes = Buffer.from(parsed.payloadB64, "base64url");
  const issuer = createPublicKey(issuerPrivatePem).export({ format: "pem", type: "spki" }).toString(), child = generateKeyPairSync("ed25519");
  const childPem = child.publicKey.export({ format: "pem", type: "spki" }).toString();
  const authority: ReceiptAuthority = { type: "amc.receipt-authority", version: 1, workspaceId, purpose: "receipt", operation: "ledger-receipt-token",
    epoch: 1, previousAuthoritySha256: null, starts: { "sqlite-evidence": { count: 0, head: "GENESIS" }, "sqlite-outcome": { count: 0, head: "GENESIS_OUTCOME" } },
    issuerKeyId: signingKeyId(issuer)!, childKeyId: signingKeyId(childPem)!, childPublicKeyPem: childPem,
    notBefore: new Date(parsed.payload.ts - 60_000).toISOString(), notAfter: new Date(parsed.payload.ts + 60_000).toISOString() };
  // Independent literal domains/preimages, rather than the production codec's signing helpers.
  const certificateSigningBytes = Buffer.concat([Buffer.from("AMC_RECEIPT_AUTHORITY_V1\0", "ascii"), Buffer.from(canonicalize(authority))]);
  const signed: SignedReceiptAuthority = { authority, algorithm: "ed25519", signature: sign(null, certificateSigningBytes, issuerPrivatePem).toString("base64") };
  const authorityBytes = Buffer.from(canonicalize(signed)), childSigningBytes = Buffer.concat([Buffer.from("AMC_LEDGER_RECEIPT_V1\0", "ascii"), Buffer.from(sha256Hex(authorityBytes), "hex"), payloadBytes]);
  const childSignature = sign(null, childSigningBytes, child.privateKey), proof = Buffer.from(canonicalize({ version: 1, authority: signed, issuerPublicKeyPem: issuer }));
  return { receipt: `amc-receipt-delegated-v1.${payloadBytes.toString("base64url")}.${childSignature.toString("base64url")}.${proof.toString("base64url")}`,
    issuer, childPem, signed, authorityBytes, certificateSigningBytes, childSigningBytes, childSignature };
}
