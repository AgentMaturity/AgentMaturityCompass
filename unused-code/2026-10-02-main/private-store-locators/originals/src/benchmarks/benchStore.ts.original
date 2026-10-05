import { readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentId } from "../fleet/paths.js";
import { ensureDir, pathExists, readUtf8 } from "../utils/fs.js";
import { benchmarkSchema, type BenchmarkArtifact } from "./benchSchema.js";

export function benchmarksDir(workspace: string): string {
  return join(workspace, ".amc", "benchmarks");
}

export function importedBenchmarksDir(workspace: string): string {
  return join(benchmarksDir(workspace), "imported");
}

export function benchmarkImportDir(workspace: string, benchId: string): string {
  return join(importedBenchmarksDir(workspace), benchId);
}

export function ensureBenchmarkDirs(workspace: string): void {
  ensureDir(importedBenchmarksDir(workspace));
}

export function listImportedBenchmarks(workspace: string): Array<{
  benchId: string;
  bench: BenchmarkArtifact;
  path: string;
}> {
  const dir = importedBenchmarksDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  const out: Array<{
    benchId: string;
    bench: BenchmarkArtifact;
    path: string;
  }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = join(dir, entry.name, "bench.json");
    if (!pathExists(file)) {
      continue;
    }
    try {
      const parsed = benchmarkSchema.parse(JSON.parse(readUtf8(file)) as unknown);
      out.push({
        benchId: parsed.benchId,
        bench: parsed,
        path: file
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.bench.createdTs - a.bench.createdTs);
}

export function defaultBenchAgentIdHash(workspace: string, agentId: string): string {
  const resolved = resolveAgentId(workspace, agentId);
  return `${resolved}`; // caller may hash before publishing; kept separate for deterministic override support
}

