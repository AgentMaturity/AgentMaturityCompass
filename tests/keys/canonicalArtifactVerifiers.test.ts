import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";
import { tinyReleaseBundle } from "../helpers/tinyReleaseBundle.js";
import { pinnedTrust } from "../helpers/trustContext.js";
import { verifyReleaseBundle } from "../../src/release/releaseVerifier.js";
import { pluginKeygen, pluginPack, extractPluginPackage, verifyPluginPackage } from "../../src/plugins/pluginPackage.js";
import { initPluginRegistry, verifyPluginRegistry } from "../../src/plugins/pluginRegistry.js";
import { browseRegistry } from "../../src/plugins/pluginRegistryClient.js";
import { initBenchRegistry, verifyBenchRegistry } from "../../src/bench/benchRegistryServer.js";
import { browseBenchRegistry } from "../../src/bench/benchRegistryClient.js";
import { lowS, signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { withPins, type TrustContext } from "../../src/trust/index.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function ownedRoot(): string { const root = mkdtempSync(join(tmpdir(), "amc-canonical-artifacts-")); roots.push(root); return root; }
const pemOf = (key: KeyObject) => key.export({ format: "pem", type: "spki" }).toString();
function pin(pem: string, purpose: "release" | "artifact-seal"): TrustContext {
  // The pre-existing pinnedTrust helper deliberately only accepts Ed25519. Use the real dual-alg admission input.
  return withPins(pinnedTrust([]), [{ keyId: signingKeyId(pem)!, purposes: [purpose], origin: "fixture-created signer" }]);
}
function ecSignature(bytes: Buffer, key: KeyObject): Buffer {
  return lowS(sign("sha256", bytes, { key, dsaEncoding: "ieee-p1363" }));
}
function highS(signature: Buffer): Buffer {
  const order = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  const s = BigInt(`0x${signature.subarray(32).toString("hex")}`);
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((order - s).toString(16).padStart(64, "0"), "hex")]);
}
function tar(args: string[]): void { const out = spawnSync("tar", args, { encoding: "utf8" }); expect(out.status, out.stderr).toBe(0); }

describe("remaining portable verifiers use canonical signing algorithms", () => {
  test("release bundle admits canonical P-256 and refuses relabeling, DER, high S and a wrong-purpose pin", () => {
    const root = ownedRoot();
    const source = tinyReleaseBundle(root);
    expect(verifyReleaseBundle(source.file, pin(source.publicKeyPem, "release")).ok).toBe(true);
    const top = join(root, "unpacked"); mkdirSync(top);
    tar(["-xzf", source.file, "-C", top]);
    const bundle = join(top, "amc-release"), manifestPath = join(bundle, "manifest.json");
    const original = JSON.parse(readFileSync(manifestPath, "utf8"));
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    const manifest = { ...original, signing: { algorithm: "ecdsa-p256-sha256", pubkeyFingerprint: signingKeyId(pem)! } };
    const out = join(root, "p256.amcrelease");
    writeFileSync(join(bundle, "keys", "release-signing.pub"), pem);
    function variant(body: typeof manifest, signature: Buffer): string {
      writeFileSync(manifestPath, canonicalize(body));
      writeFileSync(join(bundle, "manifest.sig"), signature.toString("base64"));
      tar(["-czf", out, "-C", top, "amc-release"]);
      return out;
    }
    const bytes = Buffer.from(canonicalize(manifest)), signature = ecSignature(bytes, keys.privateKey);
    const good = variant(manifest, signature);
    expect(verifyReleaseBundle(good, pin(pem, "release")).ok).toBe(true);
    expect(verifyReleaseBundle(good, pin(pem, "artifact-seal")).ok).toBe(false);
    expect(verifyReleaseBundle(good, pinnedTrust([])).ok).toBe(false);
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey)]) {
      expect(verifyReleaseBundle(variant(manifest, bad), pin(pem, "release")).ok).toBe(false);
    }
    const relabeled = { ...manifest, signing: { ...manifest.signing, algorithm: "ed25519" } };
    expect(verifyReleaseBundle(variant(relabeled, ecSignature(Buffer.from(canonicalize(relabeled)), keys.privateKey)), pin(pem, "release")).ok).toBe(false);
    const altered = { ...manifest, generatedTs: manifest.generatedTs + 1 };
    expect(verifyReleaseBundle(variant(altered, signature), pin(pem, "release")).ok).toBe(false);
  }, 120_000);

  test("plugin package admits canonical P-256 and refuses relabeling, DER, high S and a wrong-purpose pin", () => {
    const root = ownedRoot(), source = join(root, "source");
    mkdirSync(join(source, "content", "learn"), { recursive: true });
    writeFileSync(join(source, "content", "learn", "fixture.md"), "# Clean fixture\n");
    // Same real pluginPack source shape as tests/pluginMarketplace.test.ts, with one owned learn artifact.
    writeFileSync(join(source, "manifest.json"), JSON.stringify({ v: 1, plugin: {
      id: "amc.plugin.canonical.fixture", name: "canonical fixture", version: "1.0.0", description: "fixture plugin",
      publisher: { org: "Fixture", contact: "ops@example.com", website: "https://example.com", pubkeyFingerprint: "0".repeat(64) },
      compatibility: { amcMinVersion: ">=1.0.0", nodeMinVersion: ">=20", schemaVersions: {
        policyPacks: 1, assurancePacks: 1, complianceMaps: 1, adapters: 1, outcomes: 1, casebooks: 1, transform: 1 } },
      risk: { category: "LOW", notes: "fixture", touches: ["learn"] }
    }, artifacts: [], generatedTs: 1, signing: { algorithm: "ed25519", pubkeyFingerprint: "0".repeat(64) } }));
    const initial = pluginKeygen({ outDir: join(root, "initial-keys") });
    const sourceFile = join(root, "source.amcplug");
    pluginPack({ inputDir: source, keyPath: initial.privateKeyPath, outFile: sourceFile });
    expect(verifyPluginPackage({ file: sourceFile, trust: pin(readFileSync(initial.publicKeyPath, "utf8"), "artifact-seal") }).ok).toBe(true);
    const top = join(root, "unpacked"), bundle = extractPluginPackage(sourceFile, top).rootDir;
    const original = JSON.parse(readFileSync(join(bundle, "manifest.json"), "utf8"));
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey), id = signingKeyId(pem)!;
    const manifest = { ...original, plugin: { ...original.plugin, publisher: { ...original.plugin.publisher, pubkeyFingerprint: id } },
      signing: { algorithm: "ecdsa-p256-sha256", pubkeyFingerprint: id } };
    const out = join(root, "p256.amcplug");
    writeFileSync(join(bundle, "publisher.pub"), pem);
    function variant(body: typeof manifest, signature: Buffer): string {
      const bytes = Buffer.from(canonicalize(body));
      writeFileSync(join(bundle, "manifest.json"), bytes);
      writeFileSync(join(bundle, "manifest.sig"), JSON.stringify({ digestSha256: sha256Hex(bytes), signature: signature.toString("base64"), signedTs: 1, signer: "publisher" }));
      tar(["-czf", out, "-C", top, "amc-plugin"]); return out;
    }
    const bytes = Buffer.from(canonicalize(manifest)), signature = ecSignature(bytes, keys.privateKey);
    const check = (file: string, trust = pin(pem, "artifact-seal")) => verifyPluginPackage({ file, trust });
    expect(check(variant(manifest, signature)).ok).toBe(true);
    expect(check(out, pin(pem, "release")).ok).toBe(false);
    expect(check(out, pinnedTrust([])).ok).toBe(false);
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey)]) expect(check(variant(manifest, bad)).ok).toBe(false);
    const relabeled = { ...manifest, signing: { ...manifest.signing, algorithm: "ed25519" } };
    expect(check(variant(relabeled, ecSignature(Buffer.from(canonicalize(relabeled)), keys.privateKey))).ok).toBe(false);
    expect(check(variant({ ...manifest, generatedTs: manifest.generatedTs + 1 }, signature)).ok).toBe(false);
  });

  test.each(["plugin", "bench"] as const)("%s registry server and file client agree on P-256, DER, high S and tamper", async family => {
    const root = ownedRoot(), dir = join(root, "registry");
    const initial = family === "plugin" ? initPluginRegistry({ dir, registryId: "canonical" }) : initBenchRegistry({ dir, registryId: "canonical" });
    const server = (trust: TrustContext) => family === "plugin" ? verifyPluginRegistry(dir, trust) : verifyBenchRegistry(dir, trust);
    const client = (trust: TrustContext) => family === "plugin" ? browseRegistry({ registryBase: dir, trust }) : browseBenchRegistry({ base: dir });
    const initialPem = readFileSync(initial.pubPath, "utf8");
    expect(server(pin(initialPem, "artifact-seal")).ok).toBe(true);
    await expect(client(pin(initialPem, "artifact-seal"))).resolves.toMatchObject({ registryId: "canonical" });
    const original = JSON.parse(readFileSync(initial.indexPath, "utf8"));
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    const index = { ...original, registry: { ...original.registry, issuerFingerprint: signingKeyId(pem)! } };
    const bytes = Buffer.from(canonicalize(index)), signature = ecSignature(bytes, keys.privateKey), trust = pin(pem, "artifact-seal");
    writeFileSync(initial.pubPath, pem);
    function variant(body: typeof index, sig: Buffer): void {
      writeFileSync(initial.indexPath, canonicalize(body));
      writeFileSync(initial.sigPath, JSON.stringify({ digestSha256: sha256Hex(Buffer.from(canonicalize(body))), signature: sig.toString("base64"), signedTs: 1, signer: "registry" }));
    }
    variant(index, signature);
    expect(server(trust).ok).toBe(true);
    await expect(client(trust)).resolves.toMatchObject({ registryId: "canonical" });
    expect(server(pinnedTrust([])).ok).toBe(false);
    if (family === "plugin") await expect(client(pinnedTrust([]))).rejects.toThrow(/not admitted/);
    // browseBenchRegistry is an integrity-only browser; do not invent an admission requirement for it.
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey)]) {
      variant(index, bad);
      expect(server(trust).ok).toBe(false);
      await expect(client(trust)).rejects.toThrow(/signature invalid|signature verification failed/);
    }
    variant({ ...index, registry: { ...index.registry, name: "tampered" } }, signature);
    expect(server(trust).ok).toBe(false);
    await expect(client(trust)).rejects.toThrow(/signature invalid|signature verification failed/);
  });
});
