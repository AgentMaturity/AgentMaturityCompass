import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReleaseBundle } from "../src/release/releaseBundle.js";
import { printReleaseBundleSummary, verifyReleaseBundle } from "../src/release/releaseVerifier.js";
import { writeSbom } from "../src/release/releaseSbom.js";
import { writeLicenseInventory } from "../src/release/releaseLicenses.js";
import { scanReleaseArchive } from "../src/release/releaseSecretScan.js";
import { canonicalize } from "../src/utils/json.js";
import { ed25519KeyId, untrustedReasons, verdictExitCode } from "../src/trust/index.js";
import { pinnedTrust } from "./helpers/trustContext.js";
import { tinyReleaseBundle } from "./helpers/tinyReleaseBundle.js";
import { distrustEntry } from "./trust/trustFixtures.js";

const workspace = process.cwd();

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makePrivateKeyPem(): string {
  return generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

/** The release signer pins the public half of the key it generated (P0-09). */
function releaseTrust(privateKeyPath: string) {
  const publicKeyPem = createPublicKey(readFileSync(privateKeyPath, "utf8")).export({ format: "pem", type: "spki" }).toString();
  return pinnedTrust([{ publicKeyPem, purposes: ["release"] }]);
}

function repackFromDir(sourceDir: string, outFile: string): void {
  const out = spawnSync("tar", ["-czf", outFile, "-C", sourceDir, "."], { encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`tar repack failed: ${(out.stdout ?? "") + (out.stderr ?? "")}`);
  }
}

describe("release engineering pack", () => {
  it("packs and verifies a signed .amcrelease bundle and prints summary", () => {
    const dir = tmp("amc-release-pack-");
    try {
      const privateKeyPath = join(dir, "release-signing.pem");
      writeFileSync(privateKeyPath, makePrivateKeyPem(), { mode: 0o600 });
      const outFile = join(dir, "bundle.amcrelease");
      const packed = createReleaseBundle({
        workspace,
        outFile,
        privateKeyPath,
        skipInstallBuild: true
      });
      expect(packed.manifest.package.name).toBe("agent-maturity-compass");
      const verified = verifyReleaseBundle(outFile, releaseTrust(privateKeyPath));
      expect(verified.ok).toBe(true);
      const summary = printReleaseBundleSummary(outFile);
      expect(summary.manifest.package.version).toBeTruthy();
      expect(summary.files).toContain("manifest.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails verify on tampered manifest and artifact and wrong pubkey", () => {
    const dir = tmp("amc-release-tamper-");
    const extracted = join(dir, "extract");
    try {
      // A real signed bundle in the `amc release pack` format, of a one-file package: packing the whole repository
      // here took ~8 s alone and timed out (30 s) when CI ran several suites at once. The tamper checks need any
      // signed bundle with a manifest and an SBOM artifact, not the repository's own.
      const tiny = tinyReleaseBundle(dir);
      const outFile = tiny.file;
      const signerTrust = pinnedTrust([{ publicKeyPem: tiny.publicKeyPem, purposes: ["release"] }]);

      // Tamper inside a directory that holds only the bundle tree, so the repack is a well-formed bundle and
      // the verifier gets as far as checking the signature and hashes instead of failing to find the archive root.
      mkdirSync(extracted, { recursive: true });
      const untar = spawnSync("tar", ["-xzf", outFile, "-C", extracted], { encoding: "utf8" });
      expect(untar.status).toBe(0);

      const manifestPath = join(extracted, "amc-release", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { package: { version: string } };
      manifest.package.version = "9.9.9";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const tamperedManifestBundle = join(dir, "tampered-manifest.amcrelease");
      repackFromDir(extracted, tamperedManifestBundle);
      const tamperedManifest = verifyReleaseBundle(tamperedManifestBundle, signerTrust);
      expect(tamperedManifest.ok).toBe(false);
      expect(tamperedManifest.errors).toContain("manifest signature verification failed");

      // re-extract from original and tamper an artifact file
      rmSync(extracted, { recursive: true, force: true });
      mkdirSync(extracted, { recursive: true });
      spawnSync("tar", ["-xzf", outFile, "-C", extracted], { encoding: "utf8" });
      const sbomPath = join(extracted, "amc-release", "artifacts", "sbom", "sbom.cdx.json");
      writeFileSync(sbomPath, `${readFileSync(sbomPath, "utf8")}\n/*tamper*/\n`);
      const tamperedArtifactBundle = join(dir, "tampered-artifact.amcrelease");
      repackFromDir(extracted, tamperedArtifactBundle);
      const tamperedArtifact = verifyReleaseBundle(tamperedArtifactBundle, signerTrust);
      expect(tamperedArtifact.ok).toBe(false);
      expect(tamperedArtifact.errors.some((error) => error.startsWith("sbom sha mismatch"))).toBe(true);
      // The signature is still the signer's: only the artifact changed, and the verdict says which.
      expect(tamperedArtifact.errors).not.toContain("manifest signature verification failed");

      const wrongPubPath = join(dir, "wrong.pub");
      const wrongPub = generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }).toString();
      writeFileSync(wrongPubPath, wrongPub);
      // The embedded key still verifies the signature, but a different pinned key does not admit it.
      const wrongPin = verifyReleaseBundle(outFile, pinnedTrust([{ publicKeyPem: wrongPub, purposes: ["release"] }]), wrongPubPath);
      expect(wrongPin.ok).toBe(false);
      expect(wrongPin.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(extracted, { recursive: true, force: true });
    }
  });

  it("generates deterministic SBOM and sorted license report", () => {
    const dir = tmp("amc-release-report-");
    try {
      const sbomA = join(dir, "a.sbom.json");
      const sbomB = join(dir, "b.sbom.json");
      writeSbom(workspace, sbomA);
      writeSbom(workspace, sbomB);
      expect(readFileSync(sbomA, "utf8")).toBe(readFileSync(sbomB, "utf8"));

      const licenses = join(dir, "licenses.json");
      writeLicenseInventory(workspace, licenses);
      const parsed = JSON.parse(readFileSync(licenses, "utf8")) as {
        dependencies: Array<{ name: string; version: string }>;
      };
      const sorted = [...parsed.dependencies].sort((a, b) =>
        `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)
      );
      expect(canonicalize(parsed.dependencies)).toBe(canonicalize(sorted));
      expect(parsed.dependencies.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("secret scan detects fake key patterns inside archive", () => {
    const dir = tmp("amc-release-scan-");
    try {
      const root = join(dir, "fake");
      mkdirSync(root, { recursive: true });
      const relRoot = join(root, "amc-release");
      rmSync(relRoot, { recursive: true, force: true });
      writeFileSync(join(root, "secret.txt"), "sk-abcdefghijklmnopqrstuvwxyz12345");
      const archive = join(dir, "bad.tar.gz");
      const tar = spawnSync("tar", ["-czf", archive, "-C", root, "."], { encoding: "utf8" });
      expect(tar.status).toBe(0);
      const report = scanReleaseArchive(archive);
      expect(report.status).toBe("FAIL");
      expect(report.findings.some((f) => f.type === "OPENAI_STYLE_KEY")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * What verifyReleaseBundle's verdict says about the signer (P0-09): integrity and issuer admission are separate
 * dimensions, `ok` is only report.trusted, and --allow-unpinned never makes a bundle trusted. A tiny workspace keeps
 * each bundle fast to build; the bundle format is the one `amc release pack` writes.
 */
describe("verifyReleaseBundle verdicts", () => {
  let root = "";
  let signerPem = "";
  let signerId = "";
  let signerPubPath = "";
  let bundle = "";
  let pristine = "";

  beforeAll(() => {
    root = tmp("amc-release-verdict-");
    const tiny = tinyReleaseBundle(root);
    ({ file: bundle, publicKeyPem: signerPem, keyId: signerId, publicKeyPath: signerPubPath } = tiny);
    pristine = join(root, "pristine");
    mkdirSync(pristine);
    const untar = spawnSync("tar", ["-xzf", bundle, "-C", pristine], { encoding: "utf8" });
    expect(untar.status, untar.stderr).toBe(0);
  }, 120_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  const pinSigner = (overrides: Parameters<typeof pinnedTrust>[1] = {}) => pinnedTrust([{ publicKeyPem: signerPem, purposes: ["release"] }], overrides);

  /** A copy of the bundle with `mutate` applied to its amc-release tree, repacked as a well-formed bundle. */
  function variant(name: string, mutate: (bundleRoot: string) => void): string {
    const top = join(root, `variant-${name}`);
    cpSync(pristine, top, { recursive: true });
    mutate(join(top, "amc-release"));
    const out = join(root, `${name}.amcrelease`);
    repackFromDir(top, out);
    return out;
  }

  it("trusts an untouched bundle whose signer is pinned for the release purpose", () => {
    const verdict = verifyReleaseBundle(bundle, pinSigner());
    expect(verdict.errors).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.report.trusted).toBe(true);
    expect(verdictExitCode(verdict.report)).toBe(0);
    expect(verdict.report.issuerAdmission.signatures).toEqual([expect.objectContaining({
      signature: "manifest.sig", purpose: "release", keyId: signerId, status: "admitted", source: "explicit-key"
    })]);
    expect(verdict.summary).toMatchObject({ packageName: "agent-maturity-compass", version: "1.0.0" });
  });

  it("keeps integrity separate from admission: an intact bundle nobody pinned is not trusted, and names the key to pin", () => {
    const verdict = verifyReleaseBundle(bundle, pinnedTrust([]));
    expect(verdict.errors).toEqual([]);
    expect(verdict.report.integrity.status).toBe("pass");
    expect(verdict.ok).toBe(false);
    expect(verdict.report.issuerAdmission.signatures[0]).toMatchObject({ status: "not-pinned", keyId: signerId });
    expect(verdict.report.issuerAdmission.signatures[0]?.detail).toContain(`key ${signerId} is not pinned for release`);
    expect(verdictExitCode(verdict.report)).toBe(1);
    expect(untrustedReasons(verdict.report)[0]).toContain(`key ${signerId} is not pinned for release`);
  });

  it("gives --allow-unpinned an integrity-only result: never ok, exit 2, and the override is recorded", () => {
    const verdict = verifyReleaseBundle(bundle, pinnedTrust([], { allowUnpinned: true }));
    expect(verdict.errors).toEqual([]);
    expect(verdict.ok).toBe(false);
    expect(verdict.report.trusted).toBe(false);
    expect(verdict.report.issuerAdmission.signatures[0]).toMatchObject({ status: "unpinned-allowed", keyId: signerId });
    expect(verdict.report.overrides).toEqual(["allow-unpinned"]);
    expect(verdictExitCode(verdict.report)).toBe(2);
  });

  it("does not admit the signer when its pin is for another purpose", () => {
    const verdict = verifyReleaseBundle(bundle, pinnedTrust([{ publicKeyPem: signerPem, purposes: ["artifact-seal"] }]));
    expect(verdict.ok).toBe(false);
    expect(verdict.report.issuerAdmission.signatures[0]?.status).toBe("not-pinned");
    expect(verdictExitCode(verdict.report)).toBe(1);
  });

  it("refuses a distrusted signer even when it is pinned and --allow-unpinned was used", () => {
    const verdict = verifyReleaseBundle(bundle, pinSigner({ allowUnpinned: true, distrust: [distrustEntry(signerId, { note: "release verdict test" })] }));
    expect(verdict.ok).toBe(false);
    expect(verdict.report.issuerAdmission.signatures[0]).toMatchObject({ status: "distrusted", keyId: signerId });
    expect(verdict.report.issuerAdmission.signatures[0]?.detail).toContain("release verdict test");
    expect(verdictExitCode(verdict.report)).toBe(1);
  });

  it("uses --pubkey only to find the signer: an unrelated key file does not stop the embedded key being checked and admitted", () => {
    const unrelated = join(root, "unrelated.pub");
    writeFileSync(unrelated, generateKeyPairSync("ed25519").publicKey.export({ format: "pem", type: "spki" }));
    const verdict = verifyReleaseBundle(bundle, pinSigner(), unrelated);
    expect(verdict.errors).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.report.issuerAdmission.signatures[0]?.keyId).toBe(signerId);
  });

  it("verifies a bundle that carries no key when --pubkey names the signer, and refuses it when nothing does", () => {
    const stripped = variant("no-embedded-key", (bundleRoot) => rmSync(join(bundleRoot, "keys", "release-signing.pub")));
    const located = verifyReleaseBundle(stripped, pinSigner(), signerPubPath);
    expect(located.errors).toEqual([]);
    expect(located.ok).toBe(true);
    const nameless = verifyReleaseBundle(stripped, pinSigner());
    expect(nameless.ok).toBe(false);
    expect(nameless.errors).toContain("manifest signature verification failed");
    expect(nameless.report.issuerAdmission.signatures[0]).toMatchObject({ status: "not-pinned", keyId: null });
    expect(nameless.report.issuerAdmission.signatures[0]?.detail).toContain("names no public key");
  });

  it("fails a bundle whose archive is missing or is not an archive, with a report that records no signature check", () => {
    const absent = join(root, "absent.amcrelease");
    const notArchive = join(root, "not-an-archive.amcrelease");
    writeFileSync(notArchive, "this is not a tar.gz");
    for (const file of [absent, notArchive]) {
      const verdict = verifyReleaseBundle(file, pinSigner());
      expect(verdict.ok).toBe(false);
      expect(verdict.summary).toBeNull();
      expect(verdict.manifest).toBeUndefined();
      expect(verdict.errors).toHaveLength(1);
      expect(verdict.report).toMatchObject({ integrity: { status: "fail" }, issuerAdmission: { status: "not-evaluated", signatures: [] }, trusted: false });
      expect(verdictExitCode(verdict.report)).toBe(1);
    }
    expect(verifyReleaseBundle(absent, pinSigner()).report.artifact.sha256).toBe("0".repeat(64));
  });
});
