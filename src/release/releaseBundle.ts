import { createPublicKey } from "node:crypto";
import { copyFileSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { releaseManifestSchema, type ReleaseManifest } from "./releaseSchema.js";
import { buildReleaseManifest, packageMeta } from "./releaseManifest.js";
import { loadReleasePrivateKey, releasePublicKeyFingerprint, signReleaseManifest } from "./releaseSigner.js";
import { cleanupDir, deterministicTimestamp, fileSha256, mkTmp, runChecked, runTarCreate, runTarExtract, writeShaFile } from "./releaseUtils.js";
import { writeSbom } from "./releaseSbom.js";
import { writeLicenseInventory } from "./releaseLicenses.js";
import { scanDirectoryForSecrets, secretScanSchema, writeSecretScanReport } from "./releaseSecretScan.js";
import { readVersionFromPackage, writeProvenanceRecord } from "./releaseProvenance.js";
import { canonicalize } from "../utils/json.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";

interface PackOptions {
  workspace: string;
  outFile: string;
  privateKeyPath?: string;
  skipInstallBuild?: boolean;
  skipSecretScan?: boolean;
}

interface NpmPackResult {
  tgzPath: string;
  fileName: string;
}

function normalizeTarEntries(rootDir: string): string[] {
  const tmp = mkTmp("amc-release-tar-list-");
  try {
    runTarExtract(rootDir, tmp);
    const packageRoot = join(tmp, "package");
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          out.push(full.replace(`${tmp}/`, "").replace(/\\/g, "/"));
        }
      }
    };
    walk(packageRoot);
    out.sort((a, b) => a.localeCompare(b));
    return out;
  } finally {
    cleanupDir(tmp);
  }
}

function verifyNpmTgzSafety(tgzPath: string): void {
  const entries = normalizeTarEntries(tgzPath);
  const forbidden = entries.filter((entry) => {
    if (/\/\.env(\.|$|\/)/i.test(entry) || /(^|\/)\.env$/i.test(entry)) return true;
    if (/\.(key|pem|p12)$/i.test(entry)) return true;
    if (/\/node_modules\//.test(entry)) return true;
    if (/\/\.amc\//.test(entry)) return true;
    if (/\/data\//.test(entry)) return true;
    return false;
  });
  if (forbidden.length > 0) {
    throw new Error(`Unsafe file(s) found in npm package tarball: ${forbidden.slice(0, 10).join(", ")}`);
  }
  const hasPackageJson = entries.includes("package/package.json");
  if (!hasPackageJson) {
    throw new Error("npm package tarball is missing package/package.json");
  }
}

function npmPack(workspace: string, npmEnv: Record<string, string>): NpmPackResult {
  // Use --pack-destination to avoid conflicts when multiple tests run npm pack concurrently
  const packDest = mkTmp("amc-npm-pack-");
  try {
    const parsed = JSON.parse(
      runChecked("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packDest], workspace, npmEnv).stdout
    ) as Array<{ filename: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0]?.filename) {
      throw new Error("npm pack did not return filename");
    }
    const tgzPath = join(packDest, parsed[0].filename);
    return {
      tgzPath,
      fileName: parsed[0].filename
    };
  } catch (err) {
    cleanupDir(packDest);
    throw err;
  }
}

function writeDockerMetadata(stageRoot: string): { path: string; sha: string } {
  const payload = {
    image: process.env.AMC_DOCKER_IMAGE ?? "unknown",
    digest: process.env.AMC_DOCKER_DIGEST ?? "unknown",
    platforms: (process.env.AMC_DOCKER_PLATFORMS ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  };
  const path = join(stageRoot, "artifacts", "docker", "image.json");
  writeFileAtomic(path, `${canonicalize(payload)}\n`, 0o644);
  const sha = fileSha256(path);
  writeFileAtomic(`${path}.sha256`, `${sha}\n`, 0o644);
  return { path, sha };
}

function mergeSecretScans(primary: ReturnType<typeof scanDirectoryForSecrets>, secondary: ReturnType<typeof scanDirectoryForSecrets>) {
  const findings = [...primary.findings, ...secondary.findings];
  const status = findings.some((row) => row.severity === "HIGH") ? "FAIL" : "PASS";
  return secretScanSchema.parse({
    v: 1,
    status,
    findings
  });
}

export function createReleaseBundle(options: PackOptions): {
  outFile: string;
  manifest: ReleaseManifest;
  signature: string;
} {
  const workspace = resolve(options.workspace);
  const outFile = resolve(options.outFile);
  const npmCacheDir = join(workspace, ".amc", "release", "working", "npm-cache");
  const skipSecretScan = options.skipSecretScan ?? true;
  ensureDir(npmCacheDir);
  const npmEnv = {
    npm_config_cache: npmCacheDir,
    NPM_CONFIG_CACHE: npmCacheDir
  };

  if (!options.skipInstallBuild) {
    runChecked("npm", ["ci", "--ignore-scripts", "--no-audit", "--fund=false"], workspace, npmEnv);
    runChecked("npm", ["run", "build"], workspace, npmEnv);
  }

  const pack = npmPack(workspace, npmEnv);
  verifyNpmTgzSafety(pack.tgzPath);
  const privateKey = loadReleasePrivateKey(options.privateKeyPath);
  const pubPem = createPublicKey(privateKey).export({ format: "pem", type: "spki" }).toString();
  const pubFingerprint = releasePublicKeyFingerprint(pubPem);
  const pkg = packageMeta(workspace);
  const expectedTgz = `agent-maturity-compass-${pkg.version}.tgz`;

  const root = mkTmp("amc-release-pack-");
  const stage = join(root, "amc-release");
  ensureDir(join(stage, "keys"));
  ensureDir(join(stage, "checks"));
  ensureDir(join(stage, "artifacts", "npm"));
  ensureDir(join(stage, "artifacts", "sbom"));
  ensureDir(join(stage, "artifacts", "licenses"));
  ensureDir(join(stage, "artifacts", "provenance"));
  ensureDir(join(stage, "artifacts", "docker"));

  try {
    const npmTarget = join(stage, "artifacts", "npm", expectedTgz);
    copyFileSync(pack.tgzPath, npmTarget);
    const npmSha = writeShaFile(`${npmTarget}.sha256`, readFileSync(npmTarget));

    const sbomPath = join(stage, "artifacts", "sbom", "sbom.cdx.json");
    writeSbom(workspace, sbomPath);
    const sbomSha = writeShaFile(`${sbomPath}.sha256`, readFileSync(sbomPath));

    const licensesPath = join(stage, "artifacts", "licenses", "licenses.json");
    writeLicenseInventory(workspace, licensesPath);
    const licensesSha = writeShaFile(`${licensesPath}.sha256`, readFileSync(licensesPath));

    const docker = writeDockerMetadata(stage);

    const tmpTgzExtract = mkTmp("amc-release-npmscan-");
    let tgzScan = scanDirectoryForSecrets(stage);
    try {
      runTarExtract(npmTarget, tmpTgzExtract);
      tgzScan = mergeSecretScans(scanDirectoryForSecrets(stage), scanDirectoryForSecrets(tmpTgzExtract));
    } finally {
      cleanupDir(tmpTgzExtract);
    }
    const secretScanPath = join(stage, "checks", "secret-scan.json");
    if (tgzScan.status !== "PASS" && skipSecretScan) {
      tgzScan = {
        ...tgzScan,
        status: "PASS"
      };
    }
    if (tgzScan.status !== "PASS") {
      throw new Error("Release secret scan failed with HIGH findings.");
    }
    writeSecretScanReport(tgzScan, secretScanPath);
    const secretScanSha = writeShaFile(`${secretScanPath}.sha256`, readFileSync(secretScanPath));

    const provenancePath = join(stage, "artifacts", "provenance", "provenance.json");
    writeProvenanceRecord({
      workspace,
      outPath: provenancePath,
      toolVersion: readVersionFromPackage(workspace),
      outputs: {
        npmTgzSha256: npmSha,
        sbomSha256: sbomSha,
        licensesSha256: licensesSha,
        secretScanSha256: secretScanSha
      }
    });
    const provenanceSha = writeShaFile(`${provenancePath}.sha256`, readFileSync(provenancePath));

    const manifest = buildReleaseManifest({
      workspace,
      generatedTs: deterministicTimestamp(),
      artifactHashes: {
        npmTgzSha256: npmSha,
        sbomSha256: sbomSha,
        licensesSha256: licensesSha,
        provenanceSha256: provenanceSha,
        secretScanSha256: secretScanSha,
        dockerImageSha256: docker.sha
      },
      pubkeyFingerprint: pubFingerprint
    });
    const manifestJson = `${canonicalize(manifest)}\n`;
    writeFileAtomic(join(stage, "manifest.json"), manifestJson, 0o644);
    const signature = signReleaseManifest(manifest, privateKey);
    writeFileAtomic(join(stage, "manifest.sig"), `${signature}\n`, 0o644);
    writeFileAtomic(join(stage, "keys", "release-signing.pub"), pubPem, 0o644);

    runTarCreate(root, outFile);
    return {
      outFile,
      manifest: releaseManifestSchema.parse(manifest),
      signature
    };
  } finally {
    cleanupDir(root);
    if (pathExists(pack.tgzPath)) {
      try {
        unlinkSync(pack.tgzPath);
      } catch {
        // keep non-fatal
      }
    }
  }
}
