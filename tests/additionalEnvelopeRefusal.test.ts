import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ensureSigningKeys, getPublicKeyHistory, verifyHexDigestAny } from "../src/crypto/keys.js";
import { initOpsPolicy, opsPolicyPath, opsPolicySigPath } from "../src/ops/policy.js";
import { initBlobKey } from "../src/storage/blobs/blobKeys.js";
import { encryptSpillBytes } from "../src/session/spill/spillEncryption.js";
import { formatSpillLocator } from "../src/session/spill/spillTypes.js";
import { buildAdapterCapabilityReceipt, trustedAdapterCapabilityReceiptKeys, verifyAdapterCapabilityReceipt } from "../src/passport/adapterCapabilityReceipt.js";
import { listBuiltInAdapters } from "../src/adapters/registry.js";
import { lockVault } from "../src/vault/vault.js";
import { sha256Hex } from "../src/utils/hash.js";
const roots: string[] = [];
const fresh = () => { const workspace = mkdtempSync(join(tmpdir(), "amc-extra-envelope-")); roots.push(workspace); ensureSigningKeys(workspace); return workspace; };
afterEach(() => { for (const workspace of roots.splice(0)) { lockVault(workspace); rmSync(workspace, { recursive: true, force: true }); } });

it("spill's actual encryption API cannot rescue an invalid present ops-policy envelope with its valid raw signature", () => {
  const workspace = fresh(); initOpsPolicy(workspace); initBlobKey(workspace);
  const sigPath = opsPolicySigPath(workspace);
  const good = JSON.parse(readFileSync(sigPath, "utf8"));
  const digest = sha256Hex(readFileSync(opsPolicyPath(workspace)));
  expect(verifyHexDigestAny(digest, good.signature, getPublicKeyHistory(workspace, "auditor"))).toBe(true);
  const locator = formatSpillLocator({ version: 2, sessionHash: "a".repeat(64), objectName: `${"b".repeat(32)}-synthetic` });
  const encrypt = () => encryptSpillBytes(workspace, locator, Buffer.from("synthetic spill payload"));
  expect(encrypt().keyVersion).toBe(1);
  for (const envelope of [{ ...good.envelope, fingerprint: "0".repeat(64) }, null, false]) {
    writeFileSync(sigPath, JSON.stringify({ ...good, envelope }));
    expect(encrypt).toThrow("spill operations policy signature verification failed");
  }
  const { envelope: _absent, ...legacy } = good; writeFileSync(sigPath, JSON.stringify(legacy));
  expect(encrypt().keyVersion).toBe(1); // Exact same valid policy/raw signature, absent-envelope compatibility only.
});

it("adapter capability's workspace and explicit-key public routes bind the duplicate outer signature to the envelope", () => {
  const workspace = fresh(); const definition = listBuiltInAdapters().find(row => row.id === "generic-cli")!;
  const receipt = buildAdapterCapabilityReceipt({ workspace, agentId: "synthetic-agent", definition, source: "builtin",
    issuedAt: "2026-07-11T06:00:00.000Z", inspection: { runtime: { status: "detected", command: "sh", version: "3.2.57" },
      configuration: { status: "signed_selected" }, hook: { status: "not_applicable", provider: null, mode: null } } });
  const trustedPublicKeys = trustedAdapterCapabilityReceiptKeys(workspace);
  expect(verifyAdapterCapabilityReceipt(receipt, { workspace }).valid).toBe(true);
  expect(verifyAdapterCapabilityReceipt(receipt, { trustedPublicKeys }).valid).toBe(true);
  const mismatched = { ...receipt, signature: { ...receipt.signature, signature: Buffer.alloc(64, 1).toString("base64") } };
  expect(verifyAdapterCapabilityReceipt(mismatched, { workspace }).valid).toBe(false);
  expect(verifyAdapterCapabilityReceipt(mismatched, { trustedPublicKeys }).valid).toBe(false);
  const { envelope: _absent, ...legacy } = receipt.signature;
  expect(verifyAdapterCapabilityReceipt({ ...receipt, signature: legacy }, { trustedPublicKeys }).valid).toBe(true);
});
