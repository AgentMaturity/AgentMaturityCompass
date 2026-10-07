import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { containedPath } from "../utils/pathSafety.js";
import { importedBenchmarksDir } from "./benchStore.js";
import { verifyBenchmarkArtifact } from "./benchVerify.js";
import { untrustedReasons, verdictExitCode, type TrustContext, type VerifierReportV1 } from "../trust/index.js";

/** One imported benchmark and the verifier report that admitted it. */
export interface ImportedBenchmark { benchId: string; dir: string; report: VerifierReportV1 }
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
}

/**
 * Throws unless the benchmark verifies, its signer is admitted (trusted, or integrity-only when the caller allowed it: a
 * federation import whose pinned peer vouches for the bytes) and its benchId stays inside imported/. Writes nothing, so
 * callers can check a whole batch before writing any of it.
 */
export function admitBenchmark(workspace: string, file: string, trust: TrustContext): ImportedBenchmark {
  const verify = verifyBenchmarkArtifact(file, trust);
  if (verdictExitCode(verify.report) === 1 || !verify.bench) {
    throw new Error(`Invalid benchmark '${file}': ${untrustedReasons(verify.report).join("; ")}`);
  }
  const benchId = verify.bench.benchId;
  const dir = containedPath(importedBenchmarksDir(workspace), "the imported benchmarks directory", benchId);
  return { benchId, dir, report: verify.report };
}

function importOne(workspace: string, file: string, trust: TrustContext): ImportedBenchmark {
  const admitted = admitBenchmark(workspace, file, trust);
  const targetDir = admitted.dir;
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
  return admitted;
}

/** Imports benchmarks whose signer the trust context admits (P0-09); the CLI and API pass the operator's AMC home trust. */
export function ingestBenchmarks(workspace: string, fileOrDir: string, trust: TrustContext): {
  imported: ImportedBenchmark[];
} {
  const target = resolve(workspace, fileOrDir);
  const imported: ImportedBenchmark[] = [];
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
      imported.push(importOne(workspace, join(target, entry.name), trust));
    }
    return { imported };
  }
  if (!target.endsWith(".amcbench")) {
    throw new Error(`Benchmark file must end with .amcbench: ${target}`);
  }
  imported.push(importOne(workspace, target, trust));
  return { imported };
}
