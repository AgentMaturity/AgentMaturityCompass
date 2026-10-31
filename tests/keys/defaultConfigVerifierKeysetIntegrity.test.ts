import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initToolsConfig, toolsConfigPath, toolsConfigSigPath, verifyToolsConfigSignature } from "../../src/toolhub/toolhubValidators.js";
import { initActionPolicy, actionPolicyPath, actionPolicySigPath, verifyActionPolicySignature } from "../../src/governor/actionPolicyEngine.js";
import { getPublicKeyHistory } from "../../src/crypto/keys.js";
import { getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";

const PASS = "default-config-complete-keyset-passphrase";
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});

test.each([["tools", "corrupt"], ["tools", "missing"], ["action", "corrupt"], ["action", "missing"]] as const)(
  "%s default public verifier refuses a %s pinned legacy auditor alias and restoration keeps the original valid bytes",
  (family, damage) => {
    const root = mkdtempSync(join(tmpdir(), "amc-default-config-keyset-")), workspace = join(root, "workspace");
    roots.push({ root, workspace });
    vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
    initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
    const subject = family === "tools"
      ? { init: initToolsConfig, body: toolsConfigPath, sidecar: toolsConfigSigPath, verify: verifyToolsConfigSignature }
      : { init: initActionPolicy, body: actionPolicyPath, sidecar: actionPolicySigPath, verify: verifyActionPolicySignature };
    subject.init(workspace);
    expect(boundProviderKey(workspace, "config-signature")).toBeNull();
    const alias = join(workspace, ".amc", "keys", "auditor_ed25519.pub"), originalAlias = readFileSync(alias);
    const bytes = readFileSync(subject.body(workspace)), sidecar = readFileSync(subject.sidecar(workspace));
    const signed = JSON.parse(sidecar.toString("utf8")), publicKeyPem = getSigningPublicKeyPem(workspace, "config-signature");
    const rawValid = () => verifyCanonical("ed25519", Buffer.from(sha256Hex(bytes), "hex"), publicKeyPem, Buffer.from(signed.signature, "base64"));
    expect(signed.digestSha256).toBe(sha256Hex(bytes)); expect(rawValid()).toBe(true);
    expect(subject.verify(workspace).valid).toBe(true);
    try {
      if (damage === "missing") unlinkSync(alias);
      else writeFileSync(alias, generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }));
      // The old direct auditor-role read refuses this real pinned-file damage. It must not become authority for another purpose.
      expect(() => getPublicKeyHistory(workspace, "auditor")).toThrow();
      // The unchanged config signature remains mathematically valid: this is committed-file integrity, not bad crypto.
      expect(rawValid()).toBe(true);
      expect(subject.verify(workspace).valid).toBe(false);
      expect(readFileSync(subject.body(workspace))).toEqual(bytes); expect(readFileSync(subject.sidecar(workspace))).toEqual(sidecar);
    } finally { writeFileSync(alias, originalAlias); }
    expect(rawValid()).toBe(true); expect(subject.verify(workspace).valid).toBe(true);
    expect(readFileSync(subject.body(workspace))).toEqual(bytes); expect(readFileSync(subject.sidecar(workspace))).toEqual(sidecar);
  }
);
