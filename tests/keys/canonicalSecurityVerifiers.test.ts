import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { mintReceipt, verifyReceipt } from "../../src/receipts/receipt.js";
import { createWorkOrder } from "../../src/workorders/workorderEngine.js";
import { issueExecTicket, verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { signOverrideDigest, verifyOverrideDigest } from "../../src/governor/overrideSignature.js";
import { initWorkspace } from "../../src/workspace.js";
import { addPublicKeyToHistory, getPublicKeyHistory } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory, getSigningKey } from "../../src/keys/signingKeys.js";
import { boundKeyset, commitKeyset } from "../../src/keys/keyset.js";
import { buildKeyHistoryEntry } from "../../src/crypto/keyHistoryChain.js";
import { sealKeyHistory, type KeyHistoryEnvelope } from "../../src/crypto/keyHistoryEnvelope.js";
import { keyHistoryMarkKey, recordHighWater } from "../../src/keys/highWater.js";
import { logHistoryRevisions } from "../../src/keys/anchors.js";
import { lowS } from "../../src/keys/algorithmPolicy.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "canonical-security-fixture-passphrase");
  const root = mkdtempSync(join(tmpdir(), "amc-canonical-security-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); return root;
}
const pemOf = (key: KeyObject) => key.export({ format: "pem", type: "spki" }).toString();
const signEc = (bytes: Buffer, key: KeyObject) => lowS(sign("sha256", bytes, { key, dsaEncoding: "ieee-p1363" }));
function highS(signature: Buffer): Buffer {
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((order - s).toString(16).padStart(64, "0"), "hex")]);
}
/**
 * The fixture owner admits a historical P-256 public key with the real history envelope and key-set commit APIs.
 * The current issuer stays the existing Ed25519 config-signature key. No mocks, malformed state, SDK or new seam.
 */
function admitConfigHistory(ws: string, publicKeyPem: string): void {
  const path = join(ws, ".amc", "keys", "config-signature_history.json");
  const prior = JSON.parse(readFileSync(path, "utf8")) as KeyHistoryEnvelope;
  const entries = [...prior.entries, buildKeyHistoryEntry(publicKeyPem, prior.entries, "imported")];
  const envelope = sealKeyHistory("config-signature", entries, getSigningKey(ws, "config-signature"), prior.revision + 1);
  const keyset = boundKeyset(ws)!;
  commitKeyset(ws, { keys: keyset.keys, writes: [{ path, bytes: JSON.stringify(envelope, null, 2), mode: 0o600 }] });
  recordHighWater(keyHistoryMarkKey(ws, "config-signature"), envelope.revision, sha256Hex(canonicalize(envelope)));
  logHistoryRevisions(ws, [{ subject: "config-signature", envelope }]);
  // A broken history fixture must fail here, not pretend to witness the verifier's algorithm behavior.
  expect(getPurposeKeyHistory(ws, "config-signature")).toContain(publicKeyPem);
}

describe("remaining purpose consumers use canonical algorithms and exact purpose admission", () => {
  test("receipt verifies the original bytes under canonical P-256; DER, high S, unsupported curve and altered bytes refuse", () => {
    const initial = generateKeyPairSync("ed25519");
    // Same real v1 fixture as tests/receipts.test.ts; preserve its actual serialized payload bytes.
    const minted = mintReceipt({ kind: "guard_check", ts: 1, agentId: "fixture", providerId: "local", model: null,
      eventHash: "e1", bodySha256: "b1", sessionId: "s1", privateKeyPem: initial.privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
    expect(verifyReceipt(minted.receipt, [pemOf(initial.publicKey)]).ok).toBe(true);
    const [payload] = minted.receipt.split(".");
    const bytes = Buffer.from(payload!, "base64url"), keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    const signature = signEc(bytes, keys.privateKey);
    const receipt = (sig: Buffer, body = payload!) => `${body}.${sig.toString("base64url")}`;
    expect(verifyReceipt(receipt(signature), [pem]).ok).toBe(true);
    expect(verifyReceipt(receipt(signature), ["malformed public key", pem]).ok).toBe(true);
    expect(verifyReceipt(receipt(signature), [pemOf(initial.publicKey)]).ok).toBe(false);
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey)]) expect(verifyReceipt(receipt(bad), [pem]).ok).toBe(false);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    expect(verifyReceipt(receipt(sign("sha256", bytes, p384.privateKey)), [pemOf(p384.publicKey)]).ok).toBe(false);
    const altered = Buffer.from(JSON.stringify({ ...JSON.parse(bytes.toString()), agentId: "tampered" })).toString("base64url");
    expect(verifyReceipt(receipt(signature, altered), [pem]).ok).toBe(false);
  });

  test("exec ticket admits a config-signature P-256 history key and preserves scope, expiry and work-order checks", () => {
    const ws = workspace();
    // Same signed public createWorkOrder + issueExecTicket flow as tests/governorToolhubWorkorders.test.ts.
    const { workOrder } = createWorkOrder({ workspace: ws, agentId: "default", title: "fixture", description: "canonical ticket",
      riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["READ_ONLY"] });
    const issued = issueExecTicket({ workspace: ws, agentId: "default", workOrderId: workOrder.workOrderId,
      actionClass: "READ_ONLY", toolName: "fs.read", ttlMs: 60_000 });
    expect(verifyExecTicket({ workspace: ws, ticket: issued.ticket }).ok).toBe(true);
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    admitConfigHistory(ws, pem);
    const [payload] = issued.ticket.split("."), bytes = Buffer.from(payload!, "base64url"), signature = signEc(bytes, keys.privateKey);
    const ticket = (sig: Buffer, body = payload!) => `${body}.${sig.toString("base64url")}`;
    expect(verifyExecTicket({ workspace: ws, ticket: ticket(signature), expectedAgentId: "default",
      expectedWorkOrderId: workOrder.workOrderId, expectedActionClass: "READ_ONLY", expectedToolName: "fs.read" }).ok).toBe(true);
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey)]) expect(verifyExecTicket({ workspace: ws, ticket: ticket(bad) }).ok).toBe(false);
    expect(verifyExecTicket({ workspace: ws, ticket: ticket(signature), expectedAgentId: "other" }).error).toBe("agent mismatch");
    expect(verifyExecTicket({ workspace: ws, ticket: ticket(signature), expectedToolName: "fs.write" }).error).toBe("tool name mismatch");
    const expired = Buffer.from(canonicalize({ ...issued.payload, issuedTs: 1, expiresTs: 2 }));
    expect(verifyExecTicket({ workspace: ws, ticket: ticket(signEc(expired, keys.privateKey), expired.toString("base64url")) }).error).toBe("ticket expired");
    const wrongOrder = Buffer.from(canonicalize({ ...issued.payload, workOrderSha256: "a".repeat(64) }));
    expect(verifyExecTicket({ workspace: ws, ticket: ticket(signEc(wrongOrder, keys.privateKey), wrongOrder.toString("base64url")) }).error).toBe("work order digest mismatch");
    const sibling = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), siblingPem = pemOf(sibling.publicKey);
    addPublicKeyToHistory(ws, "auditor", siblingPem, "imported");
    expect(getPublicKeyHistory(ws, "auditor")).toContain(siblingPem);
    expect(getPurposeKeyHistory(ws, "config-signature")).not.toContain(siblingPem);
    expect(verifyExecTicket({ workspace: ws, ticket: ticket(signEc(bytes, sibling.privateKey)) }).ok).toBe(false);
  });

  test("override admits a config-signature P-256 history key and preserves the domain tag and exact-purpose boundary", () => {
    const ws = workspace(), digest = "01".repeat(32);
    expect(verifyOverrideDigest(ws, digest, signOverrideDigest(ws, digest))).toEqual({ valid: true });
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    admitConfigHistory(ws, pem);
    const bytes = Buffer.concat([Buffer.from("AMC_BREAK_GLASS_OVERRIDE_V1", "ascii"), Buffer.from([0]), Buffer.from(digest, "hex")]);
    const signature = signEc(bytes, keys.privateKey);
    expect(verifyOverrideDigest(ws, digest, signature.toString("base64"))).toEqual({ valid: true });
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey), signEc(Buffer.from(digest, "hex"), keys.privateKey)]) {
      expect(verifyOverrideDigest(ws, digest, bad.toString("base64"))).toMatchObject({ valid: false, code: "SIGNATURE_INVALID" });
    }
    expect(verifyOverrideDigest(ws, "02".repeat(32), signature.toString("base64"))).toMatchObject({ valid: false, code: "SIGNATURE_INVALID" });
    const sibling = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), siblingPem = pemOf(sibling.publicKey);
    addPublicKeyToHistory(ws, "auditor", siblingPem, "imported");
    expect(getPublicKeyHistory(ws, "auditor")).toContain(siblingPem);
    expect(getPurposeKeyHistory(ws, "config-signature")).not.toContain(siblingPem);
    expect(verifyOverrideDigest(ws, digest, signEc(bytes, sibling.privateKey).toString("base64"))).toMatchObject({ valid: false, code: "SIGNATURE_INVALID" });
  });
});
