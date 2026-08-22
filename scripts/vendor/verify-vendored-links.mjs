#!/usr/bin/env node
/**
 * Asserts every vendored package resolves to the workspace copy, never to a
 * registry package of the same name.
 *
 * ADR-0001 vendors the Cordis family so AMC owns its framework layer —
 * auditable, patchable, pinned. That guarantee is only real if resolution
 * actually reaches `vendor/`. A registry package published under one of these
 * names, or a stale lockfile entry, would silently swap the kernel out from
 * under the runtime, and nothing else in the build would notice.
 *
 * Mirrors dsh's gate of the same name (vendor/UPSTREAM_LEDGER_DSH.md).
 */
import { readFileSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const vendorDir = join(root, "vendor");
const failures = [];

const packages = readdirSync(vendorDir).filter((entry) =>
  existsSync(join(vendorDir, entry, "package.json"))
);

if (packages.length === 0) {
  console.error("verify-vendored-links: no vendored packages found under vendor/.");
  process.exit(1);
}

const expected = new Map();
for (const dir of packages) {
  const manifest = JSON.parse(readFileSync(join(vendorDir, dir, "package.json"), "utf8"));
  if (!manifest.name.startsWith("@amc/")) {
    failures.push(`vendor/${dir} is named ${manifest.name}; expected the @amc/ scope (ADR-0001).`);
    continue;
  }
  expected.set(manifest.name, join(vendorDir, dir));
}

// Every internal dependency among the vendored set must use the workspace
// protocol — a semver range would let the registry win.
for (const dir of packages) {
  const manifestPath = join(vendorDir, dir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!expected.has(name)) continue;
      if (!String(range).startsWith("workspace:")) {
        failures.push(
          `vendor/${dir}: ${field}.${name} is "${range}"; must be a workspace: range so it cannot resolve to the registry.`
        );
      }
    }
  }
}

// Every declared link must exist on disk and point inside vendor/.
for (const dir of packages) {
  const linkRoot = join(vendorDir, dir, "node_modules", "@amc");
  if (!existsSync(linkRoot)) continue;
  for (const linked of readdirSync(linkRoot)) {
    const target = realpathSync(join(linkRoot, linked));
    if (!target.startsWith(realpathSync(vendorDir))) {
      failures.push(
        `vendor/${dir}: @amc/${linked} resolves to ${target}, outside vendor/ — a registry copy has won.`
      );
    }
  }
}

// The lockfile must not carry a registry tarball for any vendored name.
const lockPath = join(root, "pnpm-lock.yaml");
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, "utf8");
  for (const name of expected.keys()) {
    const registryEntry = new RegExp(`^\\s+${name.replace("/", "\\/")}@(?!link:)`, "m");
    if (registryEntry.test(lock)) {
      failures.push(`pnpm-lock.yaml resolves ${name} from the registry rather than the workspace.`);
    }
  }
} else {
  failures.push("pnpm-lock.yaml is missing; vendored links cannot be verified.");
}

if (failures.length > 0) {
  console.error("Vendored link verification failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`All ${expected.size} vendored packages resolve to the workspace.`);
