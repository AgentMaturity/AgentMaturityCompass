import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanLocal, type LocalScanResult } from "./localScanner.js";

export interface RepoScanResult extends LocalScanResult {
  repoUrl: string;
  clonedTo: string;
}

function cloneRepo(repoUrl: string, targetDir: string): void {
  const out = spawnSync("git", ["clone", "--depth", "1", "--", repoUrl, targetDir], {
    stdio: "pipe",
    timeout: 60_000,
    encoding: "utf8"
  });
  if (out.status !== 0) {
    const stderr = typeof out.stderr === "string" ? out.stderr.trim() : "";
    const stdout = typeof out.stdout === "string" ? out.stdout.trim() : "";
    const reason = stderr || stdout || `git exited with status ${out.status ?? "unknown"}`;
    throw new Error(reason);
  }
}

export function scanRepo(repoUrl: string): RepoScanResult {
  const tmpDir = mkdtempSync(join(tmpdir(), "amc-scan-"));
  try {
    cloneRepo(repoUrl, tmpDir);
    const result = scanLocal(tmpDir);
    return { ...result, repoUrl, clonedTo: tmpDir, path: repoUrl };
  } catch (e: any) {
    // Cleanup on error
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    throw new Error(`Failed to clone repo ${repoUrl}: ${e.message}`);
  }
}

export function cleanupRepoScan(result: RepoScanResult): void {
  try { rmSync(result.clonedTo, { recursive: true, force: true }); } catch {}
}
