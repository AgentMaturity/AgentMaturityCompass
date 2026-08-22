import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { packageMeta } from "./releaseManifest.js";
import { deterministicTimestamp } from "./releaseUtils.js";
import { readResolvedDependencies } from "./lockfileDependencies.js";

interface LockPackageEntry {
  version?: string;
}

interface PackageLockV2 {
  packages?: Record<string, LockPackageEntry>;
}

interface LicenseRow {
  name: string;
  version: string;
  license: string;
  licenseTextSha256: string | null;
  repository: string | null;
  homepage: string | null;
  reason?: string;
}

function parseNameFromPath(pathKey: string): string {
  const marker = "node_modules/";
  const idx = pathKey.lastIndexOf(marker);
  if (idx < 0) {
    return pathKey;
  }
  return pathKey.slice(idx + marker.length);
}

function findLicenseTextHash(depDir: string): string | null {
  if (!pathExists(depDir)) {
    return null;
  }
  const candidates = readdirSync(depDir)
    .filter((name) => /^license(\.|$)/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  if (candidates.length === 0) {
    return null;
  }
  const first = join(depDir, candidates[0]!);
  return sha256Hex(readFileSync(first));
}

export function generateLicenseInventory(workspace: string): Record<string, unknown> {
  const pkg = packageMeta(workspace);
  // Reads whichever lockfile the workspace has; see lockfileDependencies.ts.
  const rows: LicenseRow[] = [];
  for (const dependency of readResolvedDependencies(workspace)) {
    const name = dependency.name;
    const version = dependency.version;
    const depDir = join(workspace, "node_modules", name);
    let license = "UNKNOWN";
    let repository: string | null = null;
    let homepage: string | null = null;
    let reason: string | undefined;
    if (pathExists(join(depDir, "package.json"))) {
      try {
        const depPkg = JSON.parse(readFileSync(join(depDir, "package.json"), "utf8")) as {
          license?: string;
          repository?: string | { url?: string };
          homepage?: string;
        };
        if (depPkg.license && depPkg.license.trim().length > 0) {
          license = depPkg.license.trim();
        } else {
          reason = "missing license field";
        }
        if (typeof depPkg.repository === "string") {
          repository = depPkg.repository;
        } else if (depPkg.repository?.url) {
          repository = depPkg.repository.url;
        }
        homepage = depPkg.homepage ?? null;
      } catch {
        reason = "invalid package.json";
      }
    } else {
      reason = "dependency package.json not present in node_modules";
    }

    rows.push({
      name,
      version,
      license,
      licenseTextSha256: findLicenseTextHash(depDir),
      repository,
      homepage,
      ...(reason ? { reason } : {})
    });
  }

  rows.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
  const byLicense: Record<string, number> = {};
  for (const row of rows) {
    byLicense[row.license] = (byLicense[row.license] ?? 0) + 1;
  }
  const sortedByLicense = Object.fromEntries(Object.entries(byLicense).sort((a, b) => a[0].localeCompare(b[0])));
  return {
    v: 1,
    generatedTs: deterministicTimestamp(),
    root: {
      name: pkg.name,
      version: pkg.version
    },
    dependencies: rows,
    summary: {
      total: rows.length,
      byLicense: sortedByLicense
    }
  };
}

export function writeLicenseInventory(workspace: string, outPath: string): { path: string; json: Record<string, unknown> } {
  const report = generateLicenseInventory(workspace);
  writeFileAtomic(outPath, `${canonicalize(report)}\n`, 0o644);
  return { path: outPath, json: report };
}
