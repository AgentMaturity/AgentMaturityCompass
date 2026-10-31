/** Shared real first-owner fixture only; each test file owns its hoisted normal AWS factory mock/dispatcher. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { lockVault } from "../../src/vault/vault.js";
import { getSigningKey } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { keysetPaths } from "../../src/keys/keyset.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { BLOB_AUTHORITY_CURRENT, BLOB_CHILD_FILE } from "../../src/keys/blobIndexAuthority.js";
import { initBlobKey } from "../../src/storage/blobs/blobKeys.js";
import { storeEncryptedBlob } from "../../src/storage/blobs/blobStore.js";
import { withPins } from "../../src/trust/trustContext.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { workspaceKeyTrust } from "./trustContext.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "../keys/providerFakes.js";
export const BLOB_OWNER_PASS = "owned-blob-child-passphrase";
const PASS = BLOB_OWNER_PASS, roots: Array<{ root: string; workspace: string }> = [];
export function cleanupBlobOwnerFixtures(): void { for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } }
export function configureBlobOwner(workspace: string, id: string) {
  const path = join(workspace, ".amc/amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  config.keys = { refs: { "artifact-seal": { provider: "aws-kms", id } } }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(workspace);
}
export function makeBlobOwnerFixture(legacy = 0, splitArtifact = false) {
  const root = mkdtempSync(join(tmpdir(), "amc-blob-child-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initBlobKey(workspace);
  if (splitArtifact) rotatePurposeKeys({ workspace, purposes: ["artifact-seal"], passphrase: PASS });
  for (let index = 0; index < legacy; index++) storeEncryptedBlob(workspace, Buffer.from(`owned legacy ${index}`));
  const legacyPrivateKey = getSigningKey(workspace, "artifact-seal");
  const a = fakeKey("p256"), b = fakeKey("ed25519"), id = AWS_ARN(randomUUID()), nextId = AWS_ARN(randomUUID()), faults: { fail?: string } = {};
  const fake = awsFake({ [id]: a, [nextId]: b }, faults);
  // Independently owned issuer pins captured before any operation certificate/artifact exists. Never pin a carried child.
  const trust = withPins(workspaceKeyTrust(workspace), [a, b].map(key => ({ keyId: signingKeyId(publicPem(key))!, purposes: ["artifact-seal"] as const, origin: "independent owned blob operator" })));
  configureBlobOwner(workspace, id);
  const signatures = () => fake.requests.filter(row => row.operation === "Sign").length;
  const target = (relative: string) => join(workspace, relative), read = (relative: string) => readFileSync(target(relative));
  const ownedState = () => [keysetPaths(workspace).keyset, target(BLOB_AUTHORITY_CURRENT), target(BLOB_CHILD_FILE), target(".amc/keys/artifact-seal-provider.pub")]
    .map(path => existsSync(path) ? sha256Hex(readFileSync(path)) : null);
  return { root, workspace, legacyPrivateKey, a, b, id, nextId, fake, faults, trust, signatures, target, read, ownedState };
}
