import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { signAmcConfig, verifyAmcConfigSignature } from "../../src/config/amcConfigSignature.js";
import { getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-config-purpose-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); return root;
}

describe("AMC config signatures admit only their exact purpose", () => {
  it("retains default Ed25519 signed-file bytes and the public positive", () => {
    const root = workspace(), path = join(root, ".amc", "amc.config.yaml");
    const sigPath = signAmcConfig(root), signed = JSON.parse(readFileSync(sigPath, "utf8"));
    const digest = sha256Hex(readFileSync(path));
    const signature = signHexDigest(digest, getSigningKey(root, "config-signature"));
    expect(readFileSync(sigPath, "utf8")).toBe(JSON.stringify({ configSha256: digest, signature, signedTs: signed.signedTs, signer: "auditor" }, null, 2));
    expect(verifyAmcConfigSignature(root)).toEqual({ valid: true, signatureExists: true, reason: null });
  });

  it("rejects a real artifact-key signature after owner purpose splits, even though the broad auditor history admits it", () => {
    const root = workspace();
    rotatePurposeKeys({ workspace: root, purposes: ["config-signature"], passphrase: PASS });
    rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal"], passphrase: PASS });
    const sigPath = signAmcConfig(root);
    expect(verifyAmcConfigSignature(root).valid).toBe(true);
    const artifact = getSigningPublicKeyPem(root, "artifact-seal");
    expect(getPublicKeyHistory(root, "auditor")).toContain(artifact);
    expect(getPurposeKeyHistory(root, "config-signature")).not.toContain(artifact);
    const signed = JSON.parse(readFileSync(sigPath, "utf8"));
    signed.signature = signHexDigest(signed.configSha256, getSigningKey(root, "artifact-seal"));
    expect(verifyHexDigestAny(signed.configSha256, signed.signature, getPublicKeyHistory(root, "auditor"))).toBe(true);
    writeFileSync(sigPath, JSON.stringify(signed, null, 2));
    expect(verifyAmcConfigSignature(root)).toEqual({ valid: false, signatureExists: true, reason: "signature invalid" });
  });
});

