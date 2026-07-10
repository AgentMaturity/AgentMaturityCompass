#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const installerRoot = resolve(root, process.env.AMC_DESKTOP_PACKAGE_OUT || "dist/installers");
const outputRoot = resolve(root, process.env.AMC_PUBLIC_RELEASE_OUT || "dist/release-assets");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const installerManifestPath = join(installerRoot, "manifest.json");

function fail(message) {
  throw new Error(message);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sourceCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function verifiedSource(pathValue, expectedDigest) {
  const path = resolve(root, pathValue);
  if (!path.startsWith(`${root}/`)) {
    fail(`release input escapes the repository: ${pathValue}`);
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`missing release input: ${pathValue}`);
  }
  const actualDigest = sha256(path);
  if (actualDigest !== expectedDigest) {
    fail(`release input digest mismatch: ${pathValue}`);
  }
  return path;
}

if (!existsSync(installerManifestPath)) {
  fail(`missing verified desktop installer manifest: ${relative(root, installerManifestPath)}`);
}

const installerManifest = JSON.parse(readFileSync(installerManifestPath, "utf8"));
if (installerManifest.packageName !== packageJson.name) {
  fail(`package name mismatch: ${installerManifest.packageName} != ${packageJson.name}`);
}
if (installerManifest.packageVersion !== packageJson.version) {
  fail(`package version mismatch: ${installerManifest.packageVersion} != ${packageJson.version}`);
}
if (!Array.isArray(installerManifest.packages) || installerManifest.packages.length !== 3) {
  fail("public release requires exactly the verified macOS, Linux, and Windows archives");
}

const sources = [
  verifiedSource(installerManifest.npmTarball.path, installerManifest.npmTarball.sha256),
  ...installerManifest.packages.map((item) => verifiedSource(item.archive.path, item.archive.sha256))
];

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const assets = sources.map((source) => {
  const name = basename(source);
  const destination = join(outputRoot, name);
  copyFileSync(source, destination);
  return {
    name,
    sha256: sha256(destination),
    bytes: statSync(destination).size
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const publicManifest = {
  schemaVersion: "2026-07-10",
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  tag: `v${packageJson.version}`,
  sourceCommit: sourceCommit(),
  channels: {
    githubRelease: "available",
    npm: "conditional",
    homebrew: "conditional"
  },
  assets
};

const publicManifestPath = join(outputRoot, "amc-release-manifest.json");
writeFileSync(publicManifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`);
assets.push({
  name: basename(publicManifestPath),
  sha256: sha256(publicManifestPath),
  bytes: statSync(publicManifestPath).size
});
assets.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  join(outputRoot, "SHA256SUMS"),
  `${assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n")}\n`
);

console.log(JSON.stringify({
  status: "passed",
  packageVersion: packageJson.version,
  output: relative(root, outputRoot),
  assets
}, null, 2));
