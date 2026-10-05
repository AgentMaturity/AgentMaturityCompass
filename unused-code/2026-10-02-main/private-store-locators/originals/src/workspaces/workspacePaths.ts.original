import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir, pathExists } from "../utils/fs.js";
import { normalizeWorkspaceId } from "./workspaceId.js";

export function hostDbPath(hostDir: string): string {
  return join(hostDir, "host.db");
}

export function hostLogsDir(hostDir: string): string {
  return join(hostDir, "logs");
}

export function hostTmpDir(hostDir: string): string {
  return join(hostDir, "tmp");
}

export function hostWorkspacesDir(hostDir: string): string {
  return join(hostDir, "workspaces");
}

export function hostDeletedWorkspacesDir(hostDir: string): string {
  return join(hostDir, "workspaces", "_deleted");
}

export function hostWorkspaceDir(hostDir: string, workspaceId: string): string {
  return join(hostWorkspacesDir(hostDir), normalizeWorkspaceId(workspaceId));
}

export function ensureHostDirLayout(hostDir: string): void {
  ensureDir(hostDir);
  ensureDir(hostLogsDir(hostDir));
  ensureDir(hostTmpDir(hostDir));
  ensureDir(hostWorkspacesDir(hostDir));
  ensureDir(hostDeletedWorkspacesDir(hostDir));
}

function normalizeInside(base: string, target: string): string {
  const rootResolved = resolve(base);
  ensureDir(rootResolved);
  const rootReal = realpathSync(rootResolved);
  const targetResolved = resolve(target);
  if (!pathExists(targetResolved)) {
    ensureDir(targetResolved);
  }
  const targetReal = realpathSync(targetResolved);
  if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}/`)) {
    throw new Error(`Path escape detected: ${targetReal} is outside ${rootReal}`);
  }
  return targetReal;
}

export function assertWorkspacePathInsideHost(hostDir: string, workspaceDir: string): string {
  return normalizeInside(hostDir, workspaceDir);
}

