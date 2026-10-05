import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signGateReceipt, verifyGateReceipt } from "../scripts/lib/releaseGateReceipt.mjs";

function keys() {
  const pair = generateKeyPairSync("ed25519");
  return { privateKey: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: pair.publicKey.export({ format: "pem", type: "spki" }).toString() };
}
const receipt = { receiptType: "release-gate", status: "passed", steps: [{ id: "build", status: "passed", needs: [], after: [], allowFailure: false }] };

describe("release gate receipt authentication", () => {
  it("signs and verifies using an externally supplied trust root", async () => {
    const pair = keys();
    const auth = await signGateReceipt(receipt, pair.privateKey, pair.publicKey);
    expect(await verifyGateReceipt(receipt, auth, pair.publicKey)).toBe(true);
    expect(auth).not.toHaveProperty("publicKey");
  });
  it("rejects tampered outcomes, dependencies and signature bytes", async () => {
    const pair = keys();
    const auth = await signGateReceipt(receipt, pair.privateKey, pair.publicKey);
    expect(await verifyGateReceipt({ ...receipt, status: "failed" }, auth, pair.publicKey)).toBe(false);
    expect(await verifyGateReceipt({ ...receipt, steps: [{ ...receipt.steps[0], needs: ["unexecuted"] }] }, auth, pair.publicKey)).toBe(false);
    expect(await verifyGateReceipt(receipt, { ...auth, signature: "invalid" }, pair.publicKey)).toBe(false);
  });
  it("refuses a mismatched signing identity and an unrelated verifier key", async () => {
    const pair = keys();
    const unrelated = keys();
    await expect(signGateReceipt(receipt, pair.privateKey, unrelated.publicKey)).rejects.toThrow(/does not match/);
    const auth = await signGateReceipt(receipt, pair.privateKey, pair.publicKey);
    expect(await verifyGateReceipt(receipt, auth, unrelated.publicKey)).toBe(false);
  });
  it("refuses missing or unsupported authentication", async () => {
    const pair = keys();
    expect(await verifyGateReceipt(receipt, null, pair.publicKey)).toBe(false);
    const auth = await signGateReceipt(receipt, pair.privateKey, pair.publicKey);
    expect(await verifyGateReceipt(receipt, { ...auth, algorithm: "unsigned" }, pair.publicKey)).toBe(false);
    expect(await verifyGateReceipt(receipt, { ...auth, v: 2 }, pair.publicKey)).toBe(false);
    expect(await verifyGateReceipt(receipt, { ...auth, publicKeyFingerprint: "incorrect" }, pair.publicKey)).toBe(false);
    expect(await verifyGateReceipt(receipt, { ...auth, payloadSha256: "incorrect" }, pair.publicKey)).toBe(false);
  });
});
