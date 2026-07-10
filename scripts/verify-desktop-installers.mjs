#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const outRoot = resolve(root, process.env.AMC_DESKTOP_PACKAGE_OUT || "dist/installers");
const manifestPath = join(outRoot, "manifest.json");

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000
  });
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function readArchiveEntry(archivePath, entry) {
  const command = archivePath.endsWith(".zip") ? "unzip" : "tar";
  const args = archivePath.endsWith(".zip")
    ? ["-p", archivePath, entry]
    : ["-xOzf", archivePath, entry];
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: null,
    timeout: 60_000,
    maxBuffer: 100 * 1024 * 1024
  });
  if (result.status !== 0) {
    fail(`could not read ${entry} from ${archivePath}\n${String(result.stderr ?? "")}`);
  }
  return result.stdout;
}

function assertArchiveContains(archivePath, entries) {
  const listing = archivePath.endsWith(".zip")
    ? run("unzip", ["-Z1", archivePath])
    : run("tar", ["-tzf", archivePath]);
  for (const entry of entries) {
    if (!listing.includes(entry)) {
      fail(`${archivePath} is missing ${entry}`);
    }
  }
}

if (!existsSync(manifestPath)) {
  fail(`missing desktop installer manifest: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.legalPosture?.includesCompetitorCode !== false) {
  fail("manifest must state that competitor code is not bundled");
}
if (manifest.legalPosture?.includesGitHubRepoSourceSnapshots !== false) {
  fail("manifest must state that GitHub repository source snapshots are not bundled");
}
if (manifest.legalPosture?.includesAcademicPaperText !== false) {
  fail("manifest must state that academic paper text is not bundled");
}
if (manifest.legalPosture?.includesArxivPdfContent !== false) {
  fail("manifest must state that arXiv/PDF content is not bundled");
}
if (manifest.legalPosture?.includesElectronRuntime !== false) {
  fail("manifest must state that Electron is not bundled");
}
if (manifest.legalPosture?.includesBundledBrowserRuntime !== false) {
  fail("manifest must state that a browser runtime is not bundled");
}

const tarballPath = resolve(root, manifest.npmTarball.path);
if (!existsSync(tarballPath)) {
  fail(`missing npm tarball: ${tarballPath}`);
}
if (sha256(tarballPath) !== manifest.npmTarball.sha256) {
  fail("npm tarball hash mismatch");
}

const tarballListing = run("tar", ["-tzf", tarballPath]);
for (const entry of ["package/package.json", "package/dist/cli.js", "package/scripts/postinstall.js", "package/LICENSE"]) {
  if (!tarballListing.includes(entry)) {
    fail(`npm tarball is missing ${entry}`);
  }
}

const requiredPlatforms = new Set(["macos-universal", "linux-x64", "windows-x64"]);
for (const pkg of manifest.packages ?? []) {
  requiredPlatforms.delete(pkg.platform);
  const archivePath = resolve(root, pkg.archive.path);
  if (!existsSync(archivePath)) {
    fail(`missing archive for ${pkg.platform}: ${archivePath}`);
  }
  if (sha256(archivePath) !== pkg.archive.sha256) {
    fail(`archive hash mismatch for ${pkg.platform}`);
  }
  const base = `amc-${manifest.packageVersion}-${pkg.platform}`;
  const platformEntries = pkg.kind === "windows"
    ? [
      `${base}/install.ps1`,
      `${base}/install.cmd`,
      `${base}/Agent Maturity Compass Studio.ps1`,
      `${base}/Agent Maturity Compass Studio.cmd`,
      `${base}/README.md`,
      `${base}/LEGAL_NOTICE.md`,
      `${base}/agent-maturity-compass-${manifest.packageVersion}.tgz`
    ]
    : [
      `${base}/install.sh`,
      `${base}/README.md`,
      `${base}/LEGAL_NOTICE.md`,
      `${base}/agent-maturity-compass-${manifest.packageVersion}.tgz`,
      ...(pkg.platform === "macos-universal"
        ? [
          `${base}/Agent Maturity Compass Studio.app/Contents/Info.plist`,
          `${base}/Agent Maturity Compass Studio.app/Contents/PkgInfo`,
          `${base}/Agent Maturity Compass Studio.app/Contents/MacOS/Agent Maturity Compass Studio`,
          `${base}/Agent Maturity Compass Studio.app/Contents/Resources/README.md`,
          `${base}/Agent Maturity Compass Studio.app/Contents/Resources/launch-studio.sh`
        ]
        : [])
    ];
  assertArchiveContains(archivePath, platformEntries);
  const packageEntry = `${base}/agent-maturity-compass-${manifest.packageVersion}.tgz`;
  const packagedTarball = readArchiveEntry(archivePath, packageEntry);
  if (createHash("sha256").update(packagedTarball).digest("hex") !== manifest.npmTarball.sha256) {
    fail(`nested npm tarball hash mismatch for ${pkg.platform}`);
  }
  const installerEntry = `${base}/${pkg.kind === "windows" ? "install.ps1" : "install.sh"}`;
  const installer = readArchiveEntry(archivePath, installerEntry).toString("utf8");
  if (!installer.includes(manifest.npmTarball.sha256)) {
    fail(`installer does not pin the nested npm tarball hash for ${pkg.platform}`);
  }
  if (pkg.kind === "windows" && !installer.includes("Get-FileHash")) {
    fail("Windows installer must verify the nested npm tarball with Get-FileHash");
  }
  if (pkg.kind !== "windows" && !installer.match(/sha256sum|shasum -a 256/)) {
    fail(`Unix installer must verify the nested npm tarball for ${pkg.platform}`);
  }
  if (pkg.platform === "macos-universal" && !pkg.appLaunchers?.some((launcher) => launcher.kind === "macos-app-bundle")) {
    fail("macOS package must declare the Studio app launcher in appLaunchers");
  }
  if (pkg.kind === "windows" && !pkg.appLaunchers?.some((launcher) => launcher.kind === "windows-command-launcher")) {
    fail("Windows package must declare the Studio command launcher in appLaunchers");
  }
}

if (requiredPlatforms.size > 0) {
  fail(`missing platform package(s): ${[...requiredPlatforms].join(", ")}`);
}

console.log(JSON.stringify({
  status: "passed",
  manifest: manifestPath,
  packageVersion: manifest.packageVersion,
  packageCount: manifest.packages.length,
  platforms: manifest.packages.map((pkg) => pkg.platform)
}, null, 2));
