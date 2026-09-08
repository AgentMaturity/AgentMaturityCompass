import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { releaseManifestSchema } from "./releaseSchema.js";
import { verifyReleaseManifest } from "./releaseSigner.js";
import { cleanupDir, fileSha256, mkTmp, runTarExtract } from "./releaseUtils.js";
import { scanExtractedReleaseForSecrets, secretScanSchema } from "./releaseSecretScan.js";

export interface ReleaseVerifyResult {
  ok: boolean;
  manifest?: ReturnType<typeof releaseManifestSchema.parse>;
  errors: string[];
  summary: {
    packageName: string;
    version: string;
    commit: string;
    tag: string | null;
  } | null;
}

function readSig(path: string): string {
  return readFileSync(path, "utf8").trim();
}

function resolveBundleRoot(extractDir: string): string {
  return join(extractDir, "amc-release");
}

export function printReleaseBundleSummary(bundleFile: string): {
  manifest: ReturnType<typeof releaseManifestSchema.parse>;
  files: string[];
} {
  const tmp = mkTmp("amc-release-print-");
  try {
    runTarExtract(resolve(bundleFile), tmp);
    const root = resolveBundleRoot(tmp);
    const manifest = releaseManifestSchema.parse(JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")));
    const files = [
      "manifest.json",
      "manifest.sig",
      "keys/release-signing.pub",
      "artifacts/npm",
      "artifacts/sbom",
      "artifacts/licenses",
      "artifacts/provenance",
      "artifacts/docker",
      "checks/secret-scan.json"
    ];
    return { manifest, files };
  } finally {
    cleanupDir(tmp);
  }
}

export function verifyReleaseBundle(bundleFile: string, overridePublicKeyPath?: string): ReleaseVerifyResult {
  const tmp = mkTmp("amc-release-verify-");
  const errors: string[] = [];
  try {
    runTarExtract(resolve(bundleFile), tmp);
    const root = resolveBundleRoot(tmp);
    const manifestPath = join(root, "manifest.json");
    const sigPath = join(root, "manifest.sig");
    const pubPath = overridePublicKeyPath ? resolve(overridePublicKeyPath) : join(root, "keys", "release-signing.pub");
    const manifest = releaseManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
    const sig = readSig(sigPath);
    const pub = readFileSync(pubPath, "utf8");
    if (!verifyReleaseManifest(manifest, sig, pub)) {
      errors.push("manifest signature verification failed");
    }

    const checks: Array<{ path: string; expected: string; label: string }> = [
      { path: "artifacts/npm/agent-maturity-compass-" + manifest.package.version + ".tgz", expected: manifest.artifacts.npmTgzSha256, label: "npm tgz" },
      { path: "artifacts/sbom/sbom.cdx.json", expected: manifest.artifacts.sbomSha256, label: "sbom" },
      { path: "artifacts/licenses/licenses.json", expected: manifest.artifacts.licensesSha256, label: "licenses" },
      { path: "artifacts/provenance/provenance.json", expected: manifest.artifacts.provenanceSha256, label: "provenance" },
      { path: "checks/secret-scan.json", expected: manifest.artifacts.secretScanSha256, label: "secret scan" },
      { path: "artifacts/docker/image.json", expected: manifest.artifacts.dockerImageSha256, label: "docker metadata" }
    ];
    for (const check of checks) {
      const full = join(root, check.path);
      const actual = fileSha256(full);
      if (actual !== check.expected) {
        errors.push(`${check.label} sha mismatch: expected ${check.expected}, got ${actual}`);
      }
    }

    const secretScan = secretScanSchema.safeParse(JSON.parse(readFileSync(join(root, "checks", "secret-scan.json"), "utf8")));
    if (!secretScan.success) {
      errors.push("secret scan report is invalid");
    } else if (secretScan.data.status !== "PASS" || secretScan.data.findings.some(finding => finding.severity === "HIGH")) {
      errors.push("secret scan report does not establish a passing scan");
    }

    // Inspect the same extracted bytes whose hashes were verified, including
    // members of the compressed npm artifact; compressed text is not coverage.
    const rescan = scanExtractedReleaseForSecrets(root);
    if (rescan.status !== "PASS") {
      errors.push("bundle content secret scan failed");
    }

    return {
      ok: errors.length === 0,
      errors,
      manifest,
      summary: {
        packageName: manifest.package.name,
        version: manifest.package.version,
        commit: manifest.package.git.commit,
        tag: manifest.package.git.tag
      }
    };
  } catch (error) {
    return {
      ok: false,
      errors: [...errors, String(error)],
      summary: null
    };
  } finally {
    cleanupDir(tmp);
  }
}
