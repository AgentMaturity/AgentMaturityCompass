import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { importedBenchmarksDir } from "./benchStore.js";
import { verifyBenchmarkArtifact } from "./benchVerify.js";
import { extractValidatedTarGzipArchive, type TarArchiveLimits } from "../security/safeTarArchive.js";

/**
 * Extraction limits for AMC archives.
 *
 * Raw `tar -xzf` on an archive from outside the workspace is a path-traversal
 * and zip-bomb risk: a member named ../../etc/x escapes the destination, and a
 * small archive can expand without bound. These bounds mirror the ones the
 * passport and plugin verifiers already use.
 */
const AMC_ARCHIVE_LIMITS: TarArchiveLimits = {
  maxEntries: 10_000,
  maxCompressedBytes: 128 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 512 * 1024 * 1024,
  maxPathBytes: 1024,
};


function runTarExtract(bundleFile: string, outputDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outputDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
  const out = { status: 0, stderr: "", stdout: "" };
  if (out.status !== 0) {
    throw new Error(`Failed to extract benchmark artifact: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function importOne(workspace: string, file: string): { benchId: string; dir: string } {
  const verify = verifyBenchmarkArtifact(file);
  if (!verify.ok || !verify.bench) {
    throw new Error(`Invalid benchmark '${file}': ${verify.errors.join("; ")}`);
  }
  const benchId = verify.bench.benchId;
  const targetDir = join(importedBenchmarksDir(workspace), benchId);
  ensureDir(targetDir);
  const tmp = mkdtempSync(join(tmpdir(), "amc-bench-import-"));
  try {
    runTarExtract(file, tmp);
    const files = [
      "bench.json",
      "bench.sig",
      join("public-keys", "auditor.pub")
    ];
    for (const rel of files) {
      const src = join(tmp, rel);
      if (!pathExists(src)) {
        throw new Error(`Benchmark file missing during import: ${rel}`);
      }
      const dst = join(targetDir, rel);
      ensureDir(dirname(dst));
      writeFileAtomic(dst, readFileSync(src), 0o644);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return {
    benchId,
    dir: targetDir
  };
}

export function ingestBenchmarks(workspace: string, fileOrDir: string): {
  imported: Array<{ benchId: string; dir: string }>;
} {
  const target = resolve(workspace, fileOrDir);
  const imported: Array<{ benchId: string; dir: string }> = [];
  if (!pathExists(target)) {
    throw new Error(`Benchmark path not found: ${target}`);
  }
  const stat = statSync(target);
  if (stat.isDirectory()) {
    const dirEntries = readdirSync(target, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".amcbench")) {
        continue;
      }
      imported.push(importOne(workspace, join(target, entry.name)));
    }
    return { imported };
  }
  if (!target.endsWith(".amcbench")) {
    throw new Error(`Benchmark file must end with .amcbench: ${target}`);
  }
  imported.push(importOne(workspace, target));
  return { imported };
}
