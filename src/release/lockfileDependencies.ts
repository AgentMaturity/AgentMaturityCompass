/**
 * Reads a workspace's resolved dependency set from whichever lockfile it has.
 *
 * The SBOM and licence report both parsed `package-lock.json` directly. AMC's
 * own repository installs with pnpm (ADR-0001: the vendored Cordis manifests
 * use the `workspace:` protocol, which npm cannot parse — npm cannot even
 * generate a lockfile here), so both tools stopped working on the very
 * repository whose compliance artifacts they produce.
 *
 * A consumer's workspace may use either package manager, so this reads both
 * rather than swapping one hard-coded assumption for another.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists } from "../utils/fs.js";

export interface ResolvedDependency {
  name: string;
  version: string;
  /** Present only for npm lockfiles; pnpm records integrity per resolution. */
  integrity?: string;
  /**
   * SPDX id read from the installed package, not the lockfile.
   *
   * npm records `license` in the lock; pnpm does not. Reading it from
   * node_modules gives the same answer for both, and is the only source that
   * reflects what is actually installed.
   */
  license?: string;
}

interface NpmLockEntry {
  version?: string;
  integrity?: string;
}

interface NpmLock {
  packages?: Record<string, NpmLockEntry>;
}

function nameFromNpmPath(pathKey: string): string {
  const marker = "node_modules/";
  const index = pathKey.lastIndexOf(marker);
  return index < 0 ? pathKey : pathKey.slice(index + marker.length);
}

function fromNpmLock(raw: string): ResolvedDependency[] {
  const lock = JSON.parse(raw) as NpmLock;
  const out: ResolvedDependency[] = [];
  for (const [pathKey, entry] of Object.entries(lock.packages ?? {})) {
    if (pathKey === "") continue;
    out.push({
      name: nameFromNpmPath(pathKey),
      version: entry.version ?? "0.0.0",
      ...(entry.integrity ? { integrity: entry.integrity } : {})
    });
  }
  return out;
}

/**
 * Extracts package identities from a pnpm lockfile.
 *
 * pnpm keys its snapshots as `'<name>@<version>':` at two-space indentation
 * under `packages:`, where the name may be scoped and the version may carry a
 * peer-dependency suffix in parentheses. The suffix distinguishes resolutions
 * of the same package, so it is stripped for identity: an SBOM lists the
 * package version, not pnpm's resolution key.
 */
function fromPnpmLock(raw: string): ResolvedDependency[] {
  const out = new Map<string, ResolvedDependency>();
  const section = raw.split(/^packages:\s*$/m)[1];
  if (!section) return [];

  for (const match of section.matchAll(/^ {2}'?((?:@[^/'\s]+\/)?[^@'\s]+)@([^':\s]+)'?:/gm)) {
    const name = match[1]!;
    const version = match[2]!.replace(/\(.*\)$/, "");
    // Workspace links have no registry version to report.
    if (version.startsWith("link:") || version.startsWith("file:")) continue;
    out.set(`${name}@${version}`, { name, version });
  }
  return [...out.values()];
}

/**
 * Returns every resolved dependency, sorted by name then version.
 *
 * Throws when no lockfile exists: a release artifact derived from an unlocked
 * dependency set would be unreproducible, which is worse than no artifact.
 */
export function readResolvedDependencies(workspace: string): ResolvedDependency[] {
  const npmLock = join(workspace, "package-lock.json");
  const pnpmLock = join(workspace, "pnpm-lock.yaml");

  let deps: ResolvedDependency[];
  if (pathExists(npmLock)) {
    deps = fromNpmLock(readFileSync(npmLock, "utf8"));
  } else if (pathExists(pnpmLock)) {
    deps = fromPnpmLock(readFileSync(pnpmLock, "utf8"));
  } else {
    throw new Error(
      `no lockfile found in ${workspace}: expected package-lock.json or pnpm-lock.yaml. ` +
        `A release artifact built from an unlocked dependency set cannot be reproduced.`
    );
  }

  return deps
    .map((dependency) => {
      const installed = join(workspace, "node_modules", dependency.name, "package.json");
      if (!pathExists(installed)) return dependency;
      try {
        const manifest = JSON.parse(readFileSync(installed, "utf8")) as { license?: string };
        const license = typeof manifest.license === "string" ? manifest.license.trim() : "";
        return license.length > 0 ? { ...dependency, license } : dependency;
      } catch {
        // An unreadable manifest leaves the licence unknown rather than failing
        // the whole report.
        return dependency;
      }
    })
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}
