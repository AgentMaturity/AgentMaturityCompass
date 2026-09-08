import { existsSync, readFileSync } from "node:fs";
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

/**
 * Packages the build inlined into dist/kernel/amcRuntime.js (AMC-1510).
 *
 * They are not in any lockfile the consumer sees — that is the point of
 * bundling them — so an SBOM built from resolved dependencies alone would
 * omit exactly the code the published runtime ships. Read from the manifest
 * scripts/bundle-kernel.mjs writes beside the bundle; absent manifest, absent
 * bundle, nothing to add.
 */
function bundledRuntimeComponents(workspace: string): Array<Record<string, unknown>> {
  const manifestPath = join(workspace, "dist", "kernel", "amcRuntime.bundle.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    entry?: string;
    packages?: Array<{ name: string; version: string | null; license: string | null }>;
  };
  return (manifest.packages ?? []).map((entry) => ({
    type: "library",
    name: entry.name,
    version: entry.version ?? "0.0.0",
    purl: `pkg:npm/${encodeURIComponent(entry.name)}@${entry.version ?? "0.0.0"}`,
    licenses: [{ license: { id: entry.license ?? "UNKNOWN" } }],
    hashes: [],
    properties: [{ name: "amc:bundled-into", value: manifest.entry ?? "dist/kernel/amcRuntime.js" }]
  }));
}

export function generateCycloneDxSbom(workspace: string): Record<string, unknown> {
  // Reads whichever lockfile the workspace has. This module parsed
  // package-lock.json directly, so it could not produce an SBOM for AMC's own
  // repository once that moved to pnpm — the repository whose compliance
  // artifacts it exists to generate.
  const pkg = packageMeta(workspace);
  const components = readResolvedDependencies(workspace)
    .map((dependency): Record<string, unknown> => {
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
    .concat(bundledRuntimeComponents(workspace))
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
