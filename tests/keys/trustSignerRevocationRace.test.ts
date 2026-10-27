import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSigningPublicKeyPem, revokeKey, revokeKeyAsync, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import { initTrustConfig, trustConfigPath, verifyTrustConfigSignature } from "../../src/trust/trustConfig.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

/** One-shot hook run when the trust pair lock is first taken: between the pre-revocation check and the capture. */
const race = vi.hoisted(() => ({ swap: null as null | (() => void) }));
vi.mock("../../src/config/configSignaturePair.js", async importOriginal => {
  const real = await importOriginal<typeof import("../../src/config/configSignaturePair.js")>();
  return { ...real, withConfigSignaturePairLock: <T>(workspace: string, operation: () => T): T => {
    const swap = race.swap; race.swap = null; swap?.();
    return real.withConfigSignaturePairLock(workspace, operation);
  } };
});

const PASS = "amc-test-passphrase";
const roots: string[] = [];
afterEach(() => { race.swap = null; for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });

function rotated() {
  const root = mkdtempSync(join(tmpdir(), "amc-trust-revoke-race-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const oldKeyId = ed25519KeyId(getSigningPublicKeyPem(root, "artifact-seal"))!;
  rotatePurposeKeys({ workspace: root, purposes: ["artifact-seal", "revocation-list", "config-signature"], passphrase: PASS });
  return { root, oldKeyId };
}
const revokers = [
  ["sync", (root: string, keyId: string) => Promise.resolve(revokeKey(root, "artifact-seal", keyId, "superseded"))],
  ["async", (root: string, keyId: string) => revokeKeyAsync(root, "artifact-seal", keyId, "superseded", PASS)]
] as const;

describe("the revocation re-signs only the pair it verified (P0-37 race)", () => {
  it.each(revokers)("trust.yaml tampered after the pre-revocation check is never re-signed (%s)", async (_name, revoke) => {
    const { root, oldKeyId } = rotated();
    const tampered = readFileSync(trustConfigPath(root), "utf8").replace("notaryMaxClockSkewSeconds: 120", "notaryMaxClockSkewSeconds: 99999");
    race.swap = () => writeFileSync(trustConfigPath(root), tampered);
    await expect(revoke(root, oldKeyId)).resolves.toMatchObject({ trustConfig: { status: "refused" } });
    expect(readFileSync(trustConfigPath(root), "utf8")).toBe(tampered);
    expect(verifyTrustConfigSignature(root).valid).toBe(false);
  });

  it.each(revokers)("a pair another key signed by then is left as it is (%s)", async (_name, revoke) => {
    const { root, oldKeyId } = rotated();
    let replaced: Buffer | null = null;
    race.swap = () => { initTrustConfig(root); replaced = readFileSync(`${trustConfigPath(root)}.sig`); };
    await expect(revoke(root, oldKeyId)).resolves.toMatchObject({ trustConfig: { status: "refused", reason: expect.stringMatching(/no longer signs it/) } });
    expect(readFileSync(`${trustConfigPath(root)}.sig`)).toEqual(replaced);
    expect(verifyTrustConfigSignature(root).valid).toBe(true);
  });
});
