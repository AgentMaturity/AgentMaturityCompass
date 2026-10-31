import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { checkpointLedger, checkpointsDir, readCheckpointChain, readLegacyCheckpointPrefixForKeyMigration } from "../../src/time/checkpoint.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { assertKeysetComplete, commitKeyset } from "../../src/keys/keyset.js";
import { issueDelegation, encodeDelegation } from "../../src/keys/delegation.js";
import { signChecked } from "../../src/keys/provider.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/purposeKeys.js";
import { DELEGATION_REL } from "../../src/keys/signingKeys.js";
import { canonicalize } from "../../src/utils/json.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { loadTrustContext, withPins } from "../../src/trust/trustContext.js";
import { lockVault, vaultPaths } from "../../src/vault/vault.js";
import { setMode } from "../../src/mode/mode.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const PASS = process.env.AMC_VAULT_PASSPHRASE!;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
type Variant = "expired" | "wrong-issuer" | "wrong-delegate" | "noncanonical" | "overlong" | "high-s";

/** Creates historic candidate wire with real owner commit APIs; does not claim the current bind CLI emits v1. */
async function oldV1(variant: Variant = "expired") {
  const root = mkdtempSync(join(tmpdir(), "amc-owner-v1-checkpoint-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  const ledger = openLedger(root);
  try {
    ledger.startSession({ sessionId: "legacy", runtime: "unknown", binaryPath: "legacy-fixture", binarySha256: "a".repeat(64) });
    ledger.appendEvidence({ sessionId: "legacy", runtime: "unknown", eventType: "audit", meta: {} });
  } finally { ledger.close(); }
  const path = join(root, ".amc", "amc.config.yaml");
  const config = YAML.parse(readFileSync(path, "utf8"));
  config.time = { required: false, tsa: [{ name: "untrusted-fixture", url: "https://tsa.invalid/", anchorIds: ["no-fixture-anchor"] }] };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(root);
  const emptyTrust = loadTrustContext({ amcHome: join(root, "owned-empty-home"), env: {} });
  await checkpointLedger(root, emptyTrust); // real unbound legacy checkpoint wire, pending without network transport
  const checkpoint = readFileSync(join(checkpointsDir(root), "1.json"));
  const local = getSigningPublicKeyPem(root, "ledger-row"), id = AWS_ARN("owned-v1-issuer");
  const key = fakeKey("p256"), other = fakeKey("p256");
  const fake = awsFake({ [id]: key, [AWS_ARN("stranger")]: other });
  const provider = awsKmsProvider(fake.call), ref = { provider: "aws-kms" as const, id };
  config.keys = { refs: { "ledger-row": ref } }; writeFileSync(path, YAML.stringify(config)); signAmcConfig(root);
  const issuer = await provider.describe(ref);
  const signingIssuer = variant === "wrong-issuer" ? await provider.describe({ ...ref, id: AWS_ARN("stranger") }) : issuer;
  const signed = await issueDelegation(provider, signingIssuer, {
    delegatePublicKeyPem: variant === "wrong-delegate" ? publicPem(fakeKey("ed25519")) : local,
    notBefore: new Date(Date.now() - 25 * 3_600_000), hours: 24, maxEvents: 2
  });
  if (variant === "overlong") {
    signed.delegation.notAfter = new Date(Date.parse(signed.delegation.notBefore) + 25 * 3_600_000).toISOString();
    signed.signature = (await signChecked(provider, signingIssuer, Buffer.from("AMC_KEY_DELEGATION_V1\0" + canonicalize(signed.delegation)))).toString("base64");
  }
  if (variant === "high-s") {
    const bytes = Buffer.from(signed.signature, "base64");
    const n = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
    Buffer.from((n - BigInt("0x" + bytes.subarray(32).toString("hex"))).toString(16).padStart(64, "0"), "hex").copy(bytes, 32);
    signed.signature = bytes.toString("base64");
  }
  const bytes = variant === "noncanonical" ? Buffer.concat([encodeDelegation(signed), Buffer.from(" ")]) : encodeDelegation(signed);
  const previous = assertKeysetComplete(root)!;
  const binding = { provider: ref.provider, id, keyId: issuer.keyId, algorithm: issuer.algorithm, protection: issuer.protection, protectionBasis: issuer.protectionBasis };
  const committed = commitKeyset(root, { expectedGeneration: previous.generation, keys: previous.keys,
    providers: { ...previous.providers, "ledger-row": binding }, writes: [
      { path: join(vaultPaths(root).keysDir, "ledger-row-provider.pub"), bytes: issuer.publicKeyPem, mode: 0o644 },
      { path: join(root, DELEGATION_REL), bytes, mode: 0o644 }
    ] });
  const trust = withPins(emptyTrust, [{ keyId: issuer.keyId, purposes: ["ledger-row"], origin: "owned fixture operator" }]);
  return { root, local, provider, checkpoint, committed, trust };
}

describe("owner-only v1 provider checkpoint migration", () => {
  it("renews an expired canonical exact-delegate v1 state into a signed v2 checkpoint cutoff", async () => {
    const fixture = await oldV1();
    expect(() => getSigningKey(fixture.root, "ledger-row")).toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
    expect(() => readCheckpointChain(fixture.root, fixture.trust)).toThrow(/no operational cutover/);
    const renewed = await bindPurposeProviderKey(fixture.root, "ledger-row", { passphrase: PASS, provider: fixture.provider, delegation: { maxEvents: 2 } });
    expect(renewed.generation).toBeGreaterThan(fixture.committed.generation);
    const current = JSON.parse(readFileSync(join(fixture.root, DELEGATION_REL), "utf8"));
    expect(current.delegation.version).toBe(2);
    expect(current.delegation.scope.checkpoints.sequence).toBe(1);
    expect(current.delegation.delegatePublicKeyPem).toBe(fixture.local);
    expect(readFileSync(join(checkpointsDir(fixture.root), "1.json"))).toEqual(fixture.checkpoint);
    expect(readCheckpointChain(fixture.root, fixture.trust)).toHaveLength(1);
    expect(getSigningKey(fixture.root, "ledger-row")).toContain("PRIVATE KEY");
  });

  for (const variant of ["wrong-issuer", "wrong-delegate", "noncanonical", "overlong", "high-s"] as const) {
    it(`refuses ${variant} v1 evidence without publishing a new generation`, async () => {
      const fixture = await oldV1(variant);
      await expect(bindPurposeProviderKey(fixture.root, "ledger-row", { passphrase: PASS, provider: fixture.provider }))
        .rejects.toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
      expect(assertKeysetComplete(fixture.root)!.generation).toBe(fixture.committed.generation);
      expect(readFileSync(join(checkpointsDir(fixture.root), "1.json"))).toEqual(fixture.checkpoint);
    });
  }

  it("does not make the owner migration reader a verifier bypass for agent mode or another captured vault key", async () => {
    const fixture = await oldV1();
    expect(() => readLegacyCheckpointPrefixForKeyMigration(fixture.root, publicPem(fakeKey("ed25519"))))
      .toThrow(expect.objectContaining({ code: "KEY_DELEGATION_INVALID" }));
    setMode(fixture.root, "agent");
    expect(() => readLegacyCheckpointPrefixForKeyMigration(fixture.root, fixture.local)).toThrow(/owner/i);
    expect(() => readCheckpointChain(fixture.root, fixture.trust)).toThrow(/no operational cutover/);
  });
});

