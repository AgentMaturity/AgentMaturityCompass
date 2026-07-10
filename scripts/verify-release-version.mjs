#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const channel = JSON.parse(readFileSync(resolve(root, "website/install-channel.json"), "utf8"));
const unixInstaller = readFileSync(resolve(root, "website/install.sh"), "utf8");
const windowsInstaller = readFileSync(resolve(root, "website/install.ps1"), "utf8");

function fail(message) {
  throw new Error(message);
}

function matchVersion(source, pattern, label) {
  const match = pattern.exec(source);
  if (!match?.[1]) fail(`${label} does not declare a pinned release version`);
  return match[1];
}

const builtCli = spawnSync(process.execPath, [resolve(root, "dist/cli.js"), "--version"], {
  cwd: root,
  encoding: "utf8",
  timeout: 30_000
});
if (builtCli.status !== 0) {
  fail(`built CLI version check failed\n${builtCli.stdout}\n${builtCli.stderr}`);
}

const versions = {
  packageJson: packageJson.version,
  packageLock: packageLock.version,
  packageLockRoot: packageLock.packages?.[""]?.version,
  builtCli: builtCli.stdout.trim(),
  installChannel: channel.packageVersion,
  unixInstaller: matchVersion(unixInstaller, /PINNED_AMC_RELEASE_VERSION="([^"]+)"/, "Unix installer"),
  windowsInstaller: matchVersion(windowsInstaller, /\$PinnedAmcReleaseVersion = "([^"]+)"/, "Windows installer")
};

const expected = packageJson.version;
for (const [source, version] of Object.entries(versions)) {
  if (version !== expected) {
    fail(`release version mismatch: ${source}=${String(version)} expected=${expected}`);
  }
}

const tag = process.env.GITHUB_REF_NAME || process.env.AMC_RELEASE_TAG;
if (tag && tag !== `v${expected}`) {
  fail(`release tag mismatch: ${tag} expected=v${expected}`);
}

console.log(JSON.stringify({ status: "passed", version: expected, sources: versions, tag: tag ?? null }, null, 2));
