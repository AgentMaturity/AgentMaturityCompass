import { copyFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { z } from "zod";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { benchArtifactSchema } from "./benchSchema.js";
import {
  benchImportsBenchesDir,
  benchImportsCacheDir
} from "./benchPolicyStore.js";
import { verifyBenchArtifactFile } from "./benchVerifier.js";

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
  const root = join(benchImportsCacheDir(workspace), registryId);
  return {
    indexPath: join(root, "index.json"),
    sigPath: join(root, "index.sig"),
    pubPath: join(root, "registry.pub")
  };
}

export function cacheRegistryIndex(params: {
  workspace: string;
  registryId: string;
  indexRaw: string;
  sigRaw: string;
  pubRaw: string;
}): {
  indexPath: string;
  sigPath: string;
  pubPath: string;
} {
  const paths = benchRegistryCachePath(params.workspace, params.registryId);
  ensureDir(dirname(paths.indexPath));
  writeFileAtomic(paths.indexPath, params.indexRaw, 0o644);
  writeFileAtomic(paths.sigPath, params.sigRaw, 0o644);
  writeFileAtomic(paths.pubPath, params.pubRaw, 0o644);
  return paths;
}

export function importedBenchPath(workspace: string, benchId: string, version: string): {
  dir: string;
  artifactPath: string;
  shaPath: string;
  metaPath: string;
  benchJsonPath: string;
} {
  const dir = join(benchImportsBenchesDir(workspace), benchId, version);
  return {
    dir,
    artifactPath: join(dir, "bench.amcbench"),
    shaPath: join(dir, "bench.amcbench.sha256"),
    metaPath: join(dir, "meta.json"),
    benchJsonPath: join(dir, "bench.json")
  };
}

export function storeImportedBench(params: {
  workspace: string;
  registryId: string;
  registryFingerprint: string;
  signerFingerprint: string;
  sourceUrl: string;
  version: string;
  file: string;
}): {
  meta: ImportedBenchMeta;
  artifactPath: string;
  metaPath: string;
} {
  const verified = verifyBenchArtifactFile({ file: params.file });
  if (!verified.ok || !verified.bench) {
    throw new Error(`cannot store imported bench; verification failed: ${verified.errors.map((e) => e.message).join("; ")}`);
  }
  const bench = benchArtifactSchema.parse(verified.bench);
  const target = importedBenchPath(params.workspace, bench.benchId, params.version);
  ensureDir(target.dir);
  copyFileSync(resolve(params.file), target.artifactPath);
  const digest = sha256Hex(readFileSync(target.artifactPath));
  writeFileAtomic(target.shaPath, `${digest}\n`, 0o644);
  writeFileAtomic(target.benchJsonPath, JSON.stringify(bench, null, 2), 0o644);
  const meta = importedBenchMetaSchema.parse({
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
  writeFileAtomic(target.metaPath, `${canonicalize(meta)}\n`, 0o644);
  return {
    meta,
    artifactPath: target.artifactPath,
    metaPath: target.metaPath
  };
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
