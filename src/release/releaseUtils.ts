import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
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


export function mkTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupDir(path: string): void {
  if (pathExists(path)) {
    rmSync(path, { recursive: true, force: true });
  }
}

export function runChecked(
  cmd: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {}
): { stdout: string; stderr: string } {
  const out = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv }
  });
  if (out.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}\n${(out.stdout ?? "") + (out.stderr ?? "")}`);
  }
  return {
    stdout: out.stdout ?? "",
    stderr: out.stderr ?? ""
  };
}

export function runTarCreate(sourceDir: string, outputBundle: string): void {
  ensureDir(dirname(resolve(outputBundle)));
  const out = spawnSync("tar", ["-czf", outputBundle, "-C", sourceDir, "."], {
    encoding: "utf8"
  });
  if (out.status !== 0) {
    throw new Error(`Failed to create archive: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

export function runTarExtract(bundleFile: string, outputDir: string): void {
  extractValidatedTarGzipArchive({ file: bundleFile, destination: outputDir, label: "archive", limits: AMC_ARCHIVE_LIMITS });
  const out = { status: 0, stderr: "", stdout: "" };
  if (out.status !== 0) {
    throw new Error(`Failed to extract archive: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

export function collectFiles(rootDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile()) {
        out.push(relative(rootDir, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(rootDir);
  return out.sort((a, b) => a.localeCompare(b));
}

export function writeShaFile(path: string, bytes: Buffer): string {
  const digest = sha256Hex(bytes);
  writeFileAtomic(path, `${digest}\n`, 0o644);
  return digest;
}

export function fileSha256(path: string): string {
  return sha256Hex(readFileSync(path));
}

export function deterministicTimestamp(): number {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (!epoch) {
    return 0;
  }
  const parsed = Number(epoch);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.trunc(parsed) * 1000;
}
