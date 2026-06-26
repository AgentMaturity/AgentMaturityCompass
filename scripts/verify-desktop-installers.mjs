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
    ? [`${base}/install.ps1`, `${base}/install.cmd`, `${base}/README.md`, `${base}/LEGAL_NOTICE.md`, `${base}/agent-maturity-compass-${manifest.packageVersion}.tgz`]
    : [`${base}/install.sh`, `${base}/README.md`, `${base}/LEGAL_NOTICE.md`, `${base}/agent-maturity-compass-${manifest.packageVersion}.tgz`];
  assertArchiveContains(archivePath, platformEntries);
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
