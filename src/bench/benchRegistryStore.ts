import { withBenchImportLock } from "./benchImportLock.js";
import { copyFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { containedPath } from "../utils/pathSafety.js";
import { benchArtifactSchema, type BenchArtifact } from "./benchSchema.js";
import {
  benchImportsBenchesDir,
  benchImportsCacheDir
} from "./benchPolicyStore.js";
import { verifyBenchArtifactFile } from "./benchVerifier.js";
import type { TrustContext } from "../trust/trustContext.js";

const importedBenchMetaSchema = z.object({
  v: z.literal(1),
  benchId: z.string().min(1),
  version: z.string().min(1),
  importedTs: z.number().int(),
  registryId: z.string().min(1),
  registryFingerprint: z.string().length(64),
  signerFingerprint: z.string().length(64),
  trustLabel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  scopeType: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  sha256: z.string().length(64),
  sourceUrl: z.string().min(1)
});

export type ImportedBenchMeta = z.infer<typeof importedBenchMetaSchema>;

export function benchRegistryCachePath(workspace: string, registryId: string): {
  indexPath: string;
  sigPath: string;
  pubPath: string;
} {
  const root = containedPath(benchImportsCacheDir(workspace), "the bench registry cache directory", registryId);
  return {
    indexPath: join(root, "index.json"),
    sigPath: join(root, "index.sig"),
    pubPath: join(root, "registry.pub")
  };
}

export function importedBenchPath(workspace: string, benchId: string, version: string): {
  dir: string;
  artifactPath: string;
  shaPath: string;
  metaPath: string;
  benchJsonPath: string;
} {
  // benchId comes from a signed artifact and version from a signed index; neither may leave the imports directory (P0-52).
  const dir = containedPath(benchImportsBenchesDir(workspace), "the imported benches directory", benchId, version);
  return {
    dir,
    artifactPath: join(dir, "bench.amcbench"),
    shaPath: join(dir, "bench.amcbench.sha256"),
    metaPath: join(dir, "meta.json"),
    benchJsonPath: join(dir, "bench.json")
  };
}

/** Existing metadata recipe shared by the actual cache importer; it does not admit or sign keys. */
export function buildImportedBenchMeta(params: { registryId: string; registryFingerprint: string; signerFingerprint: string; sourceUrl: string; version: string },
  bench: BenchArtifact, digest: string): ImportedBenchMeta {
  return importedBenchMetaSchema.parse({
    v: 1,
    benchId: bench.benchId,
    version: params.version,
    importedTs: Date.now(),
    registryId: params.registryId,
    registryFingerprint: params.registryFingerprint,
    signerFingerprint: params.signerFingerprint,
    trustLabel: bench.evidence.trustLabel,
    scopeType: bench.scope.type,
    sha256: digest,
    sourceUrl: params.sourceUrl
  });
}

export function listImportedBenches(workspace: string): ImportedBenchMeta[] {
  const root = benchImportsBenchesDir(workspace);
  if (!pathExists(root)) {
    return [];
  }
  const out: ImportedBenchMeta[] = [];
  for (const benchIdEntry of readdirSync(root, { withFileTypes: true })) {
    if (!benchIdEntry.isDirectory()) continue;
    const benchDir = join(root, benchIdEntry.name);
    for (const versionEntry of readdirSync(benchDir, { withFileTypes: true })) {
      if (!versionEntry.isDirectory()) continue;
      const metaPath = join(benchDir, versionEntry.name, "meta.json");
      if (!pathExists(metaPath)) continue;
      try {
        out.push(importedBenchMetaSchema.parse(JSON.parse(readUtf8(metaPath)) as unknown));
      } catch {
        // skip malformed import metadata
      }
    }
  }
  return out.sort((a, b) => b.importedTs - a.importedTs || a.benchId.localeCompare(b.benchId));
}

export function readImportedBenchArtifact(params: {
  workspace: string;
  benchId: string;
  version: string;
}): {
  artifactPath: string;
  meta: ImportedBenchMeta;
} | null {
  const path = importedBenchPath(params.workspace, params.benchId, params.version);
  if (!pathExists(path.artifactPath) || !pathExists(path.metaPath)) {
    return null;
  }
  return {
    artifactPath: path.artifactPath,
    meta: importedBenchMetaSchema.parse(JSON.parse(readUtf8(path.metaPath)) as unknown)
  };
}

export function relativeImportedBenchPath(workspace: string, absoluteArtifactPath: string): string {
  return relative(workspace, absoluteArtifactPath).replace(/\\/g, "/");
}
