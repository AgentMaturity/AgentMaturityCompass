import { describe, test, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mintReceipt, parseReceipt, verifyReceipt, monitorPublicKeyFingerprint } from "../src/receipts/receipt.js";
import { mintChainedReceipt, verifyDelegationChain, resetReceiptChainStore } from "../src/receipts/receiptChain.js";

function makeKeyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

describe("receipt minting and verification", () => {
  const keys = makeKeyPair();

  test("mintReceipt produces valid receipt string", () => {
    const result = mintReceipt({
      kind: "llm_request",
      ts: Date.now(),
      agentId: "test-agent",
      providerId: "openai",
      model: "gpt-4",
      eventHash: "abc123",
      bodySha256: "def456",
      sessionId: "sess-1",
      privateKeyPem: keys.privateKey,
    });
    expect(result.receipt).toContain(".");
    expect(result.payload.v).toBe(1);
    expect(result.payload.kind).toBe("llm_request");
    expect(result.payload.agentId).toBe("test-agent");
    expect(result.receiptSha256).toHaveLength(64);
  });

  test("parseReceipt extracts payload from minted receipt", () => {
    const minted = mintReceipt({
      kind: "tool_action",
      ts: 1000,
      agentId: "agent-a",
      providerId: "anthropic",
      model: "claude",
      eventHash: "hash1",
      bodySha256: "hash2",
      sessionId: "sess-2",
      privateKeyPem: keys.privateKey,
    });
    const parsed = parseReceipt(minted.receipt);
    expect(parsed.payload.kind).toBe("tool_action");
    expect(parsed.payload.agentId).toBe("agent-a");
    expect(parsed.payload.ts).toBe(1000);
  });

  test("verifyReceipt succeeds with correct public key", () => {
    const minted = mintReceipt({
      kind: "guard_check",
      ts: Date.now(),
      agentId: "agent-b",
      providerId: "local",
      model: null,
      eventHash: "e1",
      bodySha256: "b1",
      sessionId: "sess-3",
      privateKeyPem: keys.privateKey,
    });
    const result = verifyReceipt(minted.receipt, [keys.publicKey]);
    expect(result.ok).toBe(true);
    expect(result.payload?.agentId).toBe("agent-b");
  });

  test("verifyReceipt fails with wrong public key", () => {
    const otherKeys = makeKeyPair();
    const minted = mintReceipt({
      kind: "llm_response",
      ts: Date.now(),
      agentId: "agent-c",
      providerId: "openai",
      model: "gpt-4",
      eventHash: "e2",
      bodySha256: "b2",
      sessionId: "sess-4",
      privateKeyPem: keys.privateKey,
    });
    const result = verifyReceipt(minted.receipt, [otherKeys.publicKey]);
    expect(result.ok).toBe(false);
  });

  test("verifyReceipt rejects malformed receipt", () => {
    const result = verifyReceipt("not-a-valid-receipt", [keys.publicKey]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("mintReceipt with custom receiptId uses it", () => {
    const result = mintReceipt({
      kind: "tool_result",
      ts: Date.now(),
      agentId: "agent-d",
      providerId: "gemini",
      model: "gemini-pro",
      eventHash: "e3",
      bodySha256: "b3",
      sessionId: "sess-5",
      privateKeyPem: keys.privateKey,
      receiptId: "custom-id-123",
    });
    expect(result.payload.receipt_id).toBe("custom-id-123");
  });

  test("monitorPublicKeyFingerprint returns consistent fingerprint", () => {
    const fp1 = monitorPublicKeyFingerprint(keys.publicKey);
    const fp2 = monitorPublicKeyFingerprint(keys.publicKey);
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBeGreaterThan(8);
  });

  test("different keys produce different fingerprints", () => {
    const otherKeys = makeKeyPair();
    const fp1 = monitorPublicKeyFingerprint(keys.publicKey);
    const fp2 = monitorPublicKeyFingerprint(otherKeys.publicKey);
    expect(fp1).not.toBe(fp2);
  });

  test("all receipt kinds are accepted", () => {
    const kinds = ["llm_request", "llm_response", "tool_action", "tool_result", "guard_check"] as const;
    for (const kind of kinds) {
      const result = mintReceipt({
        kind,
        ts: Date.now(),
        agentId: "multi",
        providerId: "test",
        model: null,
        eventHash: "e",
        bodySha256: "b",
        sessionId: "s",
        privateKeyPem: keys.privateKey,
      });
      expect(result.payload.kind).toBe(kind);
    }
  });
});

describe("chained receipts and delegation", () => {
  const keys = makeKeyPair();
  const delegateKeys = makeKeyPair();

  test("mintChainedReceipt produces receipt with chain metadata", () => {
    resetReceiptChainStore();
    const result = mintChainedReceipt({
      kind: "llm_request",
      ts: Date.now(),
      agentId: "parent-agent",
      providerId: "openai",
      model: "gpt-4",
      eventHash: "chain-e1",
      bodySha256: "chain-b1",
      sessionId: "chain-sess",
      privateKeyPem: keys.privateKey,
      delegatorAgentId: null,
      delegatorReceiptId: null,
    });
    expect(result.receipt).toContain(".");
    expect(result.payload.receipt_id).toBeDefined();
  });

  test("verifyDelegationChain handles empty chain", () => {
    resetReceiptChainStore();
    const result = verifyDelegationChain("nonexistent-receipt", [keys.publicKey]);
    expect(result.valid).toBeDefined();
  });
});
