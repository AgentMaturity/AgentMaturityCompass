import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createReleaseBundle } from "../src/release/releaseBundle.js";
import { printReleaseBundleSummary, verifyReleaseBundle } from "../src/release/releaseVerifier.js";
import { writeSbom } from "../src/release/releaseSbom.js";
import { writeLicenseInventory } from "../src/release/releaseLicenses.js";
import { scanReleaseArchive } from "../src/release/releaseSecretScan.js";
import { canonicalize } from "../src/utils/json.js";
import { pinnedTrust } from "./helpers/trustContext.js";

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
      const privateKeyPath = join(dir, "release-signing.pem");
      writeFileSync(privateKeyPath, makePrivateKeyPem(), { mode: 0o600 });
      const outFile = join(dir, "bundle.amcrelease");
      createReleaseBundle({
        workspace,
        outFile,
        privateKeyPath,
        skipInstallBuild: true
      });

      const untar = spawnSync("tar", ["-xzf", outFile, "-C", dir], { encoding: "utf8" });
      expect(untar.status).toBe(0);

      const manifestPath = join(dir, "amc-release", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { package: { version: string } };
      manifest.package.version = "9.9.9";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      const tamperedManifestBundle = join(dir, "tampered-manifest.amcrelease");
      repackFromDir(join(dir, "amc-release"), tamperedManifestBundle);
      expect(verifyReleaseBundle(tamperedManifestBundle, releaseTrust(privateKeyPath)).ok).toBe(false);

      // re-extract from original and tamper an artifact file
      rmSync(join(dir, "amc-release"), { recursive: true, force: true });
      spawnSync("tar", ["-xzf", outFile, "-C", dir], { encoding: "utf8" });
      const sbomPath = join(dir, "amc-release", "artifacts", "sbom", "sbom.cdx.json");
      writeFileSync(sbomPath, `${readFileSync(sbomPath, "utf8")}\n/*tamper*/\n`);
      const tamperedArtifactBundle = join(dir, "tampered-artifact.amcrelease");
      repackFromDir(join(dir, "amc-release"), tamperedArtifactBundle);
      expect(verifyReleaseBundle(tamperedArtifactBundle, releaseTrust(privateKeyPath)).ok).toBe(false);

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
