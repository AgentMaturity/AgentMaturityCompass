#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyPublishedInstallerVersion } from "./lib/published-installer-version.mjs";

const root = resolve(process.cwd());
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
// The repo installs with pnpm (ADR-0001: the vendored manifests use the
// `workspace:` protocol, which npm cannot parse). pnpm-lock.yaml records no
// root package version, so there is no lockfile version to cross-check —
// its presence is what is verified instead.
const pnpmLockPath = resolve(root, "pnpm-lock.yaml");
if (!existsSync(pnpmLockPath)) {
  fail("pnpm-lock.yaml is missing; the workspace install is not reproducible.");
}
const channel = JSON.parse(readFileSync(resolve(root, "website/install-channel.json"), "utf8"));
const publishedInstallers = verifyPublishedInstallerVersion(root);

function fail(message) {
  throw new Error(message);
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
  builtCli: builtCli.stdout.trim(),
  installChannel: channel.packageVersion,
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

console.log(JSON.stringify({ status: "passed", version: expected, sources: versions, publishedInstallers, tag: tag ?? null }, null, 2));
