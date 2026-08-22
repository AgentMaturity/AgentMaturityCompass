import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageMeta } from "./releaseManifest.js";
import { deterministicTimestamp } from "./releaseUtils.js";
import { writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { readResolvedDependencies } from "./lockfileDependencies.js";

interface LockPackageEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  license?: string;
}

interface PackageLockV2 {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, LockPackageEntry>;
}

function parseNameFromPath(pathKey: string): string {
  const marker = "node_modules/";
  const idx = pathKey.lastIndexOf(marker);
  if (idx < 0) {
    return pathKey;
  }
  return pathKey.slice(idx + marker.length);
}

export function generateCycloneDxSbom(workspace: string): Record<string, unknown> {
  // Reads whichever lockfile the workspace has. This module parsed
  // package-lock.json directly, so it could not produce an SBOM for AMC's own
  // repository once that moved to pnpm — the repository whose compliance
  // artifacts it exists to generate.
  const pkg = packageMeta(workspace);
  const components = readResolvedDependencies(workspace)
    .map((dependency) => {
      const name = dependency.name;
      const version = dependency.version;
      const purlName = encodeURIComponent(name);
      return {
        type: "library",
        name,
        version,
        purl: `pkg:npm/${purlName}@${version}`,
        licenses: [
          {
            license: {
              id: dependency.license ?? "UNKNOWN"
            }
          }
        ],
        hashes: dependency.integrity
          ? [
              {
                alg: "SHA-512",
                content: dependency.integrity.replace(/^sha512-/, "")
              }
            ]
          : []
      };
    })
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: new Date(deterministicTimestamp()).toISOString(),
      component: {
        type: "application",
        name: pkg.name,
        version: pkg.version
      }
    },
    components
  };
}

export function writeSbom(workspace: string, outPath: string): { path: string; json: Record<string, unknown> } {
  const sbom = generateCycloneDxSbom(workspace);
  writeFileAtomic(outPath, `${canonicalize(sbom)}\n`, 0o644);
  return { path: outPath, json: sbom };
}
