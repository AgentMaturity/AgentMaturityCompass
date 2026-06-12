import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureReleaseDirs, releasePaths } from "./releasePaths.js";
import { initReleaseSigningKey, releasePublicKeyFingerprint } from "./releaseSigner.js";
import { createReleaseBundle } from "./releaseBundle.js";
import { printReleaseBundleSummary, verifyReleaseBundle } from "./releaseVerifier.js";
import { writeSbom } from "./releaseSbom.js";
import { writeLicenseInventory } from "./releaseLicenses.js";
import { scanReleaseArchive, writeSecretScanReport } from "./releaseSecretScan.js";
import { readVersionFromPackage, writeProvenanceRecord } from "./releaseProvenance.js";
import { writeFileAtomic } from "../utils/fs.js";
import { fileSha256 } from "./releaseUtils.js";

export function releaseInitCli(params: {
  workspace: string;
  writePrivateTo?: string;
}): {
  publicKeyPath: string;
  privateKeyPath: string | null;
  fingerprint: string;
  created: boolean;
  note: string;
} {
  const workspace = resolve(params.workspace);
  const out = initReleaseSigningKey(workspace, params.writePrivateTo);
  return {
    ...out,
    note: out.privateKeyPath
      ? "Private key written to requested path. Keep it secure and out of source control."
      : "Private key was not written. Set AMC_RELEASE_SIGNING_KEY_FILE (or AMC_RELEASE_SIGNING_KEY in CI) for release signing."
  };
}

export function releasePackCli(params: {
  workspace: string;
  outFile: string;
  privateKeyPath?: string;
  skipInstallBuild?: boolean;
}): {
  outFile: string;
  manifestPathHint: string;
  version: string;
  fingerprint: string;
} {
  const workspace = resolve(params.workspace);
  ensureReleaseDirs(workspace);
  const packed = createReleaseBundle({
    workspace,
    outFile: resolve(params.outFile),
    privateKeyPath: params.privateKeyPath,
    skipInstallBuild: params.skipInstallBuild
  });
  return {
    outFile: packed.outFile,
    manifestPathHint: "amc-release/manifest.json",
    version: packed.manifest.package.version,
    fingerprint: packed.manifest.signing.pubkeyFingerprint
  };
}

export function releaseVerifyCli(params: {
  bundleFile: string;
  publicKeyPath?: string;
}): ReturnType<typeof verifyReleaseBundle> {
  return verifyReleaseBundle(params.bundleFile, params.publicKeyPath);
}

export function releaseSbomCli(params: { workspace: string; outPath: string }): {
  path: string;
  sha256: string;
} {
  const outPath = resolve(params.outPath);
  writeSbom(resolve(params.workspace), outPath);
  return {
    path: outPath,
    sha256: fileSha256(outPath)
  };
}

export function releaseLicensesCli(params: { workspace: string; outPath: string }): {
  path: string;
  sha256: string;
} {
  const outPath = resolve(params.outPath);
  writeLicenseInventory(resolve(params.workspace), outPath);
  return {
    path: outPath,
    sha256: fileSha256(outPath)
  };
}

export function releaseProvenanceCli(params: { workspace: string; outPath: string }): {
  path: string;
  sha256: string;
} {
  const outPath = resolve(params.outPath);
  const workspace = resolve(params.workspace);
  writeProvenanceRecord({
    workspace,
    outPath,
    toolVersion: readVersionFromPackage(workspace),
    outputs: {
      npmTgzSha256: process.env.AMC_RELEASE_NPM_SHA256 ?? "",
      sbomSha256: process.env.AMC_RELEASE_SBOM_SHA256 ?? "",
      licensesSha256: process.env.AMC_RELEASE_LICENSES_SHA256 ?? "",
      secretScanSha256: process.env.AMC_RELEASE_SECRET_SCAN_SHA256 ?? ""
    }
  });
  return {
    path: outPath,
    sha256: fileSha256(outPath)
  };
}

export function releaseScanCli(params: { input: string; outPath?: string }): {
  status: "PASS" | "FAIL";
  findings: number;
  outPath: string | null;
} {
  const report = scanReleaseArchive(resolve(params.input));
  if (params.outPath) {
    writeSecretScanReport(report, resolve(params.outPath));
  }
  return {
    status: report.status,
    findings: report.findings.length,
    outPath: params.outPath ? resolve(params.outPath) : null
  };
}

export function releasePrintCli(params: { bundleFile: string }): {
  packageName: string;
  version: string;
  gitCommit: string;
  gitTag: string | null;
  signingFingerprint: string;
  files: string[];
} {
  const out = printReleaseBundleSummary(resolve(params.bundleFile));
  return {
    packageName: out.manifest.package.name,
    version: out.manifest.package.version,
    gitCommit: out.manifest.package.git.commit,
    gitTag: out.manifest.package.git.tag,
    signingFingerprint: out.manifest.signing.pubkeyFingerprint,
    files: out.files
  };
}

export function releasePublicFingerprintCli(workspace: string): string {
  const paths = releasePaths(resolve(workspace));
  const pub = readFileSync(paths.publicKeyPath, "utf8");
  return releasePublicKeyFingerprint(pub);
}

export function writeReleaseVerifySummary(params: {
  workspace: string;
  outputPath: string;
  verify: ReturnType<typeof verifyReleaseBundle>;
}): string {
  const report = {
    v: 1,
    ts: Date.now(),
    ok: params.verify.ok,
    summary: params.verify.summary,
    errors: params.verify.errors
  };
  const full = resolve(params.outputPath);
  writeFileAtomic(full, `${JSON.stringify(report, null, 2)}\n`, 0o644);
  return full;
}

export function defaultReleaseKeyPaths(workspace: string): { publicKeyPath: string; privateKeyPath: string } {
  const paths = releasePaths(resolve(workspace));
  return {
    publicKeyPath: paths.publicKeyPath,
    privateKeyPath: paths.defaultPrivateKeyPath
  };
}

export function releaseProvenanceForBundle(params: {
  workspace: string;
  outPath: string;
  npmSha: string;
  sbomSha: string;
  licensesSha: string;
  secretScanSha: string;
}): { path: string; sha256: string } {
  const workspace = resolve(params.workspace);
  writeProvenanceRecord({
    workspace,
    outPath: resolve(params.outPath),
    toolVersion: readVersionFromPackage(workspace),
    outputs: {
      npmTgzSha256: params.npmSha,
      sbomSha256: params.sbomSha,
      licensesSha256: params.licensesSha,
      secretScanSha256: params.secretScanSha
    }
  });
  return {
    path: resolve(params.outPath),
    sha256: fileSha256(resolve(params.outPath))
  };
}

export function ensureReleaseWorkspaceDefaults(workspace: string): string {
  const paths = ensureReleaseDirs(resolve(workspace));
  return paths.rootDir;
}

export function writeReleaseMetadataFile(path: string, payload: Record<string, unknown>): void {
  writeFileAtomic(resolve(path), `${JSON.stringify(payload, null, 2)}\n`, 0o644);
}

export function readReleaseFile(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

export function releaseWorkingPath(workspace: string): string {
  return join(releasePaths(resolve(workspace)).rootDir, "working");
}
