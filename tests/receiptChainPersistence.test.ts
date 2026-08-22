import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mintChainedReceipt,
  verifyDelegationChain,
  getStoredReceipt,
  countStoredReceipts,
  resetReceiptChainStore
} from "../src/receipts/receiptChain.js";

/**
 * The chain store was a process-local Map, and nothing outside the module ever
 * populated it. Both consumers — `amc receipts-chain` and the /crypto chain
 * route — run in processes that mint nothing, so every lookup missed and
 * verification could only report "not found". The command failed closed, but it
 * could not succeed for any input at all.
 */
describe("delegation chains survive the process that minted them", () => {
  let workspace: string;
  let privateKeyPem: string;
  let publicKeyPem: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-chain-"));
    const pair = generateKeyPairSync("ed25519");
    privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  });
  afterEach(() => {
    resetReceiptChainStore();
    rmSync(workspace, { recursive: true, force: true });
  });

  const mint = (receiptId: string, parentReceiptId: string | null) =>
    mintChainedReceipt({
      kind: "TOOL_CALL",
      ts: 1_700_000_000_000,
      agentId: "agent-a",
      providerId: "provider-a",
      model: null,
      eventHash: "a".repeat(64),
      bodySha256: "b".repeat(64),
      sessionId: "session-1",
      privateKeyPem,
      receiptId,
      parentReceiptId,
      workspace
    });

  it("verifies a chain minted by an earlier process", () => {
    mint("root-1", null);
    mint("child-1", "root-1");

    // Everything the minting process held is gone; only the workspace remains.
    resetReceiptChainStore();

    const result = verifyDelegationChain("child-1", [publicKeyPem], workspace);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.chainLength).toBe(2);
    expect(result.rootReceiptId).toBe("root-1");
  });

  it("still reports a missing receipt rather than an empty valid chain", () => {
    resetReceiptChainStore();
    const result = verifyDelegationChain("absent", [publicKeyPem], workspace);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("not found");
  });

  it("treats a tampered stored receipt as unverified", () => {
    const minted = mint("root-2", null);
    resetReceiptChainStore();

    // Flip a byte in the signed payload. The payload is decoded from the signed
    // bytes, so a rewritten file cannot present a chain it did not sign for.
    const [payloadB64, sigB64] = minted.receipt.split(".");
    const bytes = Buffer.from(payloadB64!, "base64url");
    const swapped = bytes.toString("utf8").replace('"agent-a"', '"agent-b"');
    const forged = `${Buffer.from(swapped, "utf8").toString("base64url")}.${sigB64}`;
    const file = readdirSync(join(workspace, ".amc", "receipts", "chain"))[0]!;
    writeFileSync(join(workspace, ".amc", "receipts", "chain", file), forged);

    const result = verifyDelegationChain("root-2", [publicKeyPem], workspace);
    expect(result.valid, "a rewritten receipt must not verify").toBe(false);
    // Specifically a signature failure — not a parse error, which would pass
    // this test for the wrong reason.
    expect(result.errors.join(" ").toLowerCase()).toContain("signature");
  });

  it("distinguishes an empty store from a missing receipt", () => {
    // "not found in store" reads as a mistyped id. In a workspace that has
    // never recorded a chained receipt the truthful answer is different, and
    // the CLI says so only because it can tell the two apart.
    expect(countStoredReceipts(workspace)).toBe(0);
    mint("root-3", null);
    expect(countStoredReceipts(workspace)).toBe(1);
  });

  it("does not persist when no workspace is given", () => {
    // Callers without a workspace keep the previous in-process behaviour.
    mintChainedReceipt({
      kind: "TOOL_CALL",
      ts: 1_700_000_000_000,
      agentId: "agent-a",
      providerId: "provider-a",
      model: null,
      eventHash: "a".repeat(64),
      bodySha256: "b".repeat(64),
      sessionId: "session-1",
      privateKeyPem,
      receiptId: "mem-only"
    });
    expect(getStoredReceipt("mem-only")).not.toBeNull();
    resetReceiptChainStore();
    expect(getStoredReceipt("mem-only", workspace)).toBeNull();
  });
});
